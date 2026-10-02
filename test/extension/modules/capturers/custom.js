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
        const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }
        if (SC.renderLanguageList) SC.renderLanguageList();
        if (SC.prefetchUpcomingTranslations) {
          SC.prefetchUpcomingTranslations(activeVideo ? activeVideo.currentTime : 0, 60);
        }
      }
    } catch (_) {}
  };

  /**
   * Scans page scripts, config objects, and <track> elements for custom subtitle files.
   */
  SC.scanPageForSubtitleTracks = function() {
    const scripts = document.querySelectorAll('script');
    if (scripts.length === lastScriptScanCount && SC.customCaptionTracks.length > 0) return;
    lastScriptScanCount = scripts.length;

    scripts.forEach((s, idx) => {
      const content = s.textContent || '';
      if (!content || (!content.includes('subtitle') && !content.includes('.vtt') && !content.includes('.srt'))) return;

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
            const trackId = `custom:${idx}_${pIdx}`;
            if (!SC.customCaptionTracks.some(t => t.url === url)) {
              SC.customCaptionTracks.push({ id: trackId, label, url });
              SC.loadCustomSubtitleUrl(url, trackId, label);
            }
          }
        });
      }
    });

    const tracks = document.querySelectorAll('track[src]');
    tracks.forEach((tr, idx) => {
      const src = tr.src || tr.getAttribute('src');
      if (src) {
        const trackId = `custom:track_${idx}`;
        const label = tr.label || tr.srclang || `Дорожка ${idx + 1}`;
        if (!SC.customCaptionTracks.some(t => t.url === src)) {
          SC.customCaptionTracks.push({ id: trackId, label, url: src });
          SC.loadCustomSubtitleUrl(src, trackId, label);
        }
      }
    });
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
      if (match) {
        return { text: match.text, start: match.start };
      }
    }
    return null;
  };
})();
