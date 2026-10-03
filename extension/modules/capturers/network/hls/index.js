/**
 * Video Subtitles Capturer - HLS Capturer Module
 * Captures subtitles delivered via HTTP Live Streaming (RFC 8216).
 * Parses master playlist (#EXT-X-MEDIA:TYPE=SUBTITLES), media playlists, and WebVTT segment files.
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML tags and entities.
   */
  function cleanSubtitleText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /**
   * Converts timestamp string to milliseconds.
   */
  function timeStringToMs(timeStr) {
    if (!timeStr) return 0;
    const normalized = timeStr.trim().replace(',', '.');
    const parts = normalized.split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return Math.round((h * 3600 + m * 60 + s) * 1000);
    } else if (parts.length === 2) {
      const m = parseFloat(parts[0]) || 0;
      const s = parseFloat(parts[1]) || 0;
      return Math.round((m * 60 + s) * 1000);
    }
    const sec = parseFloat(timeStr) || 0;
    return Math.round(sec * 1000);
  }

  const HLSCapturer = {
    name: 'hls',

    /**
     * Parses master playlist m3u8 text for subtitle track definitions.
     */
    parseMasterPlaylist: function(m3u8Text, baseUrl = '') {
      if (!m3u8Text || typeof m3u8Text !== 'string') return [];
      const tracks = [];
      const lines = m3u8Text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=SUBTITLES')) {
          const nameMatch = line.match(/NAME=["']([^"']+)["']/i);
          const langMatch = line.match(/LANGUAGE=["']([^"']+)["']/i);
          const uriMatch = line.match(/URI=["']([^"']+)["']/i);
          const groupMatch = line.match(/GROUP-ID=["']([^"']+)["']/i);
          const defaultMatch = line.match(/DEFAULT=(YES|NO)/i);

          const name = nameMatch ? nameMatch[1] : `Subtitles ${i + 1}`;
          const lang = langMatch ? langMatch[1] : 'en';
          let uri = uriMatch ? uriMatch[1] : '';

          if (uri && baseUrl && !uri.startsWith('http')) {
            uri = new URL(uri, baseUrl).toString();
          }

          tracks.push({
            id: `hls:${groupMatch ? groupMatch[1] : 'sub'}_${lang}_${i}`,
            label: name,
            language: lang,
            uri: uri,
            isDefault: defaultMatch ? defaultMatch[1].toUpperCase() === 'YES' : false
          });
        }
      }

      return tracks;
    },

    /**
     * Parses media playlist m3u8 for WebVTT segments and durations.
     */
    parseMediaPlaylist: function(m3u8Text, baseUrl = '') {
      if (!m3u8Text || typeof m3u8Text !== 'string') return { segments: [], isLive: true };
      const lines = m3u8Text.split('\n');
      const segments = [];
      let isLive = true;
      let currentDuration = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-ENDLIST')) {
          isLive = false;
        } else if (line.startsWith('#EXTINF:')) {
          const durMatch = line.match(/#EXTINF:([\d.]+)/);
          currentDuration = durMatch ? parseFloat(durMatch[1]) : 0;
        } else if (line && !line.startsWith('#')) {
          let uri = line;
          if (baseUrl && !uri.startsWith('http')) {
            uri = new URL(uri, baseUrl).toString();
          }
          segments.push({
            uri: uri,
            durationSec: currentDuration
          });
          currentDuration = 0;
        }
      }

      return { segments, isLive };
    },

    /**
     * Parses a WebVTT segment with an absolute timeline offset in milliseconds.
     */
    parseVttSegment: function(vttText, timeOffsetMs = 0) {
      if (!vttText || typeof vttText !== 'string') return [];
      const cues = [];
      const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

      let currentStartMs = null;
      let currentEndMs = null;
      let textBuffer = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('-->')) {
          const parts = line.split('-->');
          currentStartMs = timeStringToMs(parts[0]) + timeOffsetMs;
          const endPart = parts[1].trim().split(/\s+/)[0];
          currentEndMs = timeStringToMs(endPart) + timeOffsetMs;
          textBuffer = [];
        } else if (currentStartMs !== null && line) {
          if (line.startsWith('NOTE') || line.startsWith('WEBVTT') || line.startsWith('STYLE')) {
            continue;
          }
          textBuffer.push(line);
        } else if (currentStartMs !== null && !line) {
          const cleaned = cleanSubtitleText(textBuffer.join(' '));
          if (cleaned) {
            cues.push({
              id: `hls_cue_${cues.length + 1}`,
              startMs: currentStartMs,
              endMs: currentEndMs,
              text: cleaned
            });
          }
          currentStartMs = null;
          currentEndMs = null;
          textBuffer = [];
        }
      }

      if (currentStartMs !== null && textBuffer.length > 0) {
        const cleaned = cleanSubtitleText(textBuffer.join(' '));
        if (cleaned) {
          cues.push({
            id: `hls_cue_${cues.length + 1}`,
            startMs: currentStartMs,
            endMs: currentEndMs,
            text: cleaned
          });
        }
      }

      return cues;
    },

    /**
     * Parses HLS playlist or segment text into SubtitleTrack.
     */
    parse: function(masterOrPlaylistText, options = {}) {
      if (!masterOrPlaylistText || typeof masterOrPlaylistText !== 'string') return null;

      if (masterOrPlaylistText.includes('-->') || masterOrPlaylistText.startsWith('WEBVTT')) {
        const cues = this.parseVttSegment(masterOrPlaylistText, options.timeOffsetMs || 0);
        return {
          id: options.id || 'hls_segment_track',
          language: options.language || 'en',
          label: options.label || 'HLS WebVTT Track',
          kind: 'subtitles',
          format: 'webvtt',
          source: 'hls',
          live: Boolean(options.live),
          completeness: options.live ? 'loaded-window' : 'full',
          cues: cues
        };
      }

      const tracks = this.parseMasterPlaylist(masterOrPlaylistText, options.baseUrl);
      return tracks.map(t => ({
        id: t.id,
        language: t.language,
        label: t.label,
        kind: 'subtitles',
        format: 'webvtt',
        source: 'hls',
        live: Boolean(options.live),
        completeness: 'unknown',
        cues: []
      }));
    },

    /**
     * Captures HLS subtitles asynchronously.
     */
    capture: async function(options = {}) {
      const tracks = [];
      if (options.masterPlaylistUrl) {
        try {
          const fetcher = options.fetchFn || (typeof fetch !== 'undefined' ? (u => fetch(u).then(r => r.text())) : null);
          if (fetcher) {
            const masterText = await fetcher(options.masterPlaylistUrl);
            const parsed = this.parse(masterText, { baseUrl: options.masterPlaylistUrl });
            if (Array.isArray(parsed)) {
              tracks.push(...parsed);
            }
          }
        } catch (_) {}
      }
      return tracks;
    }
  };

  global.__SC.capturers['hls'] = HLSCapturer;
  global.SubtitlesCapturers['hls'] = HLSCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HLSCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
