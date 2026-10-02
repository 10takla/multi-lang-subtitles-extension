/**
 * Video Subtitles Capturer - YouTube Module
 * Isolated subtitle extraction via YouTube player response and TimedText API (JSON3).
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
              const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (player && typeof player.getPlayerResponse === 'function') {
                const resp = player.getPlayerResponse();
                const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(tracks) && tracks.length > 0) return tracks;
              }
              const initTracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
              if (Array.isArray(initTracks) && initTracks.length > 0) return initTracks;
            } catch (_) {}
            return null;
          }

          function broadcast() {
            const tracks = getTracks();
            if (tracks && tracks.length > 0) {
              window.postMessage({ type: '__SC_YT_TRACKS__', tracks: JSON.parse(JSON.stringify(tracks)) }, '*');
            }
          }

          window.addEventListener('message', (e) => {
            if (e.data && e.data.type === '__SC_REQ_YT_TRACKS__') broadcast();
          });
          document.addEventListener('yt-navigate-finish', () => setTimeout(broadcast, 500));
          document.addEventListener('yt-page-data-updated', () => setTimeout(broadcast, 500));

          let attempts = 0;
          const timer = setInterval(() => {
            attempts++;
            const t = getTracks();
            if (t && t.length > 0) {
              broadcast();
              clearInterval(timer);
            } else if (attempts > 30) {
              clearInterval(timer);
            }
          }, 500);
          broadcast();
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (_) {}
  };

  /**
   * Request caption tracks from bridge or return cached list.
   */
  SC.fetchYouTubeCaptionTracks = function() {
    if (!SC.isYouTubePage()) return [];
    SC.initYouTubeBridge();
    if (SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    const now = Date.now();
    if (now - lastYtFetchTime >= 1000) {
      lastYtFetchTime = now;
      try {
        window.postMessage({ type: '__SC_REQ_YT_TRACKS__' }, '*');
      } catch (_) {}
    }

    return SC.ytCaptionTracks || [];
  };

  /**
   * Fetch complete timedtext track via direct JSON3 request.
   * Parses all cue events for the entire video timeline.
   */
  SC.loadYouTubeTimedText = async function(track, trackId = null) {
    if (!track || !track.baseUrl) return;
    const tId = trackId || `yt:${track.languageCode || ''}`;

    try {
      const url = track.baseUrl.includes('fmt=') ? track.baseUrl : track.baseUrl + '&fmt=json3';
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('Timed text request failed with status:', res.status);
        return;
      }
      const data = await res.json();

      if (data && Array.isArray(data.events)) {
        const cues = data.events
          .filter(e => e.segs && e.segs.length > 0)
          .map(e => ({
            start: (e.tStartMs || 0) / 1000,
            end: ((e.tStartMs || 0) + (e.dDurationMs || 0)) / 1000,
            text: e.segs.map(s => s.utf8 || '').join('').trim()
          }))
          .filter(c => c.text);

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
      if (match) return SC.cleanText ? SC.cleanText(match.text) : match.text.trim();
    }
    return null;
  };

  /**
   * Get active cue at current playback time.
   */
  SC.getYouTubeActiveCueAtTime = function(time) {
    if (!SC.ytActiveCues || SC.ytActiveCues.length === 0) return null;
    return SC.ytActiveCues.find(c => time >= c.start && time <= c.end) || null;
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
