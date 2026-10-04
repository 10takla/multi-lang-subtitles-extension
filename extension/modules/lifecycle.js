/**
 * Video Subtitles Capturer - Lifecycle & View Synchronization Module
 * Manages viewport resize/scroll listeners, fullscreen mode tracking, and periodic scanning.
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
      window.addEventListener('scroll', SC.scheduleUpdatePositions, { passive: true });
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

    // Periodic sweep for dynamically created video players, tracks, and frames
    setInterval(() => {
      if (SC.getAccessibleDocuments) {
        SC.getAccessibleDocuments().forEach((d) => {
          if (SC.observeDocument) SC.observeDocument(d);
          if (d !== document) {
            d.removeEventListener('fullscreenchange', handleFsChange);
            d.removeEventListener('webkitfullscreenchange', handleFsChange);
            d.addEventListener('fullscreenchange', handleFsChange);
            d.addEventListener('webkitfullscreenchange', handleFsChange);
          }
        });
      }

      if (SC.scanForVideos) SC.scanForVideos();
      if (SC.scanPageForSubtitleTracks) SC.scanPageForSubtitleTracks();
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      if (SC.broadcastFrameUpdate) SC.broadcastFrameUpdate();
    }, 1500);
  };
})();
