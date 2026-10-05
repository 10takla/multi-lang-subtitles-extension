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

    // Skeleton preview box for block resizing effects (ai_instrs/_.md:15, 25-26)
    const skeleton = document.createElement('div');
    skeleton.className = 'sc-overlay-skeleton sc-hidden';
    skeleton.id = 'sc-overlay-skeleton';
    shadowRoot.appendChild(skeleton);
    SC.overlaySkeletonEl = skeleton;

    if (typeof ResizeObserver !== 'undefined') {
      SC.videoResizeObserver = new ResizeObserver(() => {
        if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
        else SC.updateVideoOverlayPosition();
      });
    }

    return overlay;
  };

  // Show skeleton preview for block resizing (ai_instrs/_.md:15, 25-26)
  SC.showOverlaySkeleton = function(percent) {
    if (!SC.overlaySkeletonEl) return;
    const video = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
    if (!video || !document.contains(video)) return;
    const vRect = SC.getVideoBoundingClientRect ? SC.getVideoBoundingClientRect(video) : video.getBoundingClientRect();
    if (vRect.width < 50 || vRect.height < 50) return;

    const pct = typeof percent === 'number' ? percent : (SC.state.globalStyles?.maxWidthPercent ?? 100);
    const targetW = Math.round(vRect.width * (Math.max(10, Math.min(100, pct)) / 100));
    const targetH = Math.max(40, SC.overlayEl?.offsetHeight || 50);

    const posXPercent = typeof SC.state.overlayPosX === 'number' ? SC.state.overlayPosX : 50;
    const posYPercent = typeof SC.state.overlayPosY === 'number' ? SC.state.overlayPosY : 90;

    const availW = Math.max(0, vRect.width - targetW);
    const availH = Math.max(0, vRect.height - targetH);
    const posX = vRect.left + (availW * (posXPercent / 100));
    const posY = vRect.top + (availH * (posYPercent / 100));

    const el = SC.overlaySkeletonEl;
    el.style.width = `${targetW}px`;
    el.style.height = `${targetH}px`;
    el.style.left = `${Math.round(posX)}px`;
    el.style.top = `${Math.round(posY)}px`;
    el.textContent = `Макс. ширина: ${pct}% (${targetW}px)`;
    el.classList.remove('sc-hidden');
    el.classList.add('sc-skeleton-active');
  };

  // Hide skeleton preview (ai_instrs/_.md:25-26)
  SC.hideOverlaySkeleton = function() {
    if (!SC.overlaySkeletonEl) return;
    SC.overlaySkeletonEl.classList.remove('sc-skeleton-active');
    SC.overlaySkeletonEl.classList.add('sc-hidden');
  };

  // Adjust overlay position strictly within video boundaries ("в рамках окна видео")
  SC.updateVideoOverlayPosition = function() {
    if (!SC.overlayEl) return;
    const video = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
    if (!video || video.ownerDocument !== document || !SC.state.currentActiveLine || SC.state.subtitlesEnabled === false) {
      SC.overlayEl.classList.add('sc-hidden');
      if (SC.updateVideoIconsPosition) SC.updateVideoIconsPosition();
      return;
    }

    const vRect = SC.getVideoBoundingClientRect ? SC.getVideoBoundingClientRect(video) : video.getBoundingClientRect();
    if (vRect.width < 50 || vRect.height < 50 || vRect.bottom < 0 || vRect.top > window.innerHeight) {
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    // Make element accessible to layout calculation before reading dimensions to prevent unaligned jumps
    const wasHidden = SC.overlayEl.classList.contains('sc-hidden');
    if (wasHidden) {
      SC.overlayEl.style.visibility = 'hidden';
      SC.overlayEl.classList.remove('sc-hidden');
    }

    // Scale font size dynamically with video size
    const gStyles = SC.state.globalStyles || {};
    const gFont = gStyles.font || {};
    const globalSizePct = typeof gFont.fontSizePercent === 'number' ? gFont.fontSizePercent : 100;
    const scaleFactor = Math.max(0.7, Math.min(1.6, vRect.width / 800));
    const dynamicFontSize = Math.round((SC.state.fontSize || 13) * scaleFactor);
    SC.overlayEl.style.fontSize = `${Math.round(dynamicFontSize * globalSizePct / 100)}px`;

    // Max width of subtitle list text: 0-100% of video detect window (ai_instrs/_.md:15)
    const maxWPercent = typeof gStyles.maxWidthPercent === 'number' ? gStyles.maxWidthPercent : 100;
    SC.overlayEl.style.maxWidth = `${Math.round(vRect.width * (Math.max(10, Math.min(100, maxWPercent)) / 100))}px`;

    // Alignment of subtitle list text (ai_instrs/_.md:16, default left)
    const textAlign = gStyles.textAlign || 'left';
    SC.overlayEl.style.textAlign = textAlign;

    // Apply global sub-list background and gap (ai_instrs/_.md:12-14)
    const subListBg = gStyles.subListBg || {};
    const linesContainer = SC.shadowRoot?.getElementById('sc-video-overlay-lines');
    if (linesContainer) {
      const lineGap = gStyles.lineGap !== undefined ? `${gStyles.lineGap}px` : '3px';
      linesContainer.style.setProperty('--sc-overlay-gap', lineGap);
      linesContainer.style.gap = lineGap;
      linesContainer.style.textAlign = textAlign;
      linesContainer.style.alignItems = textAlign === 'center' ? 'center' : (textAlign === 'right' ? 'flex-end' : 'flex-start');
    }

    if (subListBg.enabled) {
      const subPad = (subListBg.padding !== undefined) ? subListBg.padding : (subListBg.paddingY ?? 6);
      SC.overlayEl.style.background = subListBg.color || 'rgba(12, 15, 20, 0.86)';
      SC.overlayEl.style.border = subListBg.border || '1px solid rgba(255, 255, 255, 0.2)';
      SC.overlayEl.style.padding = `${subPad}px`;
      SC.overlayEl.style.borderRadius = `${subListBg.borderRadius ?? 8}px`;
      SC.overlayEl.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.6)';
    } else {
      SC.overlayEl.style.background = 'transparent';
      SC.overlayEl.style.border = 'none';
      SC.overlayEl.style.boxShadow = 'none';
      SC.overlayEl.style.padding = '0';
    }

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
    SC.overlayEl.style.visibility = '';
    if (SC.updateVideoIconsPosition) SC.updateVideoIconsPosition();
  };

  // Render content of active subtitle line on video overlay
  SC.updateVideoOverlayContent = function() {
    if (!SC.overlayEl || !SC.shadowRoot) return;
    const linesContainer = SC.shadowRoot.getElementById('sc-video-overlay-lines');
    if (!linesContainer) return;

    const video = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
    const activeLine = SC.state.currentActiveLine;
    if (!video || video.ownerDocument !== document || !activeLine || SC.state.subtitlesEnabled === false) {
      linesContainer.innerHTML = '';
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    const showTags = Boolean(SC.state.showLanguageTags);
    linesContainer.classList.toggle('sc-with-tags', showTags);

    const vRect = video ? video.getBoundingClientRect() : { width: 800 };
    const scaleFactor = Math.max(0.7, Math.min(1.6, (vRect.width || 800) / 800));
    const dynamicFontSize = Math.round((SC.state.fontSize || 13) * scaleFactor);

    const entries = [];
    const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];

    SC.state.languages.forEach(item => {
      if (!item.visible) return;

      if (item.mode === 'track' || (!item.mode && item.type === 'source')) {
        const trackVal = item.trackId || item.lang || 'auto';
        let trackText = (activeLine.trackTexts && activeLine.trackTexts[trackVal])
          ? activeLine.trackTexts[trackVal]
          : activeLine.text;
        trackText = (trackText || '').trim();

        const isTrackLoading = SC.isTrackLoading ? SC.isTrackLoading(trackVal) : false;
        if (!trackText && !isTrackLoading) return;

        const found = availTracks.find(a => a.value === trackVal);
        let tag = 'ТРЕК';
        if (found) {
          tag = found.label.replace(/^\[.*?\]\s*/, '').slice(0, 4).toUpperCase();
        } else if (item.trackId && item.trackId.startsWith('track:')) {
          tag = item.trackId.replace('track:', '').slice(0, 4).toUpperCase();
        } else if (item.trackId && item.trackId.startsWith('yt:')) {
          tag = item.trackId.replace('yt:', '').slice(0, 4).toUpperCase();
        }
        // Resolve effective style: inherit from globalStyles or use individual override (ai_instrs/_.md:22-42)
        const gStyles = SC.state.globalStyles || {};
        const gFont = gStyles.font || {};
        const gSelectorBg = gStyles.selectorBg || {};
        const itemSt = item.style || {};

        const effectivePreset = itemSt.preset && itemSt.preset !== 'inherit' ? itemSt.preset : (gFont.preset || 'base');
        const effectiveFont = itemSt.fontFamily && itemSt.fontFamily !== 'inherit' ? itemSt.fontFamily : (gFont.fontFamily || 'inherit');
        const effectiveWeight = itemSt.fontWeight && itemSt.fontWeight !== 'inherit' ? itemSt.fontWeight : (gFont.fontWeight || 'normal');
        const effectiveStyle = itemSt.fontStyle && itemSt.fontStyle !== 'inherit' ? itemSt.fontStyle : (gFont.fontStyle || 'normal');
        const effectiveSizePct = itemSt.fontSizePercent && itemSt.fontSizePercent !== 'inherit' ? itemSt.fontSizePercent : (gFont.fontSizePercent || 100);
        const effectiveColor = itemSt.textColor && itemSt.textColor !== 'inherit' ? itemSt.textColor : (gFont.textColor || '#ffffff');
        
        // Background resolution: selectorBg from global styles vs individual background override
        const isBgEnabled = itemSt.bgEnabled !== undefined && itemSt.bgEnabled !== 'inherit'
          ? (itemSt.bgEnabled === true || itemSt.bgEnabled === 'on')
          : Boolean(gSelectorBg.enabled);
        const effectiveBgColor = itemSt.bgColor && itemSt.bgColor !== 'inherit'
          ? itemSt.bgColor
          : (gSelectorBg.color || 'rgba(0, 0, 0, 0.75)');
        const effectiveBgPadding = (itemSt.padding !== undefined && itemSt.padding !== 'inherit')
          ? itemSt.padding
          : (itemSt.paddingY !== undefined && itemSt.paddingY !== 'inherit')
            ? itemSt.paddingY
            : ((gSelectorBg.padding !== undefined) ? gSelectorBg.padding : (gSelectorBg.paddingY ?? 4));
        const effectiveBgBorderRadius = gSelectorBg.borderRadius ?? 4;
        const effectiveBgBorder = (itemSt.border && itemSt.border !== 'inherit')
          ? (itemSt.border !== 'none' ? `border: ${itemSt.border} !important;` : '')
          : (gSelectorBg.border && gSelectorBg.border !== 'none' ? `border: ${gSelectorBg.border} !important;` : '');

        const styles = [];
        if (effectiveFont && effectiveFont !== 'inherit') styles.push(`font-family: ${effectiveFont} !important;`);
        if (effectiveWeight && effectiveWeight !== 'normal') styles.push(`font-weight: ${effectiveWeight} !important;`);
        if (effectiveStyle && effectiveStyle !== 'normal') styles.push(`font-style: ${effectiveStyle} !important;`);
        const lineFontSize = Math.round(dynamicFontSize * (effectiveSizePct / 100));
        styles.push(`font-size: ${lineFontSize}px !important;`);
        if (effectiveColor) styles.push(`color: ${effectiveColor} !important;`);
        if (effectivePreset === 'netflix') {
          styles.push(`text-shadow: 0 0 4px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000 !important;`);
        } else if (itemSt.textShadow) {
          styles.push(`text-shadow: ${itemSt.textShadow} !important;`);
        } else if (gFont.textShadow) {
          styles.push(`text-shadow: ${gFont.textShadow} !important;`);
        }
        const textAlign = gStyles.textAlign || 'left';
        styles.push(`text-align: ${textAlign} !important;`);
        if (isBgEnabled) {
          styles.push(`background-color: ${effectiveBgColor} !important;`);
          styles.push(`padding: ${effectiveBgPadding}px !important; border-radius: ${effectiveBgBorderRadius}px !important;`);
          if (effectiveBgBorder) styles.push(effectiveBgBorder);
        }
        const textStyleAttr = styles.length > 0 ? `style="${styles.join(' ')}"` : '';

        const lineAlignStyle = textAlign === 'center'
          ? 'justify-content: center !important;'
          : (textAlign === 'right' ? 'justify-content: flex-end !important;' : 'justify-content: flex-start !important;');

        const tagHTML = showTags ? `<span class="sc-vol-tag">${SC.escapeHtml(tag)}</span>` : '';
        const spinnerHTML = SC.getLoadingSpinnerHtml ? SC.getLoadingSpinnerHtml() : '<span class="sc-vol-loading"><span class="sc-loading-spinner"></span></span>';
        entries.push(`
          <div class="sc-vol-line sc-vol-track" style="${lineAlignStyle}">
            ${tagHTML}
            <span class="sc-vol-text" ${textStyleAttr}>${trackText ? SC.escapeHtml(trackText) : spinnerHTML}</span>
          </div>
        `);
      } else {
        const targetLang = item.targetLang || item.lang || 'en';
        const transText = activeLine.translations
          ? (activeLine.translations[item.id] || activeLine.translations[targetLang] || null)
          : null;
        if (transText !== null && !transText.trim()) return;

        // Resolve effective style: inherit from globalStyles or use individual override (ai_instrs/_.md:22-42)
        const gStyles = SC.state.globalStyles || {};
        const gFont = gStyles.font || {};
        const gSelectorBg = gStyles.selectorBg || {};
        const itemSt = item.style || {};

        const effectivePreset = itemSt.preset && itemSt.preset !== 'inherit' ? itemSt.preset : (gFont.preset || 'base');
        const effectiveFont = itemSt.fontFamily && itemSt.fontFamily !== 'inherit' ? itemSt.fontFamily : (gFont.fontFamily || 'inherit');
        const effectiveWeight = itemSt.fontWeight && itemSt.fontWeight !== 'inherit' ? itemSt.fontWeight : (gFont.fontWeight || 'normal');
        const effectiveStyle = itemSt.fontStyle && itemSt.fontStyle !== 'inherit' ? itemSt.fontStyle : (gFont.fontStyle || 'normal');
        const effectiveSizePct = itemSt.fontSizePercent && itemSt.fontSizePercent !== 'inherit' ? itemSt.fontSizePercent : (gFont.fontSizePercent || 100);
        const effectiveColor = itemSt.textColor && itemSt.textColor !== 'inherit' ? itemSt.textColor : (gFont.textColor || '#ffffff');
        
        // Background resolution: selectorBg from global styles vs individual background override
        const isBgEnabled = itemSt.bgEnabled !== undefined && itemSt.bgEnabled !== 'inherit'
          ? (itemSt.bgEnabled === true || itemSt.bgEnabled === 'on')
          : Boolean(gSelectorBg.enabled);
        const effectiveBgColor = itemSt.bgColor && itemSt.bgColor !== 'inherit'
          ? itemSt.bgColor
          : (gSelectorBg.color || 'rgba(0, 0, 0, 0.75)');
        const effectiveBgPadding = (itemSt.padding !== undefined && itemSt.padding !== 'inherit')
          ? itemSt.padding
          : (itemSt.paddingY !== undefined && itemSt.paddingY !== 'inherit')
            ? itemSt.paddingY
            : ((gSelectorBg.padding !== undefined) ? gSelectorBg.padding : (gSelectorBg.paddingY ?? 4));
        const effectiveBgBorderRadius = gSelectorBg.borderRadius ?? 4;
        const effectiveBgBorder = (itemSt.border && itemSt.border !== 'inherit')
          ? (itemSt.border !== 'none' ? `border: ${itemSt.border} !important;` : '')
          : (gSelectorBg.border && gSelectorBg.border !== 'none' ? `border: ${gSelectorBg.border} !important;` : '');

        const styles = [];
        if (effectiveFont && effectiveFont !== 'inherit') styles.push(`font-family: ${effectiveFont} !important;`);
        if (effectiveWeight && effectiveWeight !== 'normal') styles.push(`font-weight: ${effectiveWeight} !important;`);
        if (effectiveStyle && effectiveStyle !== 'normal') styles.push(`font-style: ${effectiveStyle} !important;`);
        const lineFontSize = Math.round(dynamicFontSize * (effectiveSizePct / 100));
        styles.push(`font-size: ${lineFontSize}px !important;`);
        if (effectiveColor) styles.push(`color: ${effectiveColor} !important;`);
        if (effectivePreset === 'netflix') {
          styles.push(`text-shadow: 0 0 4px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000 !important;`);
        } else if (itemSt.textShadow) {
          styles.push(`text-shadow: ${itemSt.textShadow} !important;`);
        } else if (gFont.textShadow) {
          styles.push(`text-shadow: ${gFont.textShadow} !important;`);
        }
        const textAlign = gStyles.textAlign || 'left';
        styles.push(`text-align: ${textAlign} !important;`);
        if (isBgEnabled) {
          styles.push(`background-color: ${effectiveBgColor} !important;`);
          styles.push(`padding: ${effectiveBgPadding}px !important; border-radius: ${effectiveBgBorderRadius}px !important;`);
          if (effectiveBgBorder) styles.push(effectiveBgBorder);
        }
        const textStyleAttr = styles.length > 0 ? `style="${styles.join(' ')}"` : '';

        const lineAlignStyle = textAlign === 'center'
          ? 'justify-content: center !important;'
          : (textAlign === 'right' ? 'justify-content: flex-end !important;' : 'justify-content: flex-start !important;');

        const tag = SC.getLangName(targetLang).slice(0, 3).toUpperCase();
        const tagHTML = showTags ? `<span class="sc-vol-tag">${tag}</span>` : '';
        const spinnerHTML = SC.getLoadingSpinnerHtml ? SC.getLoadingSpinnerHtml() : '<span class="sc-vol-loading"><span class="sc-loading-spinner"></span></span>';
        entries.push(`
          <div class="sc-vol-line sc-vol-trans" style="${lineAlignStyle}">
            ${tagHTML}
            <span class="sc-vol-text" ${textStyleAttr}>${transText ? SC.escapeHtml(transText) : spinnerHTML}</span>
          </div>
        `);
      }
    });

    if (entries.length === 0) {
      linesContainer.innerHTML = '';
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
