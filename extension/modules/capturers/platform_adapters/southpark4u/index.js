/**
 * Video Subtitles Capturer - southpark4u.ru Capturer Module
 * Captures subtitles from southpark4u.ru players (player-venom / nextembed.ws / stravers.live).
 * Extracts WebVTT tracks defined in `source: { cc: [...] }` configurations.
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
   * Converts timestamp string (HH:MM:SS.mmm or MM:SS.mmm) to milliseconds.
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
   * Parses WebVTT content into an array of SubtitleCue objects.
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

  const SouthPark4uCapturer = {
    name: 'southpark4u',

    /**
     * Scans DOM / string / script tags for southpark4u / player-venom / stravers configs.
     * Looks for `source: { cc: [...] }` or `cc: [...]`.
     */
    detectConfigs: function(docOrString) {
      const found = [];
      const seenUrls = new Set();

      function extractFromContent(content) {
        if (!content || typeof content !== 'string') return;

        // Match source: { cc: [ ... ] } or cc: [ ... ]
        const ccRegex = /(?:['"]cc['"]|\bcc)\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/gi;
        let match;
        while ((match = ccRegex.exec(content)) !== null) {
          try {
            const rawArr = match[1];
            let parsed = null;
            try {
              parsed = JSON.parse(rawArr);
            } catch (_) {}

            if (Array.isArray(parsed)) {
              parsed.forEach((item, idx) => {
                const url = item.url || item.src;
                const name = item.name || item.title || item.label || `Track ${idx + 1}`;
                if (url && !seenUrls.has(url)) {
                  seenUrls.add(url);
                  found.push({ name, url });
                }
              });
            } else {
              // Regex fallback for loose JS objects
              const itemRegex = /\{[^{}]*?['"]?(?:url|src)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?['"]?(?:name|title|label)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?\}|\{[^{}]*?['"]?(?:name|title|label)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?['"]?(?:url|src)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?\}/gi;
              let itemMatch;
              while ((itemMatch = itemRegex.exec(rawArr)) !== null) {
                const url = itemMatch[1] || itemMatch[4];
                const name = itemMatch[2] || itemMatch[3] || 'Subtitles';
                if (url && !seenUrls.has(url)) {
                  seenUrls.add(url);
                  found.push({ name, url });
                }
              }
            }
          } catch (_) {}
        }

        // Generic .vtt links inside nextembed / stravers / southpark4u scripts
        const vttRegex = /['"](https?:\/\/[^'"]+?\.(?:vtt)(?:\?[^'"]*)?)['"]/gi;
        let vttMatch;
        while ((vttMatch = vttRegex.exec(content)) !== null) {
          const url = vttMatch[1];
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            found.push({ name: 'WebVTT Track', url });
          }
        }
      }

      if (typeof docOrString === 'string') {
        extractFromContent(docOrString);
      } else {
        const doc = docOrString || (typeof document !== 'undefined' ? document : null);
        if (doc) {
          const scripts = doc.querySelectorAll ? doc.querySelectorAll('script') : [];
          for (let i = 0; i < scripts.length; i++) {
            extractFromContent(scripts[i].textContent || '');
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
      const trackId = trackMeta.id || `southpark4u:${trackMeta.language || 'track'}_${Date.now()}`;
      const label = trackMeta.label || trackMeta.name || 'SouthPark4u Subtitles';
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
            tracks.push(this.parseVtt(vttText, { id: `southpark4u:${i}`, label: cfg.name, url: cfg.url }));
          } else if (typeof fetch !== 'undefined') {
            const res = await fetch(cfg.url);
            if (res.ok) {
              const vttText = await res.text();
              tracks.push(this.parseVtt(vttText, { id: `southpark4u:${i}`, label: cfg.name, url: cfg.url }));
            }
          }
        } catch (_) {}
      }

      return tracks;
    }
  };

  global.__SC.capturers['southpark4u'] = SouthPark4uCapturer;
  global.SubtitlesCapturers['southpark4u'] = SouthPark4uCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SouthPark4uCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
