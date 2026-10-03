/**
 * Video Subtitles Capturer - Adaptive Streaming Capturer Module (HLS / DASH)
 * Captures subtitles delivered via HTTP Live Streaming (HLS) and MPEG-DASH.
 * Handles subtitle playlists (m3u8), MPD manifests, and segmented WebVTT / TTML / IMSC timed text.
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML tags, WebVTT tags and entities.
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

    // Handle '12.34s' or '1234ms' syntax
    if (normalized.endsWith('ms')) {
      return Math.round(parseFloat(normalized));
    }
    if (normalized.endsWith('s')) {
      return Math.round(parseFloat(normalized) * 1000);
    }

    const parts = normalized.split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]) || 0;
      const minutes = parseFloat(parts[1]) || 0;
      const seconds = parseFloat(parts[2]) || 0;
      return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
    } else if (parts.length === 2) {
      const minutes = parseFloat(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return Math.round((minutes * 60 + seconds) * 1000);
    }
    const sec = parseFloat(timeStr) || 0;
    return Math.round(sec * 1000);
  }

  /**
   * Parses WebVTT segment into SubtitleCue objects with optional time offset.
   */
  function parseWebVttSegment(vttText, timeOffsetMs = 0) {
    if (!vttText || typeof vttText !== 'string') return [];
    const cues = [];
    const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let currentStartMs = null;
    let currentEndMs = null;
    let currentId = null;
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
        const raw = textBuffer.join(' ');
        const cleaned = cleanSubtitleText(raw);
        if (cleaned) {
          cues.push({
            id: currentId || `cue_${cues.length + 1}`,
            startMs: currentStartMs,
            endMs: currentEndMs,
            text: cleaned
          });
        }
        currentStartMs = null;
        currentEndMs = null;
        currentId = null;
        textBuffer = [];
      } else if (line && !line.includes('-->') && currentStartMs === null) {
        if (!line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !line.startsWith('STYLE')) {
          currentId = line;
        }
      }
    }

    if (currentStartMs !== null && textBuffer.length > 0) {
      const cleaned = cleanSubtitleText(textBuffer.join(' '));
      if (cleaned) {
        cues.push({
          id: currentId || `cue_${cues.length + 1}`,
          startMs: currentStartMs,
          endMs: currentEndMs,
          text: cleaned
        });
      }
    }

    return cues;
  }

  /**
   * Parses TTML / IMSC XML segment into SubtitleCue objects.
   */
  function parseTtmlSegment(xmlText, timeOffsetMs = 0) {
    if (!xmlText || typeof xmlText !== 'string') return [];
    const cues = [];

    // Regex extraction for <p begin="..." end="...">Text</p>
    const pRegex = /<p[^>]*?\bbegin=["']([^"']+)["'][^>]*?\bend=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/p>|<p[^>]*?\bend=["']([^"']+)["'][^>]*?\bbegin=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/p>/gi;
    let match;
    let idx = 1;

    while ((match = pRegex.exec(xmlText)) !== null) {
      const beginStr = match[1] || match[5];
      const endStr = match[2] || match[4];
      const rawText = match[3] || match[6];

      const startMs = timeStringToMs(beginStr) + timeOffsetMs;
      const endMs = timeStringToMs(endStr) + timeOffsetMs;
      const cleaned = cleanSubtitleText(rawText);

      if (cleaned) {
        cues.push({
          id: `ttml_cue_${idx++}`,
          startMs: startMs,
          endMs: endMs,
          text: cleaned
        });
      }
    }

    return cues;
  }

  const StreamingCapturer = {
    name: 'streaming',

    /**
     * Parses HLS Master Playlist m3u8 text for subtitle tracks.
     * Looks for: #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="...",NAME="...",DEFAULT=...,LANGUAGE="...",URI="..."
     */
    parseHlsMasterPlaylist: function(m3u8Text, baseUrl = '') {
      if (!m3u8Text || typeof m3u8Text !== 'string') return [];
      const tracks = [];
      const lines = m3u8Text.split('\n');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#EXT-X-MEDIA:') && trimmed.includes('TYPE=SUBTITLES')) {
          const nameMatch = trimmed.match(/NAME=["']([^"']+)["']/i);
          const langMatch = trimmed.match(/LANGUAGE=["']([^"']+)["']/i);
          const uriMatch = trimmed.match(/URI=["']([^"']+)["']/i);
          const groupMatch = trimmed.match(/GROUP-ID=["']([^"']+)["']/i);
          const defaultMatch = trimmed.match(/DEFAULT=(YES|NO)/i);

          const name = nameMatch ? nameMatch[1] : `Subtitles ${idx + 1}`;
          const lang = langMatch ? langMatch[1] : 'unknown';
          let uri = uriMatch ? uriMatch[1] : '';

          if (uri && baseUrl && !uri.startsWith('http://') && !uri.startsWith('https://')) {
            uri = new URL(uri, baseUrl).toString();
          }

          tracks.push({
            id: `hls:${groupMatch ? groupMatch[1] : 'sub'}_${lang}_${idx}`,
            label: name,
            language: lang,
            uri: uri,
            isDefault: defaultMatch ? defaultMatch[1].toUpperCase() === 'YES' : false
          });
        }
      });

      return tracks;
    },

    /**
     * Parses DASH MPD XML manifest for subtitle AdaptationSets.
     */
    parseDashManifest: function(mpdXmlText, baseUrl = '') {
      if (!mpdXmlText || typeof mpdXmlText !== 'string') return [];
      const tracks = [];

      const adaptRegex = /<AdaptationSet[^>]*?>([\s\S]*?)<\/AdaptationSet>/gi;
      let adaptMatch;
      let adaptIdx = 0;

      while ((adaptMatch = adaptRegex.exec(mpdXmlText)) !== null) {
        const setXml = adaptMatch[0];
        const isText = /contentType=["']text["']/i.test(setXml) ||
          /mimeType=["']text\/vtt["']/i.test(setXml) ||
          /mimeType=["']application\/ttml\+xml["']/i.test(setXml) ||
          /mimeType=["']application\/mp4["']/i.test(setXml);

        if (isText) {
          const langMatch = setXml.match(/lang=["']([^"']+)["']/i);
          const mimeMatch = setXml.match(/mimeType=["']([^"']+)["']/i);
          const lang = langMatch ? langMatch[1] : 'en';
          const mime = mimeMatch ? mimeMatch[1] : 'text/vtt';
          const format = mime.includes('ttml') ? 'ttml' : 'webvtt';

          // Extract BaseURL or SegmentTemplate
          const baseMatch = setXml.match(/<BaseURL[^>]*?>([^<]+)<\/BaseURL>/i);
          let uri = baseMatch ? baseMatch[1].trim() : '';
          if (uri && baseUrl && !uri.startsWith('http')) {
            uri = new URL(uri, baseUrl).toString();
          }

          tracks.push({
            id: `dash:${lang}_${adaptIdx++}`,
            label: `DASH Subtitles (${lang})`,
            language: lang,
            format: format,
            uri: uri
          });
        }
      }

      return tracks;
    },

    /**
     * Parses raw manifest text or subtitle segment directly into SubtitleTrack.
     */
    parse: function(rawTextOrData, options = {}) {
      if (typeof rawTextOrData !== 'string') return null;

      const trimmed = rawTextOrData.trim();
      const isHls = trimmed.includes('#EXTM3U');
      const isDash = trimmed.includes('<MPD') || trimmed.includes('<tt') || trimmed.includes('<p begin=');
      const isVtt = trimmed.includes('-->') || trimmed.startsWith('WEBVTT');

      if (isVtt) {
        const cues = parseWebVttSegment(trimmed, options.timeOffsetMs || 0);
        return {
          id: options.id || 'streaming_vtt_track',
          language: options.language || 'en',
          label: options.label || 'Streaming VTT',
          kind: 'subtitles',
          format: 'webvtt',
          source: options.protocol === 'dash' ? 'dash' : 'hls',
          live: Boolean(options.live),
          completeness: options.live ? 'loaded-window' : 'full',
          cues: cues
        };
      }

      if (isDash && (trimmed.includes('<tt') || trimmed.includes('<p begin='))) {
        const cues = parseTtmlSegment(trimmed, options.timeOffsetMs || 0);
        return {
          id: options.id || 'streaming_ttml_track',
          language: options.language || 'en',
          label: options.label || 'Streaming TTML',
          kind: 'subtitles',
          format: 'ttml',
          source: 'dash',
          live: Boolean(options.live),
          completeness: options.live ? 'loaded-window' : 'full',
          cues: cues
        };
      }

      if (isHls) {
        const tracks = this.parseHlsMasterPlaylist(trimmed, options.baseUrl);
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
      }

      return null;
    },

    /**
     * Asynchronously captures streaming tracks from window or mock player.
     */
    capture: async function(options = {}) {
      const tracks = [];

      // Check if global streamingPlayer or player mock exists
      const player = options.player || (typeof window !== 'undefined' ? (window.streamingPlayer || window.hlsPlayer || window.dashPlayer) : null);

      if (player && typeof player.getManifestText === 'function') {
        const manifestText = player.getManifestText();
        const parsed = this.parse(manifestText, { live: player.isLive ? player.isLive() : false });
        if (Array.isArray(parsed)) {
          tracks.push(...parsed);
        } else if (parsed) {
          tracks.push(parsed);
        }
      }

      return tracks;
    }
  };

  global.__SC.capturers['streaming'] = StreamingCapturer;
  global.SubtitlesCapturers['streaming'] = StreamingCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StreamingCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
