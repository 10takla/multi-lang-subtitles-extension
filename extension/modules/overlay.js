/**
 * Video Subtitles Capturer - On-Video Overlay Module
 * Manages responsive on-video subtitle rendering, positioning, scaling, and dragging.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.overlayEl = null;
  SC.videoResizeObserver = null;

  // Initialize overlay element inside Shadow DOM
  SC.initOverlay = function(shadowRoot) {
    const overlay = document.createElement('div');
    overlay.className = 'sc-video-overlay sc-hidden';
    overlay.id = 'sc-video-overlay';
    overlay.title = 'Перетащите для перемещения субтитров на видео';
    overlay.innerHTML = '<div class="sc-video-overlay-lines" id="sc-video-overlay-lines"></div>';

    SC.setupVideoOverlayDraggable(overlay);
    shadowRoot.appendChild(overlay);
    SC.overlayEl = overlay;

    if (typeof ResizeObserver !== 'undefined') {
      SC.videoResizeObserver = new ResizeObserver(() => {
        if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
        else SC.updateVideoOverlayPosition();
      });
    }

    return overlay;
  };

  // Adjust overlay position strictly within video boundaries ("в рамках окна видео")
  SC.updateVideoOverlayPosition = function() {
    if (!SC.overlayEl) return;
    const video = SC.getActiveVideo();
    if (!video) {
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    const vRect = video.getBoundingClientRect();
    if (vRect.width < 50 || vRect.height < 50 || vRect.bottom < 0 || vRect.top > window.innerHeight) {
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    // Scale font size dynamically with video size
    const scaleFactor = Math.max(0.7, Math.min(1.6, vRect.width / 800));
    const dynamicFontSize = Math.round(SC.state.fontSize * scaleFactor);
    SC.overlayEl.style.fontSize = `${dynamicFontSize}px`;
    SC.overlayEl.style.maxWidth = `${Math.round(vRect.width * 0.92)}px`;

    const oW = SC.overlayEl.offsetWidth || 260;
    const oH = SC.overlayEl.offsetHeight || 50;

    let posX = 0;
    let posY = 0;

    if (SC.state.videoOverlayPosition === 'custom' && SC.state.customOverlayPos) {
      posX = vRect.left + SC.state.customOverlayPos.relX * vRect.width;
      posY = vRect.top + SC.state.customOverlayPos.relY * vRect.height;
    } else if (SC.state.videoOverlayPosition === 'top') {
      posX = vRect.left + (vRect.width - oW) / 2;
      posY = vRect.top + Math.max(12, vRect.height * 0.08);
    } else if (SC.state.videoOverlayPosition === 'center') {
      posX = vRect.left + (vRect.width - oW) / 2;
      posY = vRect.top + (vRect.height - oH) / 2;
    } else {
      // Default: 'bottom'
      posX = vRect.left + (vRect.width - oW) / 2;
      posY = vRect.bottom - oH - Math.max(12, vRect.height * 0.08);
    }

    // Strict containment within the video boundaries ("в рамках окна видео")
    const minX = vRect.left + 8;
    const maxX = Math.max(minX, vRect.right - oW - 8);
    const minY = vRect.top + 8;
    const maxY = Math.max(minY, vRect.bottom - oH - 8);

    posX = Math.max(minX, Math.min(maxX, posX));
    posY = Math.max(minY, Math.min(maxY, posY));

    SC.overlayEl.style.left = `${Math.round(posX)}px`;
    SC.overlayEl.style.top = `${Math.round(posY)}px`;
    SC.overlayEl.classList.remove('sc-hidden');
    if (SC.updateVideoIconsPosition) SC.updateVideoIconsPosition();
  };

  // Render content of active subtitle line on video overlay
  SC.updateVideoOverlayContent = function() {
    if (!SC.overlayEl || !SC.shadowRoot) return;
    const linesContainer = SC.shadowRoot.getElementById('sc-video-overlay-lines');
    if (!linesContainer) return;

    const activeLine = SC.state.currentActiveLine;
    if (!activeLine) {
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    const entries = [];
    SC.state.languages.forEach(item => {
      if (!item.visible) return;

      if (item.type === 'source') {
        entries.push(`
          <div class="sc-vol-line sc-vol-source">
            <span class="sc-vol-tag">ОРИГ</span>
            <span class="sc-vol-text">${SC.escapeHtml(activeLine.text)}</span>
          </div>
        `);
      } else if (item.mode === 'track') {
        const trackText = activeLine.trackTexts && activeLine.trackTexts[item.lang]
          ? activeLine.trackTexts[item.lang]
          : activeLine.text;
        const avail = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
        const found = avail.find(a => a.value === item.lang);
        const tag = (found ? found.label.replace(/^\[.*?\]\s*/, '') : (item.label || 'ТРЕК')).slice(0, 5).toUpperCase();
        entries.push(`
          <div class="sc-vol-line sc-vol-track">
            <span class="sc-vol-tag">${SC.escapeHtml(tag)}</span>
            <span class="sc-vol-text">${SC.escapeHtml(trackText)}</span>
          </div>
        `);
      } else {
        const transText = activeLine.translations
          ? (activeLine.translations[item.id] || activeLine.translations[item.lang])
          : null;
        const tag = SC.getLangName(item.lang).slice(0, 3).toUpperCase();
        entries.push(`
          <div class="sc-vol-line sc-vol-trans">
            <span class="sc-vol-tag">${tag}</span>
            <span class="sc-vol-text">${transText ? SC.escapeHtml(transText) : '<span class="sc-vol-loading">...</span>'}</span>
          </div>
        `);
      }
    });

    if (entries.length === 0) {
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    linesContainer.innerHTML = entries.join('');
    SC.updateVideoOverlayPosition();
  };

  // Draggable logic for on-video overlay
  SC.setupVideoOverlayDraggable = function(element) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    element.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      element.classList.add('sc-dragging');
      e.preventDefault();
      e.stopPropagation();

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const video = SC.getActiveVideo();
        if (!video) return;

        const vRect = video.getBoundingClientRect();
        const oW = element.offsetWidth || 200;
        const oH = element.offsetHeight || 40;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Clamp to video bounds
        newLeft = Math.max(vRect.left + 8, Math.min(vRect.right - oW - 8, newLeft));
        newTop = Math.max(vRect.top + 8, Math.min(vRect.bottom - oH - 8, newTop));

        element.style.left = `${Math.round(newLeft)}px`;
        element.style.top = `${Math.round(newTop)}px`;

        SC.state.videoOverlayPosition = 'custom';
        SC.state.customOverlayPos = {
          relX: (newLeft - vRect.left) / Math.max(1, vRect.width),
          relY: (newTop - vRect.top) / Math.max(1, vRect.height)
        };
      };

      const onMouseUp = () => {
        isDragging = false;
        element.classList.remove('sc-dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };
})();
