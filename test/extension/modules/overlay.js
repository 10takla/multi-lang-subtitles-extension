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

    // 0-100% positioning within video window boundaries (ai_instrs/_.md:24)
    const posXPercent = typeof SC.state.overlayPosX === 'number' ? SC.state.overlayPosX : 50;
    const posYPercent = typeof SC.state.overlayPosY === 'number' ? SC.state.overlayPosY : 90;

    const availW = Math.max(0, vRect.width - oW);
    const availH = Math.max(0, vRect.height - oH);

    let posX = vRect.left + (availW * posXPercent) / 100;
    let posY = vRect.top + (availH * posYPercent) / 100;

    // Strict containment within the video boundaries ("в рамках окна видео")
    const minX = vRect.left;
    const maxX = Math.max(minX, vRect.right - oW);
    const minY = vRect.top;
    const maxY = Math.max(minY, vRect.bottom - oH);

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

    const showTags = Boolean(SC.state.showLanguageTags);
    linesContainer.classList.toggle('sc-with-tags', showTags);

    const entries = [];
    const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];

    SC.state.languages.forEach(item => {
      if (!item.visible) return;

      if (item.mode === 'track' || (!item.mode && item.type === 'source')) {
        const trackVal = item.trackId || item.lang || 'auto';
        const trackText = (activeLine.trackTexts && activeLine.trackTexts[trackVal])
          ? activeLine.trackTexts[trackVal]
          : activeLine.text;
        const found = availTracks.find(a => a.value === trackVal);
        let tag = 'ТРЕК';
        if (found) {
          tag = found.label.replace(/^\[.*?\]\s*/, '').slice(0, 4).toUpperCase();
        } else if (item.trackId && item.trackId.startsWith('track:')) {
          tag = item.trackId.replace('track:', '').slice(0, 4).toUpperCase();
        } else if (item.trackId && item.trackId.startsWith('yt:')) {
          tag = item.trackId.replace('yt:', '').slice(0, 4).toUpperCase();
        }
        const tagHTML = showTags ? `<span class="sc-vol-tag">${SC.escapeHtml(tag)}</span>` : '';
        entries.push(`
          <div class="sc-vol-line sc-vol-track">
            ${tagHTML}
            <span class="sc-vol-text">${SC.escapeHtml(trackText)}</span>
          </div>
        `);
      } else {
        const targetLang = item.targetLang || item.lang || 'en';
        const transText = activeLine.translations
          ? (activeLine.translations[item.id] || activeLine.translations[targetLang])
          : null;
        const tag = SC.getLangName(targetLang).slice(0, 3).toUpperCase();
        const tagHTML = showTags ? `<span class="sc-vol-tag">${tag}</span>` : '';
        entries.push(`
          <div class="sc-vol-line sc-vol-trans">
            ${tagHTML}
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
        newLeft = Math.max(vRect.left, Math.min(vRect.right - oW, newLeft));
        newTop = Math.max(vRect.top, Math.min(vRect.bottom - oH, newTop));

        element.style.left = `${Math.round(newLeft)}px`;
        element.style.top = `${Math.round(newTop)}px`;

        const availW = Math.max(1, vRect.width - oW);
        const availH = Math.max(1, vRect.height - oH);
        SC.state.overlayPosX = Math.round(Math.max(0, Math.min(100, ((newLeft - vRect.left) / availW) * 100)));
        SC.state.overlayPosY = Math.round(Math.max(0, Math.min(100, ((newTop - vRect.top) / availH) * 100)));
        if (SC.syncPositionSliders) SC.syncPositionSliders();
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
