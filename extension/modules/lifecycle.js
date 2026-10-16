/**
 * Video Subtitles Capturer - Lifecycle & View Synchronization Module
 * Manages viewport, fullscreen, media, and navigation events without periodic scanning.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.initLifecycle = function() {
    if (SC._hasInitializedLifecycle) return;
    SC._hasInitializedLifecycle = true;

    // Viewport position updates
    if (SC.scheduleUpdatePositions) {
      window.addEventListener('resize', SC.scheduleUpdatePositions, { passive: true });
      window.addEventListener('scroll', SC.scheduleUpdatePositions, { passive: true, capture: true });
    }

    // Fullscreen alignment handling
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

      if (SC.scheduleUpdatePositions) {
        setTimeout(SC.scheduleUpdatePositions, 100);
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    const discover = () => SC.scheduleVideoScan?.();
    for (const event of ['loadedmetadata', 'emptied', 'play']) {
      document.addEventListener(event, e => {
        if (e.target?.tagName === 'VIDEO') discover();
      }, true);
    }
    // Each frame runs its own discovery and fullscreen listeners.
    document.addEventListener('load', e => {
      if (e.target?.tagName === 'IFRAME' || e.target?.tagName === 'SCRIPT') discover();
    }, true);
    window.addEventListener('popstate', discover);
    window.addEventListener('hashchange', discover);
    window.navigation?.addEventListener('currententrychange', discover);
    document.addEventListener('yt-navigate-finish', discover);
    window.addEventListener('pageshow', e => {
      if (e.persisted) discover();
    });
  };
})();
