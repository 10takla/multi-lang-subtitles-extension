/**
 * Video Subtitles Capturer - Main Entry Point
 * Orchestrates modules (state, translator, capturers, overlay, widget) and handles extension lifecycle.
 */

(() => {
  window.__SC = window.__SC || {};
  let SC = window.__SC;

  // Determine base directory if loaded directly via <script src="...">
  const currentScript = document.currentScript;
  let baseUrl = '';
  if (currentScript && currentScript.src) {
    baseUrl = currentScript.src.substring(0, currentScript.src.lastIndexOf('/') + 1);
    SC.extensionBaseUrl = baseUrl;
  }

  function startExtension() {
    SC = window.__SC;
    if (!SC) return;

  // Cross-frame state coordination for embedded video players
  const isTopFrame = window.self === window.top;
  let latestChildFrameData = null;

  function broadcastFrameUpdate() {
    if (!isTopFrame) {
      try {
        const activeVideo = SC.getActiveVideo();
        const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
        window.parent.postMessage({
          type: '__SC_CHILD_FRAME_UPDATE__',
          lines: SC.state.lines,
          tracks: availTracks,
          videoDetected: !!activeVideo,
          videoTime: activeVideo ? SC.formatTime(activeVideo.currentTime) : null,
          widgetVisible: SC.state.widgetVisible
        }, '*');
      } catch (_) {}
    }
  }

  // Hook line additions to notify parent frame
  const originalAddSubtitleLine = SC.addSubtitleLine;
  if (originalAddSubtitleLine) {
    SC.addSubtitleLine = function(rawText, videoTimestamp = null) {
      originalAddSubtitleLine(rawText, videoTimestamp);
      broadcastFrameUpdate();
    };
  }

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === '__SC_CHILD_FRAME_UPDATE__') {
      latestChildFrameData = e.data;
      if (Array.isArray(e.data.tracks) && e.data.tracks.length > 0) {
        SC.state.childTracks = e.data.tracks;
        if (SC.renderLanguageList) SC.renderLanguageList();
      }
      if (Array.isArray(e.data.lines) && e.data.lines.length > 0) {
        if (SC.state.lines.length < e.data.lines.length) {
          SC.state.lines = e.data.lines;
          if (SC.renderAllLines) SC.renderAllLines();
        }
      }
      if (!isTopFrame) {
        // Relay upward if middle frame
        try { window.parent.postMessage(e.data, '*'); } catch (_) {}
      }
    } else if (e.data.type === '__SC_FORWARD_POPUP_CMD__') {
      if (e.data.cmd === 'TOGGLE_WIDGET') {
        if (SC.state.widgetVisible) {
          if (SC.closeWidget) SC.closeWidget();
        } else {
          if (SC.openWidget) SC.openWidget();
        }
      } else if (e.data.cmd === 'CLEAR_SUBTITLES') {
        if (SC.clearAllSubtitles) SC.clearAllSubtitles();
      }
    }
  });

  // Extension runtime message listener for popup interaction
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const activeVideo = SC.getActiveVideo();

      // Prevent non-video iframes from overriding main frame response
      if (!isTopFrame && !activeVideo) {
        return false;
      }

      if (message.type === 'GET_SUBTITLES') {
        if (activeVideo || (SC.state.lines && SC.state.lines.length > 0) || !latestChildFrameData) {
          sendResponse({
            lines: SC.state.lines,
            videoDetected: !!activeVideo,
            videoTime: activeVideo ? SC.formatTime(activeVideo.currentTime) : null,
            widgetVisible: SC.state.widgetVisible
          });
        } else {
          sendResponse({
            lines: latestChildFrameData.lines || [],
            videoDetected: Boolean(latestChildFrameData.videoDetected),
            videoTime: latestChildFrameData.videoTime || null,
            widgetVisible: Boolean(latestChildFrameData.widgetVisible)
          });
        }
        return true;
      }

      if (message.type === 'CLEAR_SUBTITLES') {
        SC.clearAllSubtitles();
        // Forward to iframes
        document.querySelectorAll('iframe').forEach(f => {
          try { f.contentWindow.postMessage({ type: '__SC_FORWARD_POPUP_CMD__', cmd: 'CLEAR_SUBTITLES' }, '*'); } catch (_) {}
        });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'TOGGLE_WIDGET') {
        if (activeVideo || !latestChildFrameData) {
          if (SC.state.widgetVisible) {
            if (SC.closeWidget) SC.closeWidget();
          } else {
            if (SC.openWidget) SC.openWidget();
          }
          sendResponse({ widgetVisible: SC.state.widgetVisible });
        } else {
          // Forward toggle command to iframes
          document.querySelectorAll('iframe').forEach(f => {
            try { f.contentWindow.postMessage({ type: '__SC_FORWARD_POPUP_CMD__', cmd: 'TOGGLE_WIDGET' }, '*'); } catch (_) {}
          });
          sendResponse({ widgetVisible: !latestChildFrameData.widgetVisible });
        }
        return true;
      }
    });
  }

  // App initialization
  function init() {
    if (SC.initYouTubeBridge) SC.initYouTubeBridge();
    SC.initInPageWidget();
    SC.scanForVideos();
    if (SC.scanPageForSubtitleTracks) SC.scanPageForSubtitleTracks();
    SC.setupDOMSubtitleObserver();

    // Keep on-video overlay and video icons strictly aligned with video bounds on resize/scroll/fullscreen
    window.addEventListener('resize', SC.scheduleUpdatePositions, { passive: true });
    window.addEventListener('scroll', SC.scheduleUpdatePositions, { passive: true });

    const handleFsChange = () => {
      let fsElem = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsElem && SC.getAccessibleDocuments) {
        const docs = SC.getAccessibleDocuments();
        for (const doc of docs) {
          if (doc !== document && (doc.fullscreenElement || doc.webkitFullscreenElement)) {
            fsElem = doc.fullscreenElement || doc.webkitFullscreenElement;
            break;
          }
        }
      }
      if (fsElem && SC.hostEl) {
        if (SC.hostEl.parentNode !== fsElem) {
          fsElem.appendChild(SC.hostEl);
        }
      } else if (SC.hostEl && SC.hostEl.parentNode !== document.body && SC.hostEl.parentNode !== document.documentElement) {
        (document.body || document.documentElement).appendChild(SC.hostEl);
      }
      setTimeout(SC.scheduleUpdatePositions, 100);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    // Periodic fallback sweep for dynamically injected video elements, tracks, and position syncing
    setInterval(() => {
      if (SC.getAccessibleDocuments) {
        SC.getAccessibleDocuments().forEach(d => {
          if (SC.observeDocument) SC.observeDocument(d);
          if (d !== document) {
            d.removeEventListener('fullscreenchange', handleFsChange);
            d.removeEventListener('webkitfullscreenchange', handleFsChange);
            d.addEventListener('fullscreenchange', handleFsChange);
            d.addEventListener('webkitfullscreenchange', handleFsChange);
          }
        });
      }
      SC.scanForVideos();
      if (SC.scanPageForSubtitleTracks) SC.scanPageForSubtitleTracks();
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      broadcastFrameUpdate();
    }, 1500);
  }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    window.__subtitlesCapturerInjected = true;
  }

  const moduleFiles = [
    'modules/state.js',
    'modules/translator.js',
    'modules/capturers/platform_adapters/youtube/index.js',
    'modules/capturers/browser/html5/index.js',
    'modules/capturers/platform_adapters/custom/index.js',
    'modules/capturers/network/streaming/index.js',
    'modules/capturers/platform_adapters/drm/index.js',
    'modules/capturers/render/hardsub/index.js',
    'modules/capturers.js',
    'modules/overlay.js',
    'modules/widget.js'
  ];

  if (!window.__SC?.initInPageWidget) {
    function loadScript(src) {
      return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = (e) => {
          console.warn('[Subtitles] Failed loading module:', src, e);
          resolve();
        };
        (document.head || document.documentElement).appendChild(s);
      });
    }

    (async () => {
      if (baseUrl && !document.querySelector('link[data-sc-style]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = baseUrl + 'content.css';
        link.setAttribute('data-sc-style', 'true');
        (document.head || document.documentElement).appendChild(link);
      }
      for (const mod of moduleFiles) {
        await loadScript(baseUrl + mod);
      }
      startExtension();
    })();
  } else {
    startExtension();
  }
})();
