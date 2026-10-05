/**
 * Video Subtitles Capturer - Custom Players Module
 * Captures subtitles from embedded configs and custom web players (Playerjs, JW Player, etc.)
 * Parses external WebVTT and SRT subtitle files and maintains active cues buffer.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.customCaptionTracks = [];
  SC.customActiveCues = [];
  SC.customTrackCues = new Map();

  let lastScriptScanCount = 0;

  /**
   * Helper to convert time strings (00:00:00.000 or 00:00:00,000) to seconds.
   */
  function timeStringToSeconds(str) {
    if (!str) return 0;
    const normalized = str.trim().replace(',', '.');
    const parts = normalized.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return 0;
  }

  /**
   * Parses WebVTT or SRT subtitle text into cue objects { start, end, text }.
   */
  SC.parseVttCues = function(text) {
    if (!text || typeof text !== 'string') return [];
    const cues = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let currentStart = null;
    let currentEnd = null;
    let currentTexts = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const times = line.split('-->');
        currentStart = timeStringToSeconds(times[0]);
        const endStr = times[1].trim().split(/\s+/)[0];
        currentEnd = timeStringToSeconds(endStr);
        currentTexts = [];
      } else if (currentStart !== null && line) {
        if (line.startsWith('NOTE') || line.startsWith('WEBVTT') || /^\d+$/.test(line)) continue;
        currentTexts.push(line);
      } else if (currentStart !== null && !line) {
        if (currentTexts.length > 0) {
          const cueText = SC.cleanText ? SC.cleanText(currentTexts.join(' ')) : currentTexts.join(' ').trim();
          if (cueText) {
            cues.push({ start: currentStart, end: currentEnd, text: cueText });
          }
        }
        currentStart = null;
        currentEnd = null;
        currentTexts = [];
      }
    }

    if (currentStart !== null && currentTexts.length > 0) {
      const cueText = SC.cleanText ? SC.cleanText(currentTexts.join(' ')) : currentTexts.join(' ').trim();
      if (cueText) {
        cues.push({ start: currentStart, end: currentEnd, text: cueText });
      }
    }
    return cues;
  };

  /**
   * Downloads and parses a subtitle file (.vtt or .srt) by URL.
   */
  SC.loadCustomSubtitleUrl = async function(url, trackId, label = 'Субтитры') {
    if (!url || SC.customTrackCues.has(trackId)) return;
    if (SC.setTrackLoading) SC.setTrackLoading(trackId, true);
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();
      const cues = SC.parseVttCues(text);
      if (cues && cues.length > 0) {
        SC.customTrackCues.set(trackId, cues);
        if (!SC.customActiveCues || SC.customActiveCues.length === 0) {
          SC.customActiveCues = cues;
        }
        const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
        docs.forEach(doc => {
          try {
            const videos = doc.querySelectorAll('video');
            videos.forEach(v => {
              if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(v);
            });
          } catch (_) {}
        });
        if (SC.renderLanguageList) SC.renderLanguageList();
        if (SC.prefetchUpcomingTranslations) {
          const vTime = (SC.getActiveVideo ? SC.getActiveVideo()?.currentTime : null) || 0;
          SC.prefetchUpcomingTranslations(vTime, 60);
        }
      }
    } catch (_) {} finally {
      if (SC.setTrackLoading) SC.setTrackLoading(trackId, false);
    }
  };

  /**
   * Scans page scripts, config objects, and <track> elements for custom subtitle files.
   */
  /**
   * Scans page scripts, config objects, and <track> elements for custom subtitle files.
   */
  SC.scanPageForSubtitleTracks = function() {
    const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
    let foundNew = false;

    docs.forEach((doc, docIdx) => {
      try {
        const scripts = doc.querySelectorAll('script');
        scripts.forEach((s, idx) => {
          const content = s.textContent || '';
          if (!content || (!content.includes('subtitle') && !content.includes('.vtt') && !content.includes('.srt') && !content.includes('cc:') && !/["']?cc["']?\s*:/i.test(content))) return;

          // 1. Match Playerjs / standard: subtitle[s]: "..."
          const matches = content.matchAll(/subtitle[s]?\s*:\s*['"]([^'"]+)['"]/gi);
          for (const m of matches) {
            const raw = m[1];
            const parts = raw.split(',');
            parts.forEach((p, pIdx) => {
              let label = 'Субтитры';
              let url = p.trim();
              const titleMatch = p.match(/\[(.*?)\](.*)/);
              if (titleMatch) {
                label = titleMatch[1].trim();
                url = titleMatch[2].trim();
              }
              if (url && (url.includes('.vtt') || url.includes('.srt') || url.startsWith('http') || url.startsWith('/'))) {
                const trackId = `custom:${docIdx}_${idx}_${pIdx}`;
                if (!SC.customCaptionTracks.some(t => t.url === url)) {
                  SC.customCaptionTracks.push({ id: trackId, label, url });
                  SC.loadCustomSubtitleUrl(url, trackId, label);
                  foundNew = true;
                }
              }
            });
          }

          // 2. Match source: { cc: [...] } or cc: [ { url: "...", name: "..." } ] (Lordfilm player 1, southpark4u, etc.)
          const ccMatches = content.matchAll(/(?:['"]cc['"]|\bcc)\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/gi);
          for (const m of ccMatches) {
            try {
              const rawArr = m[1];
              let parsed = null;
              try {
                parsed = JSON.parse(rawArr);
              } catch (_) {}

              let cIdx = 0;
              if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach(item => {
                  const url = item.url || item.src;
                  const name = item.name || item.title || item.label || 'Субтитры';
                  if (url && !SC.customCaptionTracks.some(t => t.url === url)) {
                    const trackId = `custom:cc_${docIdx}_${idx}_${cIdx++}`;
                    SC.customCaptionTracks.push({ id: trackId, label: name, url });
                    SC.loadCustomSubtitleUrl(url, trackId, name);
                    foundNew = true;
                  }
                });
              } else {
                const itemRegex = /\{[^{}]*?['"]?url['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?['"]?(?:name|title|label)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?\}|\{[^{}]*?['"]?(?:name|title|label)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?['"]?url['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?\}/gi;
                let itemMatch;
                while ((itemMatch = itemRegex.exec(rawArr)) !== null) {
                  const url = itemMatch[1] || itemMatch[4];
                  const name = itemMatch[2] || itemMatch[3] || 'Субтитры';
                  if (url && !SC.customCaptionTracks.some(t => t.url === url)) {
                    const trackId = `custom:cc_${docIdx}_${idx}_${cIdx++}`;
                    SC.customCaptionTracks.push({ id: trackId, label: name, url });
                    SC.loadCustomSubtitleUrl(url, trackId, name);
                    foundNew = true;
                  }
                }
              }
            } catch (_) {}
          }

          // 3. Generic VTT / SRT URLs in script configs
          const vttMatches = content.matchAll(/['"](https?:\/\/[^'"]+?\.(?:vtt|srt)(?:\?[^'"]*)?)['"]/gi);
          let vIdx = 0;
          for (const vm of vttMatches) {
            const url = vm[1];
            if (url && !SC.customCaptionTracks.some(t => t.url === url)) {
              const trackId = `custom:vtt_${docIdx}_${idx}_${vIdx++}`;
              SC.customCaptionTracks.push({ id: trackId, label: 'Субтитры', url });
              SC.loadCustomSubtitleUrl(url, trackId, 'Субтитры');
              foundNew = true;
            }
          }
        });

        // 4. Scan <track> elements
        const tracks = doc.querySelectorAll('track');
        tracks.forEach((tr, idx) => {
          const src = tr.src || tr.getAttribute('src');
          if (src) {
            const trackId = `custom:track_${docIdx}_${idx}`;
            const label = tr.label || tr.srclang || `Дорожка ${idx + 1}`;
            if (!SC.customCaptionTracks.some(t => t.url === src)) {
              SC.customCaptionTracks.push({ id: trackId, label, url: src });
              SC.loadCustomSubtitleUrl(src, trackId, label);
              foundNew = true;
            }
          }
        });
      } catch (_) {}
    });

    // If custom subtitle tracks were found, register all video elements immediately
    if (SC.customCaptionTracks.length > 0 && SC.registerVideoWithSubtitles) {
      docs.forEach(doc => {
        try {
          const videos = doc.querySelectorAll('video');
          videos.forEach(v => SC.registerVideoWithSubtitles(v));
        } catch (_) {}
      });
    }
  };

  /**
   * Returns list of detected custom player subtitle tracks.
   */
  SC.getCustomAvailableTracks = function() {
    const tracks = [];
    if (SC.customCaptionTracks && SC.customCaptionTracks.length > 0) {
      SC.customCaptionTracks.forEach((cTr, idx) => {
        tracks.push({
          value: cTr.id || `custom:${idx}`,
          label: `[Плеер] ${cTr.label || 'Субтитры ' + (idx + 1)}`
        });
      });
    }
    return tracks;
  };

  /**
   * Retrieves subtitle text from custom track cues at a specific playback timestamp.
   */
  SC.getCustomTrackTextAtTime = function(trackId, time) {
    if (!trackId || !trackId.startsWith('custom:')) return null;
    const cues = SC.customTrackCues.get(trackId);
    if (cues && cues.length > 0) {
      const match = cues.find(c => time >= c.start - 0.05 && time <= c.end + 0.05);
      if (match) return SC.cleanText ? SC.cleanText(match.text) : match.text;
    }
    return null;
  };

  /**
   * Collects upcoming cues from custom player tracks for timeline translation prefetching.
   */
  SC.getUpcomingCustomCues = function(t, maxTime, targetTrackId = null) {
    const list = [];
    const seen = new Set();

    if (targetTrackId && targetTrackId.startsWith('custom:')) {
      const cues = SC.customTrackCues.get(targetTrackId);
      if (cues && cues.length > 0) {
        for (let i = 0; i < cues.length; i++) {
          const c = cues[i];
          if (c.end >= t && c.start <= maxTime) {
            const raw = SC.cleanText ? SC.cleanText(c.text) : c.text;
            if (raw && !seen.has(raw)) {
              seen.add(raw);
              list.push({ start: c.start, end: c.end, text: raw });
            }
          }
        }
      }
    } else if (SC.customActiveCues && SC.customActiveCues.length > 0 && (!targetTrackId || targetTrackId === 'auto')) {
      for (let i = 0; i < SC.customActiveCues.length; i++) {
        const c = SC.customActiveCues[i];
        if (c.end >= t && c.start <= maxTime) {
          const raw = SC.cleanText ? SC.cleanText(c.text) : c.text;
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            list.push({ start: c.start, end: c.end, text: raw });
          }
        }
      }
    }
    return list;
  };

  /**
   * Returns active cue match at timestamp t from custom tracks.
   */
  SC.getCustomActiveCueAtTime = function(t) {
    if (SC.customActiveCues && SC.customActiveCues.length > 0) {
      const match = SC.customActiveCues.find(c => t >= c.start && t <= c.end);
      if (match && match.text && match.text.trim()) {
        return { text: match.text.trim(), start: match.start };
      }
    }
    return null;
  };

  const CustomCapturer = {
    name: 'custom',
    capture: async function(options = {}) {
      if (SC.scanPageForSubtitleTracks) {
        SC.scanPageForSubtitleTracks();
      }
      const tracks = [];
      if (SC.customCaptionTracks && SC.customCaptionTracks.length > 0) {
        SC.customCaptionTracks.forEach(cTr => {
          const cues = [];
          const rawCues = SC.customTrackCues.get(cTr.id) || [];
          rawCues.forEach((c, idx) => {
            const raw = SC.cleanText ? SC.cleanText(c.text || '') : (c.text || '');
            if (raw) {
              cues.push({
                id: `cue_${idx + 1}`,
                startMs: Math.round(c.start * 1000),
                endMs: Math.round(c.end * 1000),
                text: raw.trim()
              });
            }
          });
          tracks.push({
            id: cTr.id,
            language: cTr.label && cTr.label.toLowerCase().includes('eng') ? 'en' : (cTr.label && cTr.label.toLowerCase().includes('рус') ? 'ru' : 'unknown'),
            label: cTr.label || 'Кастомные субтитры',
            kind: 'subtitles',
            format: 'webvtt',
            source: 'file',
            live: false,
            completeness: cues.length > 0 ? 'full' : 'loaded-window',
            cues: cues
          });
        });
      }
      return tracks;
    },
    parse: function(rawVttText, options = {}) {
      const rawCues = SC.parseVttCues ? SC.parseVttCues(rawVttText) : [];
      const cues = rawCues.map((c, idx) => ({
        id: `cue_${idx + 1}`,
        startMs: Math.round(c.start * 1000),
        endMs: Math.round(c.end * 1000),
        text: (SC.cleanText ? SC.cleanText(c.text) : c.text).trim()
      }));
      return {
        id: options.id || 'custom_track',
        language: options.language || 'en',
        label: options.label || 'Custom Subtitles',
        kind: 'subtitles',
        format: 'webvtt',
        source: 'file',
        live: false,
        completeness: 'full',
        cues: cues
      };
    }
  };

  SC.capturers = SC.capturers || {};
  SC.capturers['custom'] = CustomCapturer;
  window.SubtitlesCapturers = window.SubtitlesCapturers || {};
  window.SubtitlesCapturers['custom'] = CustomCapturer;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomCapturer;
  }
})();

