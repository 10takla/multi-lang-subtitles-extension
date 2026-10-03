/**
 * Video Subtitles Capturer - DRM / Protected Stream Capturer Module
 * Captures accessible unencrypted subtitle tracks from DRM-protected media (EME / Widevine / OTT / Netflix mock).
 * Subtitle streams are frequently delivered as separate unencrypted side-car files (WebVTT / TTML)
 * even when audio and video payloads are strictly encrypted.
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
   * Parses WebVTT text into SubtitleCue objects.
   */
  function parseWebVttCues(vttText) {
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
        currentStartMs = timeStringToMs(parts[0]);
        const endPart = parts[1].trim().split(/\s+/)[0];
        currentEndMs = timeStringToMs(endPart);
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
            id: currentId || `drm_cue_${cues.length + 1}`,
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
          id: currentId || `drm_cue_${cues.length + 1}`,
          startMs: currentStartMs,
          endMs: currentEndMs,
          text: cleaned
        });
      }
    }

    return cues;
  }

  /**
   * Parses TTML XML into SubtitleCue objects.
   */
  function parseTtmlCues(xmlText) {
    if (!xmlText || typeof xmlText !== 'string') return [];
    const cues = [];
    const pRegex = /<p[^>]*?\bbegin=["']([^"']+)["'][^>]*?\bend=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/p>|<p[^>]*?\bend=["']([^"']+)["'][^>]*?\bbegin=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/p>/gi;
    let match;
    let idx = 1;

    while ((match = pRegex.exec(xmlText)) !== null) {
      const beginStr = match[1] || match[5];
      const endStr = match[2] || match[4];
      const rawText = match[3] || match[6];

      const startMs = timeStringToMs(beginStr);
      const endMs = timeStringToMs(endStr);
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

  const DRMCapturer = {
    name: 'drm',

    /**
     * Inspects video elements, OTT player objects, or unencrypted textTracks.
     */
    detectTracks: function(videoOrDoc) {
      const tracks = [];
      const doc = videoOrDoc && videoOrDoc.querySelectorAll ? videoOrDoc : (typeof document !== 'undefined' ? document : null);

      if (doc) {
        const videos = doc.querySelectorAll('video');
        for (let vIdx = 0; vIdx < videos.length; vIdx++) {
          const video = videos[vIdx];
          if (video.textTracks) {
            for (let tIdx = 0; tIdx < video.textTracks.length; tIdx++) {
              const tr = video.textTracks[tIdx];
              tracks.push({
                id: `drm_track_${vIdx}_${tIdx}`,
                label: tr.label || tr.language || `Track ${tIdx + 1}`,
                language: tr.language || 'en',
                trackRef: tr
              });
            }
          }
        }
      }

      return tracks;
    },

    /**
     * Parses raw subtitle data (VTT / TTML / JSON timedtext) from DRM unencrypted side-car.
     */
    parse: function(rawTextOrData, options = {}) {
      if (typeof rawTextOrData !== 'string') return null;

      const trimmed = rawTextOrData.trim();
      const isTtml = trimmed.includes('<tt') || trimmed.includes('<p begin=');
      const isVtt = trimmed.includes('-->') || trimmed.startsWith('WEBVTT');

      let cues = [];
      let format = 'unknown';

      if (isTtml) {
        cues = parseTtmlCues(trimmed);
        format = 'ttml';
      } else if (isVtt) {
        cues = parseWebVttCues(trimmed);
        format = 'webvtt';
      }

      return {
        id: options.id || 'drm_unencrypted_track',
        language: options.language || 'en',
        label: options.label || 'DRM Sidecar Subtitles',
        kind: 'subtitles',
        format: format,
        source: 'player-api',
        live: false,
        completeness: 'full',
        cues: cues
      };
    },

    /**
     * Captures unencrypted subtitle tracks from DRM protected sessions.
     */
    capture: async function(options = {}) {
      const tracks = [];
      const detected = this.detectTracks(options.document || (typeof document !== 'undefined' ? document : null));

      detected.forEach(t => {
        const tr = t.trackRef;
        const cues = [];
        if (tr && tr.cues) {
          for (let i = 0; i < tr.cues.length; i++) {
            const c = tr.cues[i];
            const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
            const cleaned = cleanSubtitleText(raw);
            if (cleaned) {
              cues.push({
                id: c.id || `cue_${i + 1}`,
                startMs: Math.round(c.startTime * 1000),
                endMs: Math.round(c.endTime * 1000),
                text: cleaned
              });
            }
          }
        }

        tracks.push({
          id: t.id,
          language: t.language,
          label: t.label,
          kind: 'subtitles',
          format: 'webvtt',
          source: 'player-api',
          live: false,
          completeness: cues.length > 0 ? 'full' : 'loaded-window',
          cues: cues
        });
      });

      return tracks;
    }
  };

  global.__SC.capturers['drm'] = DRMCapturer;
  global.SubtitlesCapturers['drm'] = DRMCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DRMCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
