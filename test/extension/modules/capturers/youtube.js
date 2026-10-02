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

  let ytBridgeInjected = false;
  let lastYtFetchTime = 0;

  SC.isYouTubePage = function() {
    return location.hostname.includes('youtube.com');
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

        // Auto-load primary track timedtext if not loaded yet
        const primaryTrack = tracks[0];
        const primaryTrackId = `yt:${primaryTrack.languageCode || 0}`;
        if (!SC.ytTrackCues.has(primaryTrackId)) {
          SC.loadYouTubeTimedText(primaryTrack, primaryTrackId);
        }
      }
    });

    try {
      const script = document.createElement('script');
      script.textContent = `
        (() => {
          function getTracks() {
            try {
              // 1. Movie player response
              const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (player && typeof player.getPlayerResponse === 'function') {
                const resp = player.getPlayerResponse();
                const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(tracks) && tracks.length > 0) return tracks;
              }

              // 2. Window initial player response
              const initTracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
              if (Array.isArray(initTracks) && initTracks.length > 0) return initTracks;

              // 3. Player options tracklist API
              if (player && typeof player.getOption === 'function') {
                const optTracks = player.getOption('captions', 'tracklist');
                if (Array.isArray(optTracks) && optTracks.length > 0) {
                  return optTracks.map(t => ({
                    languageCode: t.languageCode || t.vssId?.replace('.', '') || 'auto',
                    name: { simpleText: t.displayName || t.languageName || t.name || t.languageCode },
                    baseUrl: t.baseUrl || t.url
                  })).filter(t => t.baseUrl);
                }
              }

              // 4. Raw player response config args
              if (window.ytplayer?.config?.args?.raw_player_response) {
                let raw = window.ytplayer.config.args.raw_player_response;
                if (typeof raw === 'string') {
                  try { raw = JSON.parse(raw); } catch (_) {}
                }
                const rawTracks = raw?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(rawTracks) && rawTracks.length > 0) return rawTracks;
              }

              // 5. Watch flexy element player data
              const flexy = document.querySelector('ytd-watch-flexy');
              if (flexy && flexy.playerData) {
                const flexyTracks = flexy.playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(flexyTracks) && flexyTracks.length > 0) return flexyTracks;
              }
            } catch (_) {}
            return null;
          }

          let pollTimer = null;
          function pollForTracks(maxAttempts = 30) {
            if (pollTimer) clearInterval(pollTimer);
            let attempts = 0;
            pollTimer = setInterval(() => {
              attempts++;
              const tracks = getTracks();
              if (tracks && tracks.length > 0) {
                clearInterval(pollTimer);
                pollTimer = null;
                window.postMessage({ type: '__SC_YT_TRACKS__', tracks: JSON.parse(JSON.stringify(tracks)) }, '*');
              } else if (attempts >= maxAttempts) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
            }, 500);
          }

          function broadcast() {
            const tracks = getTracks();
            if (tracks && tracks.length > 0) {
              window.postMessage({ type: '__SC_YT_TRACKS__', tracks: JSON.parse(JSON.stringify(tracks)) }, '*');
            } else {
              pollForTracks(15);
            }
          }

          window.addEventListener('message', (e) => {
            if (e.data && e.data.type === '__SC_REQ_YT_TRACKS__') broadcast();
          });
          document.addEventListener('yt-navigate-finish', () => setTimeout(broadcast, 300));
          document.addEventListener('yt-page-data-updated', () => setTimeout(broadcast, 300));

          pollForTracks(30);
          broadcast();
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (_) {}
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
  document.addEventListener('yt-page-data-updated', handleYtNav);

  /**
   * Fetch complete timedtext track via direct JSON3 or XML request.
   * Parses all cue events for the entire video timeline.
   */
  SC.loadYouTubeTimedText = async function(track, trackId = null) {
    if (!track || !track.baseUrl) return;
    const tId = trackId || `yt:${track.languageCode || ''}`;

    try {
      let fetchUrl = track.baseUrl;
      try {
        const u = new URL(fetchUrl);
        u.searchParams.set('fmt', 'json3');
        fetchUrl = u.toString();
      } catch (_) {
        if (fetchUrl.includes('fmt=')) {
          fetchUrl = fetchUrl.replace(/fmt=[^&]+/, 'fmt=json3');
        } else {
          fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fmt=json3';
        }
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) {
        console.warn('Timed text request failed with status:', res.status);
        return;
      }

      const rawBody = await res.text();
      let cues = [];

      // Try JSON3 parsing first
      try {
        const data = JSON.parse(rawBody);
        if (data && Array.isArray(data.events)) {
          cues = data.events
            .filter(e => e.segs && e.segs.length > 0)
            .map(e => ({
              start: (e.tStartMs || 0) / 1000,
              end: ((e.tStartMs || 0) + (e.dDurationMs || 0)) / 1000,
              text: SC.cleanText ? SC.cleanText(e.segs.map(s => s.utf8 || '').join('')) : e.segs.map(s => s.utf8 || '').join('').trim()
            }))
            .filter(c => c.text && c.text.length > 0);
        }
      } catch (_) {
        // XML parsing fallback (srv1 / srv3 transcript XML)
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(rawBody, 'text/xml');
          const textNodes = xmlDoc.querySelectorAll('text');
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
        } catch (_) {}
      }

      if (cues && cues.length > 0) {
        SC.ytTrackCues.set(tId, cues);

        const firstTrack = SC.state && SC.state.languages ? SC.state.languages.find(l => (l.mode === 'track' || l.type === 'source') && (l.trackId || l.lang)) : null;
        const firstTrackId = (firstTrack && (firstTrack.trackId || firstTrack.lang)) || 'auto';
        if (firstTrackId === tId || firstTrackId === 'auto' || !SC.ytActiveCues || SC.ytActiveCues.length === 0) {
          SC.ytActiveCues = cues;
        }

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
      console.warn('Timed text load error:', err);
    }
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
})();
