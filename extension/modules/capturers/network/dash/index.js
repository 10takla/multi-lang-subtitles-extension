/**
 * Video Subtitles Capturer - DASH Capturer Module
 * Captures subtitles delivered via MPEG-DASH (ISO/IEC 23009-1).
 * Parses MPD XML manifest text tracks, segment URLs, and WebVTT / TTML subtitle chunks.
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML/XML tags and entities.
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
    const str = timeStr.trim();

    if (str.endsWith('ms')) return Math.round(parseFloat(str));
    if (str.endsWith('s')) return Math.round(parseFloat(str) * 1000);

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

  const DASHCapturer = {
    name: 'dash',

    /**
     * Parses MPD XML manifest for subtitle tracks.
     */
    parseMpd: function(mpdXmlText, baseUrl = '') {
      if (!mpdXmlText || typeof mpdXmlText !== 'string') return [];
      const tracks = [];

      const adaptRegex = /<AdaptationSet[^>]*?>([\s\S]*?)<\/AdaptationSet>/gi;
      let adaptMatch;
      let idx = 0;

      while ((adaptMatch = adaptRegex.exec(mpdXmlText)) !== null) {
        const setXml = adaptMatch[0];
        const isText = /contentType=["']text["']/i.test(setXml) ||
          /mimeType=["']text\/vtt["']/i.test(setXml) ||
          /mimeType=["']application\/ttml\+xml["']/i.test(setXml);

        if (isText) {
          const langMatch = setXml.match(/lang=["']([^"']+)["']/i);
          const mimeMatch = setXml.match(/mimeType=["']([^"']+)["']/i);
          const lang = langMatch ? langMatch[1] : 'en';
          const mime = mimeMatch ? mimeMatch[1] : 'text/vtt';
          const format = mime.includes('ttml') ? 'ttml' : 'webvtt';

          const baseMatch = setXml.match(/<BaseURL[^>]*?>([^<]+)<\/BaseURL>/i);
          let uri = baseMatch ? baseMatch[1].trim() : '';
          if (uri && baseUrl && !uri.startsWith('http')) {
            uri = new URL(uri, baseUrl).toString();
          }

          tracks.push({
            id: `dash:${lang}_${idx++}`,
            label: `DASH ${format.toUpperCase()} (${lang})`,
            language: lang,
            format: format,
            uri: uri
          });
        }
      }

      return tracks;
    },

    /**
     * Parses raw MPD XML or subtitle text chunk directly into SubtitleTrack.
     */
    parse: function(mpdXmlOrText, options = {}) {
      if (!mpdXmlOrText || typeof mpdXmlOrText !== 'string') return null;

      const trimmed = mpdXmlOrText.trim();

      if (trimmed.includes('<MPD')) {
        const tracks = this.parseMpd(trimmed, options.baseUrl);
        return tracks.map(t => ({
          id: t.id,
          language: t.language,
          label: t.label,
          kind: 'subtitles',
          format: t.format,
          source: 'dash',
          live: Boolean(options.live),
          completeness: 'unknown',
          cues: []
        }));
      }

      if (trimmed.includes('<tt') || trimmed.includes('<p begin=')) {
        const cues = [];
        const pRegex = /<p[^>]*?\bbegin=["']([^"']+)["'][^>]*?\bend=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/p>|<p[^>]*?\bend=["']([^"']+)["'][^>]*?\bbegin=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/p>/gi;
        let match;
        let cIdx = 1;

        while ((match = pRegex.exec(trimmed)) !== null) {
          const beginStr = match[1] || match[5];
          const endStr = match[2] || match[4];
          const rawText = match[3] || match[6];
          const cleaned = cleanSubtitleText(rawText);

          if (cleaned) {
            cues.push({
              id: `dash_ttml_${cIdx++}`,
              startMs: timeStringToMs(beginStr) + (options.timeOffsetMs || 0),
              endMs: timeStringToMs(endStr) + (options.timeOffsetMs || 0),
              text: cleaned
            });
          }
        }

        return {
          id: options.id || 'dash_ttml_track',
          language: options.language || 'en',
          label: options.label || 'DASH TTML Track',
          kind: 'subtitles',
          format: 'ttml',
          source: 'dash',
          live: Boolean(options.live),
          completeness: options.live ? 'loaded-window' : 'full',
          cues: cues
        };
      }

      return null;
    },

    /**
     * Captures DASH subtitle tracks asynchronously.
     */
    capture: async function(options = {}) {
      const tracks = [];
      if (options.manifestUrl) {
        try {
          const fetcher = options.fetchFn || (typeof fetch !== 'undefined' ? (u => fetch(u).then(r => r.text())) : null);
          if (fetcher) {
            const xml = await fetcher(options.manifestUrl);
            const parsed = this.parse(xml, { baseUrl: options.manifestUrl });
            if (Array.isArray(parsed)) {
              tracks.push(...parsed);
            }
          }
        } catch (_) {}
      }
      return tracks;
    }
  };

  global.__SC.capturers['dash'] = DASHCapturer;
  global.SubtitlesCapturers['dash'] = DASHCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DASHCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
