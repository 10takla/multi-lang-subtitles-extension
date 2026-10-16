/**
 * Video Subtitles Capturer - YouTube Module
 * Isolated subtitle extraction via YouTube player response and TimedText API (JSON3/XML).
 * Operates without modifying player settings, toggling CC, or relying on DOM captions.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.ytCaptionTracks = [];
  SC.ytActiveCues = [];
  SC.ytTrackCues = new Map();

  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  const ytBridgeUrl = runtime?.getURL
    ? runtime.getURL('modules/capturers/platform_adapters/youtube/bridge.js')
    : new URL('bridge.js', document.currentScript.src).href;
  let ytBridgeInjected = false;
  let ytGeneration = 0;
  const pendingLoads = new Map();
  const retryAfter = new Map();
  let lastYtFetchTime = 0;
  let requestSequence = 0;

  function fetchTrackInPage(track) {
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}:${++requestSequence}`;
      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
      };
      const onMessage = event => {
        if (event.source !== window || event.data?.type !== '__SC_YT_TIMEDTEXT__' ||
            event.data.requestId !== requestId) return;
        cleanup();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.rawBody || '');
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('YouTube caption request timed out'));
      }, 23000);
      window.addEventListener('message', onMessage);
      window.postMessage({ type: '__SC_REQ_YT_TIMEDTEXT__', requestId, baseUrl: track.baseUrl }, '*');
    });
  }

  SC.isYouTubePage = function() {
    return location.hostname.includes('youtube.com') ||
      Boolean(document.getElementById('movie_player')) ||
      Boolean(document.querySelector('.html5-video-player'));
  };

  /**
   * Injects bridge script into page (MAIN world) to retrieve captionTracks
   * from YouTube player response without touching UI or player state.
   */
  SC.initYouTubeBridge = function() {
    if (!SC.isYouTubePage() || ytBridgeInjected) return;
    ytBridgeInjected = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.type !== '__SC_YT_TRACKS__') return;
      const tracks = event.data.tracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        SC.ytCaptionTracks = tracks;
        const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }
        if (SC.renderLanguageList) {
          SC.renderLanguageList();
        }
        if (SC.broadcastFrameUpdate) SC.broadcastFrameUpdate();

        // Auto-load primary track timedtext if not loaded yet
        const primaryTrack = tracks[0];
        const primaryTrackId = `yt:${primaryTrack.languageCode || 0}`;
        if (!SC.ytTrackCues.has(primaryTrackId)) {
          SC.loadYouTubeTimedText(primaryTrack, primaryTrackId);
        }
      }
    });

    // Chrome runs the packaged MAIN-world bridge from the manifest, avoiding
    // both page CSP and Trusted Types restrictions on script injection.
    window.postMessage({ type: '__SC_REQ_YT_TRACKS__' }, '*');
    if (runtime?.id && typeof runtime.getBrowserInfo !== 'function') return;

    // Standalone fixtures and Firefox versions without MAIN-world support.
    try {
      const script = document.createElement('script');
      script.src = ytBridgeUrl;
      script.onload = () => script.remove();
      script.onerror = () => {
        script.remove();
        console.warn('[Subtitles] YouTube bridge failed to load');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (err) {
      console.warn('[Subtitles] YouTube bridge injection failed:', err);
    }
  };

  /**
   * Directly extracts captionTracks from YouTube's static page scripts (DOM).
   * Operates safely within content script context without CSP violations.
   */
  SC.extractYouTubeTracksFromDOM = function() {
    if (!SC.isYouTubePage()) return [];
    if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    try {
      const scripts = document.scripts;
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent;
        if (!text || !text.includes('captionTracks')) continue;

        const idx = text.indexOf('"captionTracks":');
        if (idx !== -1) {
          const start = text.indexOf('[', idx);
          if (start !== -1) {
            let depth = 0;
            let end = -1;
            for (let j = start; j < text.length; j++) {
              if (text[j] === '[') depth++;
              else if (text[j] === ']') {
                depth--;
                if (depth === 0) {
                  end = j + 1;
                  break;
                }
              }
            }
            if (end !== -1) {
              const jsonStr = text.slice(start, end);
              try {
                const parsed = JSON.parse(jsonStr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  SC.ytCaptionTracks = parsed;
                  return parsed;
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
    return [];
  };

  /**
   * Request caption tracks from DOM scripts or bridge, or return cached list.
   */
  SC.fetchYouTubeCaptionTracks = function() {
    if (!SC.isYouTubePage()) return [];
    if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    // 1. Direct extraction from static DOM scripts
    const extracted = SC.extractYouTubeTracksFromDOM();
    if (extracted && extracted.length > 0) {
      SC.ytCaptionTracks = extracted;
      const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
      if (activeVideo && SC.registerVideoWithSubtitles) {
        SC.registerVideoWithSubtitles(activeVideo);
      }
      return extracted;
    }

    // 2. Fallback to bridge
    SC.initYouTubeBridge();

    const now = Date.now();
    if (now - lastYtFetchTime >= 1000) {
      lastYtFetchTime = now;
      try {
        window.postMessage({ type: '__SC_REQ_YT_TRACKS__' }, '*');
      } catch (_) {}
    }

    return SC.ytCaptionTracks || [];
  };

  // Handle YouTube SPA in-page video switches
  const handleYtNav = () => {
    ytGeneration++;
    if (SC.setTrackLoading) {
      for (const trackId of pendingLoads.keys()) SC.setTrackLoading(trackId, false);
    }
    pendingLoads.clear();
    retryAfter.clear();
    SC.ytCaptionTracks = [];
    SC.ytActiveCues = [];
    SC.ytTrackCues.clear();
    setTimeout(() => {
      SC.fetchYouTubeCaptionTracks();
      const video = document.querySelector('video');
      if (video && SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(video)) {
        SC.registerVideoWithSubtitles(video);
      }
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
    }, 400);
  };
  document.addEventListener('yt-navigate-finish', handleYtNav);
  document.addEventListener('yt-page-data-updated', () => {
    if (SC.isYouTubePage()) SC.fetchYouTubeCaptionTracks();
  });

  /**
   * Parses YouTube TimedText JSON3 object into cue array.
   */
  SC.parseYouTubeJson3 = function(data) {
    if (!data || !Array.isArray(data.events)) return [];
    return data.events
      .filter(e => e.segs && e.segs.length > 0)
      .map(e => ({
        start: (e.tStartMs || 0) / 1000,
        end: ((e.tStartMs || 0) + (e.dDurationMs || 0)) / 1000,
        text: SC.cleanText ? SC.cleanText(e.segs.map(s => s.utf8 || '').join('')) : e.segs.map(s => s.utf8 || '').join('').trim()
      }))
      .filter(c => c.text && c.text.length > 0);
  };

  /**
   * Parses YouTube TimedText XML string into cue array.
   */
  SC.parseYouTubeXml = function(xmlText) {
    if (!xmlText) return [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const textNodes = xmlDoc.querySelectorAll('text');
      const cues = [];
      if (textNodes && textNodes.length > 0) {
        textNodes.forEach(node => {
          const start = parseFloat(node.getAttribute('start') || '0');
          const dur = parseFloat(node.getAttribute('dur') || '0');
          const clean = SC.cleanText ? SC.cleanText(node.textContent || '') : (node.textContent || '').trim();
          if (clean) {
            cues.push({ start, end: start + dur, text: clean });
          }
        });
      }
      return cues;
    } catch (_) {
      return [];
    }
  };

  function activateYouTubeCues(trackId, cues) {
    const firstTrack = SC.state?.languages?.find(item =>
      (item.mode === 'track' || item.type === 'source') && (item.trackId || item.lang));
    const firstTrackId = (firstTrack && (firstTrack.trackId || firstTrack.lang)) || 'auto';
    if (firstTrackId === trackId || firstTrackId === 'auto' || !SC.ytActiveCues?.length) {
      SC.ytActiveCues = cues;
    }
  }

  /**
   * Fetch and parse the complete caption track without enabling native captions.
   */
  SC.loadYouTubeTimedText = async function(track, trackId = null) {
    if (!track || !track.baseUrl) return;
    const tId = trackId || `yt:${track.languageCode || ''}`;

    if (SC.ytTrackCues.has(tId)) {
      activateYouTubeCues(tId, SC.ytTrackCues.get(tId));
      return;
    }
    if (pendingLoads.has(tId)) return pendingLoads.get(tId);
    if (Date.now() < (retryAfter.get(tId) || 0)) return;
    const generation = ytGeneration;
    const request = (async () => {
      if (SC.setTrackLoading) SC.setTrackLoading(tId, true);
      try {
        let rawBody;
        if (runtime?.id) {
          SC.initYouTubeBridge();
          rawBody = await fetchTrackInPage(track);
        } else {
          const url = new URL(track.baseUrl);
          url.searchParams.set('fmt', 'json3');
          const response = await fetch(url.href);
          if (!response.ok) throw new Error(`Timed text request failed: ${response.status}`);
          rawBody = await response.text();
        }
        let cues = [];

        // Try JSON3 parsing first, then fallback to XML
        try {
          const data = JSON.parse(rawBody);
          cues = SC.parseYouTubeJson3(data);
        } catch (_) {
          cues = SC.parseYouTubeXml(rawBody);
        }

        if (generation !== ytGeneration) return;
        if (!cues.length) {
          retryAfter.set(tId, Date.now() + 15000);
          console.warn('[Subtitles] YouTube returned no cues:', { bytes: rawBody.length });
        }
        if (cues && cues.length > 0) {
          SC.ytTrackCues.set(tId, cues);

          activateYouTubeCues(tId, cues);

          const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
          if (activeVideo && SC.registerVideoWithSubtitles) {
            SC.registerVideoWithSubtitles(activeVideo);
          }

          if (SC.state && SC.state.lines) {
            SC.state.lines.forEach(l => {
              if (!l.trackTexts) l.trackTexts = {};
              if (!l.trackTexts[tId]) {
                const match = cues.find(c => l.rawTime >= c.start && l.rawTime <= c.end);
                if (match) l.trackTexts[tId] = match.text;
              }
            });
          }

          if (SC.state && SC.state.languages) {
            SC.state.languages.forEach(item => {
              if (item.sourceFrom === tId && SC.retranslateItem) {
                SC.retranslateItem(item);
              }
            });
          }

          if (SC.renderAllLines) {
            SC.renderAllLines();
          }

          // Prefetch translations 30-60 seconds ahead
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
          }
        }
      } catch (err) {
        if (generation === ytGeneration) retryAfter.set(tId, Date.now() + 15000);
        console.warn('Timed text load error:', err);
      } finally {
        if (generation === ytGeneration) {
          pendingLoads.delete(tId);
          if (SC.setTrackLoading) SC.setTrackLoading(tId, false);
        }
      }
    })();
    pendingLoads.set(tId, request);
    return request;
  };

  /**
   * Get subtitle text for a given YouTube track at a specific timestamp.
   */
  SC.getYouTubeTrackTextAtTime = function(trackId, time) {
    const cues = SC.ytTrackCues.get(trackId);
    if (cues && cues.length > 0) {
      const match = cues.find(c => time >= c.start - 0.05 && time <= c.end + 0.05);
      if (match && match.text) {
        const cleaned = SC.cleanText ? SC.cleanText(match.text) : match.text.trim();
        return cleaned || null;
      }
    }
    return null;
  };

  /**
   * Get active cue at current playback time.
   */
  SC.getYouTubeActiveCueAtTime = function(time) {
    if (!SC.ytActiveCues || SC.ytActiveCues.length === 0) return null;
    const match = SC.ytActiveCues.find(c => time >= c.start && time <= c.end);
    if (match && match.text && match.text.trim()) {
      return { text: match.text.trim(), start: match.start, end: match.end };
    }
    return null;
  };

  /**
   * Collect upcoming YouTube cues within bufferSeconds ahead of currentTime for prefetching.
   */
  SC.getUpcomingYouTubeCues = function(currentTime, bufferSeconds = 60, targetTrackId = null) {
    const maxTime = currentTime + bufferSeconds;
    const list = [];
    const seen = new Set();

    let cues = null;
    if (targetTrackId && targetTrackId.startsWith('yt:')) {
      cues = SC.ytTrackCues.get(targetTrackId);
    } else if (SC.ytActiveCues && SC.ytActiveCues.length > 0 && (!targetTrackId || targetTrackId === 'auto')) {
      cues = SC.ytActiveCues;
    }

    if (!cues || cues.length === 0) {
      if (SC.ytActiveCues && SC.ytActiveCues.length > 0) {
        cues = SC.ytActiveCues;
      } else if (SC.ytTrackCues && SC.ytTrackCues.size > 0) {
        cues = SC.ytTrackCues.values().next().value;
      }
    }

    if (cues && cues.length > 0) {
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.end >= currentTime && c.start <= maxTime) {
          const raw = SC.cleanText ? SC.cleanText(c.text) : c.text.trim();
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            list.push({ start: c.start, end: c.end, text: raw });
          }
        }
      }
    }

    return list;
  };

  const YouTubeCapturer = {
    name: 'youtube',
    capture: async function(options = {}) {
      const tracks = [];
      const ytTracks = SC.fetchYouTubeCaptionTracks ? SC.fetchYouTubeCaptionTracks() : (SC.ytCaptionTracks || []);
      if (Array.isArray(ytTracks) && ytTracks.length > 0) {
        ytTracks.forEach((ytTr, idx) => {
          const trackId = `yt:${ytTr.languageCode || idx}`;
          const trName = (ytTr.name && (ytTr.name.simpleText || (ytTr.name.runs && ytTr.name.runs[0] && ytTr.name.runs[0].text)))
            || ytTr.languageCode || `Track ${idx + 1}`;
          const rawCues = SC.ytTrackCues ? SC.ytTrackCues.get(trackId) || [] : [];
          const cues = rawCues.map((c, cIdx) => ({
            id: `yt_cue_${cIdx + 1}`,
            startMs: Math.round(c.start * 1000),
            endMs: Math.round(c.end * 1000),
            text: (SC.cleanText ? SC.cleanText(c.text) : c.text).trim()
          }));
          tracks.push({
            id: trackId,
            language: ytTr.languageCode || 'en',
            label: `[YouTube] ${trName}`,
            kind: ytTr.kind || 'subtitles',
            format: 'json',
            source: 'network',
            live: false,
            completeness: cues.length > 0 ? 'full' : 'loaded-window',
            cues: cues
          });
        });
      }
      return tracks;
    },
    parse: function(rawJson3OrXml, options = {}) {
      let rawCues = [];
      if (typeof rawJson3OrXml === 'string') {
        const trimmed = rawJson3OrXml.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            rawCues = SC.parseYouTubeJson3 ? SC.parseYouTubeJson3(parsed) : [];
          } catch (_) {}
        } else if (trimmed.startsWith('<')) {
          rawCues = SC.parseYouTubeXml ? SC.parseYouTubeXml(trimmed) : [];
        }
      } else if (typeof rawJson3OrXml === 'object') {
        rawCues = SC.parseYouTubeJson3 ? SC.parseYouTubeJson3(rawJson3OrXml) : [];
      }

      const cues = rawCues.map((c, idx) => ({
        id: `yt_cue_${idx + 1}`,
        startMs: Math.round(c.start * 1000),
        endMs: Math.round(c.end * 1000),
        text: (SC.cleanText ? SC.cleanText(c.text) : c.text).trim()
      }));

      return {
        id: options.id || 'yt_track',
        language: options.language || 'en',
        label: options.label || 'YouTube Captions',
        kind: 'captions',
        format: 'json',
        source: 'network',
        live: false,
        completeness: 'full',
        cues: cues
      };
    }
  };

  SC.capturers = SC.capturers || {};
  SC.capturers['youtube'] = YouTubeCapturer;
  window.SubtitlesCapturers = window.SubtitlesCapturers || {};
  window.SubtitlesCapturers['youtube'] = YouTubeCapturer;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = YouTubeCapturer;
  }
})();

