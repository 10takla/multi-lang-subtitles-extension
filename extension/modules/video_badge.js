/**
 * Video Subtitles Capturer - Video Badge Module (ai_instrs/_.md:8, 43)
 * Manages the on-video detector launcher badge button, autohide timers, hover detection,
 * and positioning strictly constrained within the active video detect window.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.videoIcons = SC.videoIcons || new Map();
  SC.videoIconData = SC.videoIconData || new Map();
  SC.lastMousePos = SC.lastMousePos || { x: -1, y: -1 };
  let autohideGlobalListenersSetup = false;

  // Check whether an icon must remain visible (on pause or when control panel is open, ai_instrs/_.md:43)
  SC.isIconForcedVisible = function(video) {
    if (!video) return false;
    if (video.paused || video.ended) return true;
    if (SC.state?.widgetVisible) return true;
    return false;
  };

  // Smoothly show icon (ai_instrs/_.md:43)
  SC.showVideoIcon = function(video, btn) {
    const data = SC.videoIconData?.get(video);
    if (data?.inactivityTimer) {
      clearTimeout(data.inactivityTimer);
      data.inactivityTimer = null;
    }
    btn.classList.remove('sc-autohide');
  };

  // Smoothly hide icon with 1s fade-out (ai_instrs/_.md:43)
  SC.hideVideoIcon = function(video, btn) {
    const data = SC.videoIconData?.get(video);
    if (data?.inactivityTimer) {
      clearTimeout(data.inactivityTimer);
      data.inactivityTimer = null;
    }
    if (SC.isIconForcedVisible(video)) {
      btn.classList.remove('sc-autohide');
      return;
    }
    btn.classList.add('sc-autohide');
  };

  // Schedule smooth fade-out after 2-3 seconds of cursor inactivity over video (ai_instrs/_.md:43)
  SC.scheduleInactivityHide = function(video, btn) {
    const data = SC.videoIconData?.get(video);
    if (!data) return;
    if (data.inactivityTimer) {
      clearTimeout(data.inactivityTimer);
      data.inactivityTimer = null;
    }
    if (SC.isIconForcedVisible(video)) {
      btn.classList.remove('sc-autohide');
      return;
    }
    SC.showVideoIcon(video, btn);
    data.inactivityTimer = setTimeout(() => {
      data.inactivityTimer = null;
      if (!SC.isIconForcedVisible(video)) {
        btn.classList.add('sc-autohide');
      }
    }, 2500); // 2.5s (2–3 секунды неактивности курсора над видео)
  };

  // Test whether client coordinates are inside video detect window or over the icon button
  SC.isCursorInsideVideo = function(video, btn, clientX, clientY) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number' || clientX < 0 || clientY < 0) {
      return false;
    }
    if (btn) {
      const bRect = btn.getBoundingClientRect();
      if (clientX >= bRect.left && clientX <= bRect.right && clientY >= bRect.top && clientY <= bRect.bottom) {
        return true;
      }
    }
    const vRect = SC.getVideoBoundingClientRect ? SC.getVideoBoundingClientRect(video) : video.getBoundingClientRect();
    if (vRect) {
      if (clientX >= vRect.left && clientX <= vRect.right && clientY >= vRect.top && clientY <= vRect.bottom) {
        return true;
      }
    }
    return false;
  };

  // Global mouse listeners to handle hover, inactivity, and exit across video boundaries
  SC.setupVideoAutohideGlobalListeners = function() {
    if (autohideGlobalListenersSetup) return;
    autohideGlobalListenersSetup = true;

    const onPointerMove = (e) => {
      SC.lastMousePos.x = e.clientX;
      SC.lastMousePos.y = e.clientY;

      if (!SC.videoIcons || SC.videoIcons.size === 0) return;
      for (const [video, btn] of SC.videoIcons.entries()) {
        const data = SC.videoIconData?.get(video);
        if (!data) continue;

        const isInside = SC.isCursorInsideVideo(video, btn, e.clientX, e.clientY);
        if (isInside) {
          data.isHovered = true;
          // "при движении мыши над видео плавно появляется"
          SC.showVideoIcon(video, btn);
          if (!SC.isIconForcedVisible(video)) {
            // "при воспроизведении иконка плавно скрывается через 2–3 секунды неактивности курсора над видео"
            SC.scheduleInactivityHide(video, btn);
          }
        } else if (data.isHovered) {
          data.isHovered = false;
          // "при выходе за границы видео плавно скрывается за 1 секунду"
          if (!SC.isIconForcedVisible(video)) {
            SC.hideVideoIcon(video, btn);
          }
        }
      }
    };

    const onPointerLeave = (e) => {
      if (!e.relatedTarget && !e.toElement) {
        SC.lastMousePos.x = -1;
        SC.lastMousePos.y = -1;
        if (!SC.videoIcons || SC.videoIcons.size === 0) return;
        for (const [video, btn] of SC.videoIcons.entries()) {
          const data = SC.videoIconData?.get(video);
          if (data) data.isHovered = false;
          if (!SC.isIconForcedVisible(video)) {
            SC.hideVideoIcon(video, btn);
          }
        }
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });

    if (SC.getAccessibleDocuments) {
      SC.getAccessibleDocuments().forEach(doc => {
        try {
          doc.addEventListener('pointermove', onPointerMove, { passive: true });
          doc.addEventListener('pointerdown', onPointerMove, { passive: true });
          doc.addEventListener('pointerleave', onPointerLeave, { passive: true });
        } catch (_) {}
      });
    }
  };

  // Update visual state (active class and title) and autohide visibility for all on-video launcher icons
  SC.updateVideoIconsState = function() {
    if (!SC.videoIcons || SC.videoIcons.size === 0) return;
    for (const [video, btn] of SC.videoIcons.entries()) {
      const isActive = Boolean(SC.state.widgetVisible && (SC.state.activeVideo === video || !SC.state.activeVideo));
      btn.classList.toggle('sc-active', isActive);
      btn.title = isActive ? 'Скрыть панель управления' : 'Открыть панель управления';

      // Update autohide visibility: stays visible on pause or when control panel is open (ai_instrs/_.md:43)
      if (SC.isIconForcedVisible(video)) {
        SC.showVideoIcon(video, btn);
      } else {
        const isInside = SC.isCursorInsideVideo(video, btn, SC.lastMousePos.x, SC.lastMousePos.y);
        const data = SC.videoIconData?.get(video);
        if (data) data.isHovered = isInside;
        if (isInside) {
          SC.scheduleInactivityHide(video, btn);
        } else {
          SC.hideVideoIcon(video, btn);
        }
      }
    }
  };

  // Register video as having detected subtitles and create on-video launcher icon with autohide logic
  SC.registerVideoWithSubtitles = function(video) {
    if (!video || !SC.shadowRoot) return;
    if (video.ownerDocument !== document) return;
    if (SC.videoIcons.has(video)) return;

    const iconBtn = document.createElement('button');
    iconBtn.className = 'sc-video-badge-btn';
    iconBtn.title = 'Панель управления субтитрами';
    iconBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
      </svg>
    `;

    // Toggle control panel on click (ai_instrs/_.md:8)
    iconBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (SC.state.widgetVisible && SC.state.activeVideo === video) {
        SC.closeWidget();
      } else {
        SC.state.activeVideo = video;
        SC.openWidget();
      }
    });

    SC.shadowRoot.appendChild(iconBtn);
    SC.videoIcons.set(video, iconBtn);

    // Setup autohide listeners (ai_instrs/_.md:43)
    SC.setupVideoAutohideGlobalListeners();

    const onPlayStateChange = () => {
      if (SC.isIconForcedVisible(video)) {
        SC.showVideoIcon(video, iconBtn);
      } else {
        const isInside = SC.isCursorInsideVideo(video, iconBtn, SC.lastMousePos.x, SC.lastMousePos.y);
        const data = SC.videoIconData?.get(video);
        if (data) data.isHovered = isInside;
        if (isInside) {
          SC.scheduleInactivityHide(video, iconBtn);
        } else {
          SC.hideVideoIcon(video, iconBtn);
        }
      }
    };

    video.addEventListener('play', onPlayStateChange);
    video.addEventListener('playing', onPlayStateChange);
    video.addEventListener('pause', onPlayStateChange);
    video.addEventListener('ended', onPlayStateChange);

    const onDirectMouseMove = () => {
      const data = SC.videoIconData?.get(video);
      if (data) data.isHovered = true;
      SC.showVideoIcon(video, iconBtn);
      if (!SC.isIconForcedVisible(video)) {
        SC.scheduleInactivityHide(video, iconBtn);
      }
    };

    const onDirectMouseLeave = (e) => {
      const data = SC.videoIconData?.get(video);
      if (e && typeof e.clientX === 'number') {
        if (SC.isCursorInsideVideo(video, iconBtn, e.clientX, e.clientY)) {
          return;
        }
      }
      if (data) data.isHovered = false;
      if (!SC.isIconForcedVisible(video)) {
        SC.hideVideoIcon(video, iconBtn);
      }
    };

    video.addEventListener('pointermove', onDirectMouseMove, { passive: true });
    video.addEventListener('pointerenter', onDirectMouseMove, { passive: true });
    video.addEventListener('pointerleave', onDirectMouseLeave, { passive: true });
    video.addEventListener('pointerdown', onDirectMouseMove, { passive: true });

    iconBtn.addEventListener('pointermove', onDirectMouseMove, { passive: true });
    iconBtn.addEventListener('pointerenter', onDirectMouseMove, { passive: true });
    iconBtn.addEventListener('pointerleave', onDirectMouseLeave, { passive: true });
    iconBtn.addEventListener('pointerdown', onDirectMouseMove, { passive: true });

    const iconData = {
      video,
      btn: iconBtn,
      inactivityTimer: null,
      isHovered: false,
      cleanup: () => {
        if (iconData.inactivityTimer) {
          clearTimeout(iconData.inactivityTimer);
          iconData.inactivityTimer = null;
        }
        video.removeEventListener('play', onPlayStateChange);
        video.removeEventListener('playing', onPlayStateChange);
        video.removeEventListener('pause', onPlayStateChange);
        video.removeEventListener('ended', onPlayStateChange);
        video.removeEventListener('pointermove', onDirectMouseMove);
        video.removeEventListener('pointerenter', onDirectMouseMove);
        video.removeEventListener('pointerleave', onDirectMouseLeave);
        video.removeEventListener('pointerdown', onDirectMouseMove);
        iconBtn.removeEventListener('pointermove', onDirectMouseMove);
        iconBtn.removeEventListener('pointerenter', onDirectMouseMove);
        iconBtn.removeEventListener('pointerleave', onDirectMouseLeave);
        iconBtn.removeEventListener('pointerdown', onDirectMouseMove);
      }
    };

    SC.videoIconData.set(video, iconData);

    SC.updateVideoIconsPosition();
    SC.updateVideoIconsState();
  };

  // Update positions for all on-video launcher icons strictly within video detect window
  SC.updateVideoIconsPosition = function() {
    if (!SC.videoIcons || SC.videoIcons.size === 0) return;
    for (const [video, btn] of SC.videoIcons.entries()) {
      const doc = video.ownerDocument || document;
      if (!doc.contains(video)) {
        const data = SC.videoIconData?.get(video);
        if (data) {
          data.cleanup();
          SC.videoIconData.delete(video);
        }
        btn.remove();
        SC.videoIcons.delete(video);
        continue;
      }

      const rect = SC.getVideoBoundingClientRect ? SC.getVideoBoundingClientRect(video) : video.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50 || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        btn.style.display = 'none';
        continue;
      }

      const iconW = 32;
      const iconH = 32;
      const pad = 10;

      // Ensure icon stays strictly within the visible intersection of video and viewport (ai_instrs/_.md:8)
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(window.innerHeight, rect.bottom);
      const visibleLeft = Math.max(0, rect.left);
      const visibleRight = Math.min(window.innerWidth, rect.right);

      const minLeft = visibleLeft + pad;
      const maxLeft = Math.max(minLeft, visibleRight - iconW - pad);
      const minTop = visibleTop + pad;
      const maxTop = Math.max(minTop, visibleBottom - iconH - pad);

      const left = Math.max(minLeft, Math.min(maxLeft, visibleRight - iconW - pad));
      const top = SC.isMobilePanel?.() ? rect.top + pad : Math.max(minTop, Math.min(maxTop, visibleTop + pad));

      btn.style.display = 'flex';
      btn.style.top = `${SC.isMobilePanel?.() ? top : Math.round(top)}px`;
      btn.style.left = `${SC.isMobilePanel?.() ? left : Math.round(left)}px`;
    }
  };
})();
