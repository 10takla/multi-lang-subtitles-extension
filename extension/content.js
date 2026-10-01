/**
 * Video Subtitles Capturer - Main Entry Point
 * Orchestrates modules (state, translator, capturers, overlay, widget) and handles extension lifecycle.
 */

(() => {
  const SC = window.__SC;
  if (!SC) return;

  // Extension runtime message listener for popup interaction
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const isTopFrame = window.self === window.top;
    const activeVideo = SC.getActiveVideo();

    // Prevent non-video iframes from overriding main frame response
    if (!isTopFrame && !activeVideo) {
      return false;
    }

    if (message.type === 'GET_SUBTITLES') {
      sendResponse({
        lines: SC.state.lines,
        videoDetected: !!activeVideo,
        videoTime: activeVideo ? SC.formatTime(activeVideo.currentTime) : null,
        widgetVisible: SC.state.widgetVisible
      });
      return true;
    }

    if (message.type === 'CLEAR_SUBTITLES') {
      SC.clearAllSubtitles();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'TOGGLE_WIDGET') {
      SC.state.widgetVisible = !SC.state.widgetVisible;
      if (SC.widgetEl && SC.launcherBtn) {
        if (SC.state.widgetVisible) {
          SC.widgetEl.classList.remove('sc-hidden');
          SC.launcherBtn.classList.add('sc-hidden');
        } else {
          SC.widgetEl.classList.add('sc-hidden');
          SC.launcherBtn.classList.remove('sc-hidden');
        }
      }
      sendResponse({ widgetVisible: SC.state.widgetVisible });
      return true;
    }
  });

  // App initialization
  function init() {
    SC.initInPageWidget();
    SC.scanForVideos();
    SC.setupDOMSubtitleObserver();

    // Keep on-video overlay strictly aligned with video bounds on resize/scroll/fullscreen
    window.addEventListener('resize', SC.updateVideoOverlayPosition, { passive: true });
    window.addEventListener('scroll', SC.updateVideoOverlayPosition, { passive: true });

    const handleFsChange = () => {
      const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsElem && SC.hostEl) {
        if (SC.hostEl.parentNode !== fsElem) {
          fsElem.appendChild(SC.hostEl);
        }
      } else if (SC.hostEl && SC.hostEl.parentNode !== document.body && SC.hostEl.parentNode !== document.documentElement) {
        (document.body || document.documentElement).appendChild(SC.hostEl);
      }
      setTimeout(SC.updateVideoOverlayPosition, 100);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    // Periodic sweep for dynamically injected video elements
    setInterval(SC.scanForVideos, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
