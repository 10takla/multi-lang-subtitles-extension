/**
 * Video Subtitles Capturer - Coursera Capturer Module
 * Captures subtitles from Coursera video player:
 * 1. coursera.videoPlayer API
 * 2. window.__COURSERA_DATA__ (lesson and course video metadata)
 * 3. HTML5 video.textTracks / <track> elements with VTT/SRT
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML/XML formatting tags and HTML entities.
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
   * Handles HH:MM:SS.mmm, MM:SS.mmm, HH:MM:SS,mmm, seconds and milliseconds.
   */
  function timeStringToMs(timeStr) {
    if (typeof timeStr === 'number') {
      return timeStr < 1000 ? Math.round(timeStr * 1000) : Math.round(timeStr);
    }
    if (!timeStr || typeof timeStr !== 'string') return 0;
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

  /**
   * Parses WebVTT or SRT text into an array of SubtitleCue objects.
   */
  function parseVttOrSrtCues(text) {
    if (!text || typeof text !== 'string') return [];
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
            id: currentId || `coursera_cue_${cues.length + 1}`,
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
        if (!line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !line.startsWith('STYLE') && !line.startsWith('REGION')) {
          currentId = line;
        }
      }
    }

    if (currentStartMs !== null && textBuffer.length > 0) {
      const cleaned = cleanSubtitleText(textBuffer.join(' '));
      if (cleaned) {
        cues.push({
          id: currentId || `coursera_cue_${cues.length + 1}`,
          startMs: currentStartMs,
          endMs: currentEndMs,
          text: cleaned
        });
      }
    }

    return cues;
  }

  const CourseraCapturer = {
    name: 'coursera',

    /**
     * Traverses object tree to discover subtitle tracks in lesson / player metadata (__COURSERA_DATA__).
     */
    detectLessonMetadata: function(dataObj) {
      const target = dataObj || (typeof window !== 'undefined' ? window.__COURSERA_DATA__ : null);
      if (!target || typeof target !== 'object') return [];

      const foundTracks = [];
      const seenUrls = new Set();

      function walk(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return;

        // 1. Array of subtitle tracks, e.g. subtitleTracks: [ { language: 'en', label: 'English', url: '...' } ]
        if (Array.isArray(obj)) {
          obj.forEach(item => walk(item, depth + 1));
          return;
        }

        // Subtitles object with language keys, e.g. subtitles: { en: 'https://...', ru: '...' }
        if (obj.subtitles && typeof obj.subtitles === 'object') {
          if (!Array.isArray(obj.subtitles)) {
            Object.keys(obj.subtitles).forEach(lang => {
              const val = obj.subtitles[lang];
              if (typeof val === 'string' && !seenUrls.has(val)) {
                seenUrls.add(val);
                foundTracks.push({
                  id: `coursera:${lang}`,
                  language: lang,
                  label: `Coursera (${lang.toUpperCase()})`,
                  url: val,
                  source: 'lesson-metadata'
                });
              } else if (val && typeof val === 'object' && val.url && !seenUrls.has(val.url)) {
                seenUrls.add(val.url);
                foundTracks.push({
                  id: `coursera:${lang}`,
                  language: lang,
                  label: val.label || `Coursera (${lang.toUpperCase()})`,
                  url: val.url,
                  source: 'lesson-metadata'
                });
              }
            });
          } else {
            obj.subtitles.forEach((s, idx) => {
              const url = s.url || s.src;
              const lang = s.language || s.lang || s.locale || 'en';
              if (url && !seenUrls.has(url)) {
                seenUrls.add(url);
                foundTracks.push({
                  id: `coursera:${lang}_${idx}`,
                  language: lang,
                  label: s.label || s.name || `Coursera (${lang.toUpperCase()})`,
                  url: url,
                  source: 'lesson-metadata'
                });
              }
            });
          }
        }

        // 2. Direct subtitleTracks or tracks array
        const trackList = obj.subtitleTracks || obj.textTracks || obj.captions;
        if (Array.isArray(trackList)) {
          trackList.forEach((tr, idx) => {
            const url = tr.url || tr.src;
            const lang = tr.language || tr.srclang || tr.lang || 'en';
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              foundTracks.push({
                id: `coursera:${lang}_${idx}`,
                language: lang,
                label: tr.label || tr.name || `Coursera (${lang.toUpperCase()})`,
                url: url,
                cues: tr.cues,
                source: 'lesson-metadata'
              });
            } else if (Array.isArray(tr.cues) && tr.cues.length > 0) {
              foundTracks.push({
                id: `coursera:${lang}_${idx}`,
                language: lang,
                label: tr.label || tr.name || `Coursera (${lang.toUpperCase()})`,
                cues: tr.cues,
                source: 'lesson-metadata'
              });
            }
          });
        }

        // Recursive traversal for nested structures (course -> lesson -> video)
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            walk(obj[key], depth + 1);
          }
        }
      }

      walk(target);
      return foundTracks;
    },

    /**
     * Inspects coursera.videoPlayer API for tracks and cues.
     */
    detectPlayerApi: function(playerInstance) {
      const player = playerInstance || (typeof window !== 'undefined' && window.coursera ? window.coursera.videoPlayer : null);
      if (!player) return [];

      const tracks = [];

      // 1. getSubtitleTracks or getTextTracks
      const getTracksFn = player.getSubtitleTracks || player.getTextTracks || player.getTracks || player.getSubtitles;
      if (typeof getTracksFn === 'function') {
        try {
          const rawTracks = getTracksFn.call(player);
          if (Array.isArray(rawTracks)) {
            rawTracks.forEach((tr, idx) => {
              const lang = tr.language || tr.srclang || tr.lang || 'en';
              tracks.push({
                id: `coursera:${lang}_${idx}`,
                language: lang,
                label: tr.label || tr.name || `Coursera Player Track (${lang.toUpperCase()})`,
                kind: tr.kind || 'subtitles',
                url: tr.url || tr.src || null,
                cues: tr.cues || null,
                trackRef: tr,
                source: 'player-api'
              });
            });
          }
        } catch (_) {}
      }

      // 2. Direct player.options or player.subtitles inspection
      if (tracks.length === 0 && player.options) {
        if (Array.isArray(player.options.tracks)) {
          player.options.tracks.forEach((tr, idx) => {
            const lang = tr.language || tr.srclang || 'en';
            tracks.push({
              id: `coursera:${lang}_${idx}`,
              language: lang,
              label: tr.label || `Coursera Player Track (${lang.toUpperCase()})`,
              url: tr.src || tr.url || null,
              cues: tr.cues || null,
              source: 'player-api'
            });
          });
        }
      }

      return tracks;
    },

    /**
     * Inspects HTML5 video.textTracks and <track> elements for Coursera subtitles (VTT / SRT).
     */
    detectVideoTextTracks: function(videoOrDoc) {
      const tracks = [];
      const doc = videoOrDoc && videoOrDoc.querySelectorAll ? videoOrDoc : (typeof document !== 'undefined' ? document : null);
      if (!doc) return tracks;

      const videos = doc.tagName === 'VIDEO' ? [doc] : doc.querySelectorAll('video');
      videos.forEach((video, vIdx) => {
        if (video.textTracks && video.textTracks.length > 0) {
          for (let i = 0; i < video.textTracks.length; i++) {
            const tr = video.textTracks[i];
            const cues = [];
            if (tr.cues && tr.cues.length > 0) {
              for (let j = 0; j < tr.cues.length; j++) {
                const c = tr.cues[j];
                const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
                const cleaned = cleanSubtitleText(raw);
                if (cleaned) {
                  cues.push({
                    id: c.id || `cue_${j + 1}`,
                    startMs: Math.round(c.startTime * 1000),
                    endMs: Math.round(c.endTime * 1000),
                    text: cleaned
                  });
                }
              }
            }
            tracks.push({
              id: `coursera:video_${vIdx}_track_${i}`,
              language: tr.language || 'en',
              label: tr.label || `Coursera Video Track ${i + 1}`,
              kind: tr.kind || 'subtitles',
              cues: cues.length > 0 ? cues : null,
              source: 'player-api'
            });
          }
        }

        const trackEls = video.querySelectorAll('track');
        trackEls.forEach((el, elIdx) => {
          const src = el.src || el.getAttribute('src');
          if (src) {
            tracks.push({
              id: `coursera:video_${vIdx}_el_${elIdx}`,
              language: el.srclang || el.getAttribute('srclang') || 'en',
              label: el.label || el.getAttribute('label') || `Coursera Track ${elIdx + 1}`,
              kind: el.kind || el.getAttribute('kind') || 'subtitles',
              url: src,
              source: 'player-api'
            });
          }
        });
      });

      return tracks;
    },

    /**
     * Parses raw VTT/SRT text or structured object into SubtitleTrack.
     */
    parse: function(rawTextOrData, options = {}) {
      if (!rawTextOrData) return null;

      // 1. Raw string (WebVTT or SRT)
      if (typeof rawTextOrData === 'string') {
        const cues = parseVttOrSrtCues(rawTextOrData);
        const isSrt = rawTextOrData.includes(',') && /-->/.test(rawTextOrData);
        return {
          id: options.id || `coursera:${options.language || 'en'}`,
          language: options.language || 'en',
          label: options.label || 'Coursera Subtitles',
          kind: options.kind || 'subtitles',
          format: isSrt ? 'srt' : 'webvtt',
          source: options.source || 'player-api',
          live: false,
          completeness: 'full',
          cues: cues
        };
      }

      // 2. Structured track object with cues array
      if (typeof rawTextOrData === 'object') {
        const rawCues = rawTextOrData.cues || [];
        const cues = [];

        rawCues.forEach((c, idx) => {
          const startMs = typeof c.startMs === 'number'
            ? c.startMs
            : timeStringToMs(c.startTime !== undefined ? c.startTime : (c.start !== undefined ? c.start : 0));
          const endMs = typeof c.endMs === 'number'
            ? c.endMs
            : timeStringToMs(c.endTime !== undefined ? c.endTime : (c.end !== undefined ? c.end : 0));
          const cleaned = cleanSubtitleText(c.text || c.content || '');

          if (cleaned) {
            cues.push({
              id: c.id || `coursera_cue_${idx + 1}`,
              startMs: startMs,
              endMs: endMs,
              text: cleaned
            });
          }
        });

        const lang = rawTextOrData.language || rawTextOrData.lang || options.language || 'en';
        return {
          id: options.id || rawTextOrData.id || `coursera:${lang}`,
          language: lang,
          label: options.label || rawTextOrData.label || rawTextOrData.name || 'Coursera Subtitles',
          kind: options.kind || rawTextOrData.kind || 'subtitles',
          format: options.format || 'webvtt',
          source: options.source || rawTextOrData.source || 'player-api',
          live: false,
          completeness: cues.length > 0 ? 'full' : 'loaded-window',
          cues: cues
        };
      }

      return null;
    },

    /**
     * Unified capture method for Coursera platform.
     * Combines coursera.videoPlayer API, window.__COURSERA_DATA__, and video textTracks.
     */
    capture: async function(options = {}) {
      const tracks = [];
      const seenIds = new Set();

      // 1. coursera.videoPlayer API
      const playerTracks = this.detectPlayerApi(options.player);
      for (const pt of playerTracks) {
        if (pt.cues && Array.isArray(pt.cues) && pt.cues.length > 0) {
          const parsed = this.parse(pt, { source: 'player-api', ...options });
          if (parsed && !seenIds.has(parsed.id)) {
            seenIds.add(parsed.id);
            tracks.push(parsed);
          }
        } else if (pt.url) {
          try {
            const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
            if (fetchFn) {
              const res = await fetchFn(pt.url);
              const text = typeof res === 'string' ? res : (res.text ? await res.text() : '');
              const parsed = this.parse(text, { id: pt.id, language: pt.language, label: pt.label, source: 'player-api' });
              if (parsed && !seenIds.has(parsed.id)) {
                seenIds.add(parsed.id);
                tracks.push(parsed);
              }
            }
          } catch (_) {}
        }
      }

      // 2. window.__COURSERA_DATA__ lesson / course metadata
      const metaTracks = this.detectLessonMetadata(options.courseraData);
      for (const mt of metaTracks) {
        if (mt.cues && Array.isArray(mt.cues) && mt.cues.length > 0) {
          const parsed = this.parse(mt, { source: 'lesson-metadata', ...options });
          if (parsed && !seenIds.has(parsed.id)) {
            seenIds.add(parsed.id);
            tracks.push(parsed);
          }
        } else if (mt.url) {
          try {
            const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
            if (fetchFn) {
              const res = await fetchFn(mt.url);
              const text = typeof res === 'string' ? res : (res.text ? await res.text() : '');
              const parsed = this.parse(text, { id: mt.id, language: mt.language, label: mt.label, source: 'lesson-metadata' });
              if (parsed && !seenIds.has(parsed.id)) {
                seenIds.add(parsed.id);
                tracks.push(parsed);
              }
            }
          } catch (_) {}
        }
      }

      // 3. HTML5 video.textTracks / <track>
      const videoTracks = this.detectVideoTextTracks(options.document || options.video);
      for (const vt of videoTracks) {
        if (vt.cues && Array.isArray(vt.cues) && vt.cues.length > 0) {
          const parsed = this.parse(vt, { source: 'player-api', ...options });
          if (parsed && !seenIds.has(parsed.id)) {
            seenIds.add(parsed.id);
            tracks.push(parsed);
          }
        } else if (vt.url) {
          try {
            const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
            if (fetchFn) {
              const res = await fetchFn(vt.url);
              const text = typeof res === 'string' ? res : (res.text ? await res.text() : '');
              const parsed = this.parse(text, { id: vt.id, language: vt.language, label: vt.label, source: 'player-api' });
              if (parsed && !seenIds.has(parsed.id)) {
                seenIds.add(parsed.id);
                tracks.push(parsed);
              }
            }
          } catch (_) {}
        }
      }

      return tracks;
    }
  };

  global.__SC.capturers['coursera'] = CourseraCapturer;
  global.SubtitlesCapturers['coursera'] = CourseraCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CourseraCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
