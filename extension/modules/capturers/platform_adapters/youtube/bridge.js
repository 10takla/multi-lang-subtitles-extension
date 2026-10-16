(() => {
  if (window.__SCYouTubeBridge) return;
  window.__SCYouTubeBridge = true;

  // Discover the playback provider by its methods, not revision-specific names.
  // The provider exposes the same per-video token used to decorate caption URLs.
  function readPlaybackAccess(player) {
    const namespace = window._yt_player;
    if (!namespace || typeof player?.getPlayerResponse !== 'function') return null;
    for (const candidate of Object.values(namespace)) {
      const prototype = typeof candidate === 'function' && candidate.prototype;
      if (!prototype) continue;
      const dataDescriptor = Object.getOwnPropertyDescriptor(prototype, 'getVideoData');
      if (typeof dataDescriptor?.value !== 'function' || !dataDescriptor.writable) continue;
      const methods = Object.entries(Object.getOwnPropertyDescriptors(prototype));
      const tokenMethod = methods.find(([name, descriptor]) => {
        if (name === 'constructor' || typeof descriptor.value !== 'function' || descriptor.value.length !== 0) return false;
        const source = Function.prototype.toString.call(descriptor.value);
        return source.length < 500 && source.includes('html5_generate_content_po_token');
      })?.[1].value;
      if (!tokenMethod) continue;
      let provider;
      try {
        Object.defineProperty(prototype, 'getVideoData', {
          ...dataDescriptor,
          value: function(...args) {
            provider = this;
            return dataDescriptor.value.apply(this, args);
          }
        });
        player.getPlayerResponse();
      } finally {
        Object.defineProperty(prototype, 'getVideoData', dataDescriptor);
      }
      if (provider) {
        const data = dataDescriptor.value.call(provider);
        return { videoId: data?.videoId, token: tokenMethod.call(provider) };
      }
    }
    return null;
  }

  async function loadTrack(request) {
    const track = getTracks()?.find(item => item.baseUrl === request.baseUrl);
    if (!track) throw new Error('YouTube track no longer belongs to this video');
    const url = new URL(track.baseUrl);
    if (url.protocol !== 'https:' || !/(^|\.)youtube\.com$/.test(url.hostname) || url.pathname !== '/api/timedtext') {
      throw new Error('Invalid YouTube caption URL');
    }
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      // The player can initially return a provisional token while its token
      // service starts. Refresh the token after an empty response.
      for (let attempt = 0; attempt < 8; attempt++) {
        if (controller.signal.aborted) throw new Error('YouTube caption request timed out');
        const access = readPlaybackAccess(player);
        if (access?.videoId && access.videoId !== url.searchParams.get('v')) {
          throw new Error('YouTube video changed during caption loading');
        }
        const requestUrl = new URL(url.href);
        requestUrl.searchParams.set('fmt', 'json3');
        if (access?.token) {
          requestUrl.searchParams.set('potc', '1');
          requestUrl.searchParams.set('pot', access.token);
          requestUrl.searchParams.set('c', 'WEB');
        }
        const response = await fetch(requestUrl.href, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(`YouTube timedtext status: ${response.status}`);
        const rawBody = await response.text();
        if (rawBody.trim()) return rawBody;
        if (attempt < 7) await new Promise(resolve => setTimeout(resolve, 750));
      }
      throw new Error('YouTube returned an empty caption track');
    } finally {
      clearTimeout(timeout);
    }
  }

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
    if (e.source !== window || !e.data) return;
    if (e.data.type === '__SC_REQ_YT_TIMEDTEXT__') {
      const request = e.data;
      loadTrack(request).then(
        rawBody => window.postMessage({ type: '__SC_YT_TIMEDTEXT__', requestId: request.requestId, rawBody }, '*'),
        error => {
          console.warn('[Subtitles] YouTube playback request failed:', error.message);
          window.postMessage({ type: '__SC_YT_TIMEDTEXT__', requestId: request.requestId, error: error.message }, '*');
        }
      );
    }
    if (e.data.type === '__SC_REQ_YT_TRACKS__') broadcast();
  });
  document.addEventListener('yt-navigate-finish', () => setTimeout(broadcast, 300));
  document.addEventListener('yt-page-data-updated', () => setTimeout(broadcast, 300));

  pollForTracks(30);
  broadcast();
})();
