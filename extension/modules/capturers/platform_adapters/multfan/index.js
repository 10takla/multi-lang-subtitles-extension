/**
 * Video Subtitles Capturer - mult-fan.tv Capturer Module
 * Captures subtitles from south-park.mult-fan.tv (Native Playerjs `#player1514`).
 * Parses `subtitle: "[Вкл.]url"` or comma-separated lists and loads WebVTT tracks.
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
   * Parses WebVTT content into SubtitleCue objects.
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

  const MultFanCapturer = {
    name: 'multfan',

    /**
     * Parses Playerjs subtitle string into array of { label, url }.
     * Example: "[Вкл.]https://south-park.mult-fan.tv/captions/eng/15/1514.vtt"
     * or "[Русский]sub_ru.vtt,[English]sub_en.vtt"
     */
    parseSubtitleConfig: function(configString) {
      if (!configString || typeof configString !== 'string') return [];
      const tracks = [];
      const parts = configString.split(',');

      parts.forEach((part, idx) => {
        const trimmed = part.trim();
        if (!trimmed) return;

        let label = `Дорожка ${idx + 1}`;
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
     * Detects Playerjs subtitle configurations from page scripts, DOM or window.Playerjs.
     */
    detectConfigs: function(docOrString) {
      const found = [];
      const seenUrls = new Set();

      function processSubtitleValue(val) {
        if (!val || typeof val !== 'string') return;
        const parsed = MultFanCapturer.parseSubtitleConfig(val);
        parsed.forEach(item => {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            found.push(item);
          }
        });
      }

      function scanContent(content) {
        if (!content || typeof content !== 'string') return;
        // Match subtitle: "..." or subtitles: "..."
        const matches = content.matchAll(/subtitle[s]?\s*:\s*['"]([^'"]+)['"]/gi);
        for (const m of matches) {
          processSubtitleValue(m[1]);
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

          // Check if window.playerjs or window.Playerjs exists with subtitle property
          if (typeof window !== 'undefined') {
            if (window.playerjs && window.playerjs.options && window.playerjs.options.subtitle) {
              processSubtitleValue(window.playerjs.options.subtitle);
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
      const trackId = trackMeta.id || `multfan:${trackMeta.language || 'track'}_${Date.now()}`;
      const label = trackMeta.label || 'Mult-fan Subtitles';
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
            tracks.push(this.parseVtt(vttText, { id: `multfan:${i}`, label: cfg.label, url: cfg.url }));
          } else if (typeof fetch !== 'undefined') {
            const res = await fetch(cfg.url);
            if (res.ok) {
              const vttText = await res.text();
              tracks.push(this.parseVtt(vttText, { id: `multfan:${i}`, label: cfg.label, url: cfg.url }));
            }
          }
        } catch (_) {}
      }

      return tracks;
    }
  };

  global.__SC.capturers['multfan'] = MultFanCapturer;
  global.SubtitlesCapturers['multfan'] = MultFanCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultFanCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
