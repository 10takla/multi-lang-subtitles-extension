(function initYouTubePlayerStand() {
      // 1. Mock Subtitles Data (JSON3 YouTube TimedText format)
      const mockTracksData = {
        ru: {
          languageCode: 'ru',
          displayName: 'Русский',
          json3: {
            events: [
              { tStartMs: 500, dDurationMs: 2500, segs: [{ utf8: 'Первая строка тестовых субтитров' }] },
              { tStartMs: 3500, dDurationMs: 2500, segs: [{ utf8: 'Вторая строка: отслеживание работает' }] },
              { tStartMs: 6500, dDurationMs: 3000, segs: [{ utf8: 'Третья строка: субтитры успешно захвачены' }] }
            ]
          }
        },
        en: {
          languageCode: 'en',
          displayName: 'English',
          json3: {
            events: [
              { tStartMs: 500, dDurationMs: 2500, segs: [{ utf8: 'First line of test subtitles' }] },
              { tStartMs: 3500, dDurationMs: 2500, segs: [{ utf8: 'Second line: tracking is working' }] },
              { tStartMs: 6500, dDurationMs: 3000, segs: [{ utf8: 'Third line: subtitles captured successfully' }] }
            ]
          }
        }
      };

      // Ensure window.__SC configuration for test stand
      window.__SC = window.__SC || {};
      window.__SC.extensionBaseUrl = '../../../../../';
      const isYT = () => true;
      Object.defineProperty(window.__SC, 'isYouTubePage', {
        get: () => isYT,
        set: () => {},
        configurable: true
      });

      // Emulate chrome runtime in standalone/file mode if not present
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {};
        window.chrome.runtime.getURL = (p) => '../../../../../' + p;
        window.chrome.runtime.sendMessage = (msg, cb) => {
          if (msg && msg.type === 'TRANSLATE_TEXT') {
            if (cb) cb({ success: true, translated: '[Тест] ' + msg.text });
          } else {
            if (cb) cb({ success: true });
          }
          return Promise.resolve({ success: true });
        };
        window.chrome.runtime.onMessage = window.chrome.runtime.onMessage || {
          addListener: () => {},
          removeListener: () => {}
        };
      }

      // Local fetch fallback interceptor to ensure requests to timedtext and translations return mocks without network
      const originalFetch = window.fetch;
      window.fetch = async function(input, init) {
        const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
        if (urlStr.includes('timedtext') || urlStr.includes('fmt=json3')) {
          const isEn = urlStr.includes('lang=en') || urlStr.includes('.en') || urlStr.includes('vssId=%2Een');
          const data = isEn ? mockTracksData.en.json3 : mockTracksData.ru.json3;
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (urlStr.includes('translate.googleapis.com') || urlStr.includes('translate.yandex.net')) {
          let textParam = '';
          try {
            const urlObj = new URL(urlStr, window.location.href);
            textParam = urlObj.searchParams.get('q') || urlObj.searchParams.get('text') || '';
          } catch (_) {}
          const translated = textParam ? `[Тест перевод] ${textParam}` : 'Тестовый перевод';
          if (urlStr.includes('translate.yandex.net')) {
            return new Response(JSON.stringify({ code: 200, lang: 'en-ru', text: [translated] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } else {
            return new Response(JSON.stringify([[[translated, textParam, null, null, 10]], null, 'ru']), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
        return originalFetch.apply(this, arguments);
      };

      // 2. YouTube Player Methods on #movie_player
      const moviePlayer = document.getElementById('movie_player');
      const video = moviePlayer.querySelector('video');
      const ccBtn = document.getElementById('ytp-cc-btn');
      const playToggleBtn = document.getElementById('ytp-play-toggle');
      const playPauseIcon = document.getElementById('play-pause-icon');
      const currentTimeDisplay = document.getElementById('current-time-display');
      const durationDisplay = document.getElementById('duration-display');
      const diagPlayback = document.getElementById('diag-playback');
      const diagActiveText = document.getElementById('diag-active-text');
      const diagScStatus = document.getElementById('diag-sc-status');
      const trackSelect = document.getElementById('track-select');
      const btnToggleWidget = document.getElementById('btn-toggle-widget');

      let currentLang = 'ru';

      // Emulate fallback window.ytplayer config
      window.ytplayer = {
        config: {
          args: {
            raw_player_response: window.ytInitialPlayerResponse
          }
        }
      };

      // Player API Methods
      moviePlayer.getPlayerResponse = function() {
        return window.ytInitialPlayerResponse;
      };

      moviePlayer.getOption = function(module, option) {
        if (module === 'captions' && option === 'tracklist') {
          return window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks.map(t => ({
            languageCode: t.languageCode,
            displayName: t.name.simpleText,
            name: t.name.simpleText,
            vssId: t.vssId,
            baseUrl: t.baseUrl
          }));
        }
        if (module === 'captions' && option === 'track') {
          return { languageCode: currentLang };
        }
        return null;
      };

      moviePlayer.setOption = function(module, option, value) {
        if (module === 'captions' && option === 'track') {
          if (value && value.languageCode) {
            currentLang = value.languageCode;
            trackSelect.value = currentLang;
            if (window.__SC && window.__SC.loadYouTubeTimedText && window.__SC.ytCaptionTracks) {
              const tr = window.__SC.ytCaptionTracks.find(t => t.languageCode === currentLang);
              if (tr) window.__SC.loadYouTubeTimedText(tr, `yt:${currentLang}`);
            }
          }
        }
      };

      moviePlayer.getCurrentTime = function() {
        return video.currentTime;
      };

      moviePlayer.getDuration = function() {
        return video.duration || 0;
      };

      moviePlayer.playVideo = function() {
        video.play();
      };

      moviePlayer.pauseVideo = function() {
        video.pause();
      };

      moviePlayer.getPlayerState = function() {
        return video.paused ? 2 : 1;
      };

      function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }

      // Sync player UI controls
      video.addEventListener('timeupdate', () => {
        currentTimeDisplay.textContent = formatTime(video.currentTime);
        if (window.__SC && window.__SC.state) {
          const activeLine = window.__SC.state.currentActiveLine;
          if (activeLine && activeLine.text) {
            diagActiveText.textContent = `"${activeLine.text}" (${activeLine.videoTime})`;
          } else {
            diagActiveText.textContent = '—';
          }
        }
      });

      video.addEventListener('loadedmetadata', () => {
        durationDisplay.textContent = formatTime(video.duration);
      });

      video.addEventListener('play', () => {
        diagPlayback.textContent = 'Воспроизведение';
        playPauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      });

      video.addEventListener('pause', () => {
        diagPlayback.textContent = 'На паузе';
        playPauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      });

      // Player Controls Event Listeners
      let ccActive = false;
      ccBtn.addEventListener('click', () => {
        ccActive = !ccActive;
        ccBtn.setAttribute('aria-pressed', ccActive ? 'true' : 'false');
      });

      playToggleBtn.addEventListener('click', () => {
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
      });

      trackSelect.addEventListener('change', (e) => {
        moviePlayer.setOption('captions', 'track', { languageCode: e.target.value });
      });

      if (btnToggleWidget) {
        btnToggleWidget.addEventListener('click', () => {
          if (window.__SC) {
            if (window.__SC.state && window.__SC.state.widgetVisible) {
              if (window.__SC.closeWidget) window.__SC.closeWidget();
              btnToggleWidget.textContent = 'Открыть панель расширения';
            } else {
              if (window.__SC.openWidget) window.__SC.openWidget();
              btnToggleWidget.textContent = 'Закрыть панель расширения';
            }
          }
        });
      }

      // Periodically check extension status to reflect in diagnostics
      const extCheckTimer = setInterval(() => {
        if (window.__SC && window.__SC.hostEl) {
          diagScStatus.textContent = 'Активно (Shadow DOM & Overlay подключены)';
          diagScStatus.style.color = '#4ade80';
          clearInterval(extCheckTimer);
        }
      }, 300);

      // Autoplay handler
      video.play().catch(e => {
        diagPlayback.textContent = 'Autoplay заблокирован: нажмите Play';
      });
    })();
