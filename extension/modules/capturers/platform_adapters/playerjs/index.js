/**
 * Video Subtitles Capturer - Playerjs Capturer Module
 * Universal capturer for websites using Playerjs (mult-fan.tv and many other streaming sites).
 * Extracts subtitle URLs from `subtitle:` / `subtitles:` configurations, Playerjs API, and DOM.
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
   * Parses WebVTT or SRT content into SubtitleCue objects.
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

  const PlayerjsCapturer = {
    name: 'playerjs',

    /**
     * Parses standard Playerjs config string:
     * "[Вкл.]https://...sub.vtt" or "[Русский]sub_ru.vtt,[English]sub_en.vtt"
     */
    parseConfigString: function(str) {
      if (!str || typeof str !== 'string') return [];
      const tracks = [];
      const parts = str.split(',');

      parts.forEach((p, idx) => {
        const trimmed = p.trim();
        if (!trimmed) return;

        let label = `Субтитры ${idx + 1}`;
        let url = trimmed;

        const match = trimmed.match(/^\[(.*?)\](.*)$/);
        if (match) {
          label = match[1].trim();
          url = match[2].trim();
        }

        if (url) {
          tracks.push({ label, url });
        }
      });

      return tracks;
    },

    /**
     * Scans DOM / page scripts / window.Playerjs for subtitle definitions.
     */
    detectConfigs: function(docOrString) {
      const found = [];
      const seenUrls = new Set();

      function addTrack(item) {
        if (item && item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          found.push(item);
        }
      }

      function scanContent(content) {
        if (!content || typeof content !== 'string') return;
        const matches = content.matchAll(/subtitle[s]?\s*:\s*['"]([^'"]+)['"]/gi);
        for (const m of matches) {
          const parsed = PlayerjsCapturer.parseConfigString(m[1]);
          parsed.forEach(addTrack);
        }
      }

      if (typeof docOrString === 'string') {
        scanContent(docOrString);
      } else {
        const doc = docOrString || (typeof document !== 'undefined' ? document : null);
        if (doc) {
          const scripts = doc.querySelectorAll ? doc.querySelectorAll('script') : [];
          for (let i = 0; i < scripts.length; i++) {
            scanContent(scripts[i].textContent || '');
          }

          if (typeof window !== 'undefined') {
            if (window.playerjs && window.playerjs.options && window.playerjs.options.subtitle) {
              const parsed = PlayerjsCapturer.parseConfigString(window.playerjs.options.subtitle);
              parsed.forEach(addTrack);
            }
          }
        }
      }

      return found;
    },

    /**
     * Parses raw WebVTT text into a normalized SubtitleTrack.
     */
    parseVtt: function(vttText, trackMeta = {}) {
      const cues = parseWebVttCues(vttText);
      const trackId = trackMeta.id || `playerjs:${trackMeta.language || 'track'}_${Date.now()}`;
      const label = trackMeta.label || 'Playerjs Subtitles';
      const lang = trackMeta.language || (label.toLowerCase().includes('eng') ? 'en' : (label.toLowerCase().includes('рус') ? 'ru' : 'unknown'));

      return {
        id: trackId,
        language: lang,
        label: label,
        kind: 'subtitles',
        format: 'webvtt',
        source: 'file',
        live: false,
        completeness: 'full',
        cues: cues
      };
    },

    /**
     * Parses text, config string, or pre-fetched payload into SubtitleTrack.
     */
    parse: function(rawTextOrData, options = {}) {
      if (typeof rawTextOrData === 'string') {
        if (rawTextOrData.includes('-->') || rawTextOrData.startsWith('WEBVTT')) {
          return this.parseVtt(rawTextOrData, options);
        }
        const detected = this.detectConfigs(rawTextOrData);
        if (detected.length > 0 && options.vttText) {
          return this.parseVtt(options.vttText, { ...detected[0], ...options });
        }
      }
      return this.parseVtt(rawTextOrData && rawTextOrData.vttText ? rawTextOrData.vttText : '', options);
    },

    /**
     * Captures subtitle tracks from current page or target options.
     */
    capture: async function(options = {}) {
      const tracks = [];
      const configs = options.configs || this.detectConfigs(options.document || (typeof document !== 'undefined' ? document : null));

      for (let i = 0; i < configs.length; i++) {
        const cfg = configs[i];
        try {
          if (options.fetchFn) {
            const vttText = await options.fetchFn(cfg.url);
            tracks.push(this.parseVtt(vttText, { id: `playerjs:${i}`, label: cfg.label, url: cfg.url }));
          } else if (typeof fetch !== 'undefined') {
            const res = await fetch(cfg.url);
            if (res.ok) {
              const vttText = await res.text();
              tracks.push(this.parseVtt(vttText, { id: `playerjs:${i}`, label: cfg.label, url: cfg.url }));
            }
          }
        } catch (_) {}
      }

      return tracks;
    }
  };

  global.__SC.capturers['playerjs'] = PlayerjsCapturer;
  global.SubtitlesCapturers['playerjs'] = PlayerjsCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayerjsCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
