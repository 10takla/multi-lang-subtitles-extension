/**
 * Video Subtitles Capturer - Direct File Capturer Module
 * Captures and parses standalone subtitle files: WebVTT (.vtt), SubRip (.srt), TTML / IMSC (.ttml, .dfxp, .xml).
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML/XML tags and unescapes common entities.
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
   * Handles:
   * 00:01:23.456 (WebVTT)
   * 00:01:23,456 (SRT)
   * 01:23.456 (Short VTT)
   * 12.34s, 1234ms (TTML)
   */
  function timeStringToMs(timeStr) {
    if (!timeStr) return 0;
    const str = timeStr.trim();

    if (str.endsWith('ms')) {
      return Math.round(parseFloat(str));
    }
    if (str.endsWith('s')) {
      return Math.round(parseFloat(str) * 1000);
    }

    const normalized = str.replace(',', '.');
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

    const sec = parseFloat(normalized) || 0;
    return Math.round(sec * 1000);
  }

  const FileCapturer = {
    name: 'file',

    /**
     * Parses WebVTT content.
     */
    parseVtt: function(text, options = {}) {
      if (!text || typeof text !== 'string') return null;
      const cues = [];
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

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
              id: currentId || `vtt_${cues.length + 1}`,
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
            id: currentId || `vtt_${cues.length + 1}`,
            startMs: currentStartMs,
            endMs: currentEndMs,
            text: cleaned
          });
        }
      }

      return {
        id: options.id || 'vtt_track',
        language: options.language || 'en',
        label: options.label || 'WebVTT Subtitles',
        kind: 'subtitles',
        format: 'webvtt',
        source: 'file',
        live: false,
        completeness: 'full',
        cues: cues
      };
    },

    /**
     * Parses SubRip (.srt) content.
     */
    parseSrt: function(text, options = {}) {
      if (!text || typeof text !== 'string') return null;
      const cues = [];
      const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].trim().split('\n');
        if (lines.length < 2) continue;

        let timeLineIdx = -1;
        for (let j = 0; j < lines.length; j++) {
          if (lines[j].includes('-->')) {
            timeLineIdx = j;
            break;
          }
        }
        if (timeLineIdx === -1) continue;

        const timeParts = lines[timeLineIdx].split('-->');
        const startMs = timeStringToMs(timeParts[0]);
        const endMs = timeStringToMs(timeParts[1]);

        const rawText = lines.slice(timeLineIdx + 1).join(' ');
        const cleaned = cleanSubtitleText(rawText);

        if (cleaned) {
          const id = timeLineIdx > 0 ? lines[0].trim() : `srt_${cues.length + 1}`;
          cues.push({
            id: id,
            startMs: startMs,
            endMs: endMs,
            text: cleaned
          });
        }
      }

      return {
        id: options.id || 'srt_track',
        language: options.language || 'en',
        label: options.label || 'SRT Subtitles',
        kind: 'subtitles',
        format: 'srt',
        source: 'file',
        live: false,
        completeness: 'full',
        cues: cues
      };
    },

    /**
     * Parses TTML / IMSC XML content.
     */
    parseTtml: function(xmlText, options = {}) {
      if (!xmlText || typeof xmlText !== 'string') return null;
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
            id: `ttml_${idx++}`,
            startMs: startMs,
            endMs: endMs,
            text: cleaned
          });
        }
      }

      return {
        id: options.id || 'ttml_track',
        language: options.language || 'en',
        label: options.label || 'TTML/IMSC Subtitles',
        kind: 'subtitles',
        format: 'ttml',
        source: 'file',
        live: false,
        completeness: 'full',
        cues: cues
      };
    },

    /**
     * Auto-detects format and parses subtitle text into SubtitleTrack.
     */
    parse: function(rawText, options = {}) {
      if (!rawText || typeof rawText !== 'string') return null;
      const trimmed = rawText.trim();

      if (trimmed.startsWith('WEBVTT') || trimmed.includes('-->') && !trimmed.includes(',')) {
        return this.parseVtt(trimmed, options);
      }
      if (trimmed.includes('<tt') || trimmed.includes('<p begin=')) {
        return this.parseTtml(trimmed, options);
      }
      if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/m.test(trimmed) || (trimmed.includes('-->') && trimmed.includes(','))) {
        return this.parseSrt(trimmed, options);
      }

      // Default fallback to WebVTT
      return this.parseVtt(trimmed, options);
    },

    /**
     * Captures subtitle file by URL or from options.
     */
    capture: async function(options = {}) {
      if (options.url) {
        try {
          if (options.fetchFn) {
            const text = await options.fetchFn(options.url);
            const track = this.parse(text, options);
            return track ? [track] : [];
          } else if (typeof fetch !== 'undefined') {
            const res = await fetch(options.url);
            if (res.ok) {
              const text = await res.text();
              const track = this.parse(text, options);
              return track ? [track] : [];
            }
          }
        } catch (_) {}
      }
      return [];
    }
  };

  global.__SC.capturers['file'] = FileCapturer;
  global.SubtitlesCapturers['file'] = FileCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
