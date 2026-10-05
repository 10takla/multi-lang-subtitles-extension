/**
 * Video Subtitles Capturer - Widget Module
 * Manages the floating Shadow DOM panel, position sliders, window lifecycle, and drag events.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.hostEl = null;
  SC.shadowRoot = null;
  SC.widgetEl = null;
  SC.listEl = null;
  SC.countBadge = null;
  SC.launcherBtn = null;

  // Open control panel
  SC.openWidget = function() {
    const localVideo = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
    if (!localVideo) {
      if (SC.isTopFrame && SC.forwardCommandToFrames) {
        SC.forwardCommandToFrames('TOGGLE_WIDGET');
      }
      return;
    }
    SC.state.activeVideo = localVideo;
    SC.state.widgetVisible = true;
    if (SC.widgetEl) {
      SC.widgetEl.classList.remove('sc-hidden');
      if (SC.state.minimized) {
        SC.state.minimized = false;
        SC.widgetEl.classList.remove('sc-minimized');
        const minBtn = SC.shadowRoot?.getElementById('sc-btn-minimize');
        if (minBtn) minBtn.textContent = '_';
      }
      if (SC.updateWidgetPosition) SC.updateWidgetPosition();
    }
    if (SC.launcherBtn) {
      SC.launcherBtn.classList.add('sc-hidden');
    }
    if (SC.updateVideoIconsState) SC.updateVideoIconsState();
    if (SC.state.autoScroll && SC.scrollListToBottom) {
      SC.scrollListToBottom();
    }
    if (SC.broadcastFrameUpdate) SC.broadcastFrameUpdate();
  };

  // Close control panel
  SC.closeWidget = function() {
    SC.state.widgetVisible = false;
    if (SC.widgetEl) {
      SC.widgetEl.classList.add('sc-hidden');
    }
    if (SC.updateVideoIconsState) SC.updateVideoIconsState();
    if (SC.broadcastFrameUpdate) SC.broadcastFrameUpdate();
  };

  // Adjust control panel position strictly within video detect window boundaries (ai_instrs/_.md:8)
  SC.updateWidgetPosition = function() {
    if (!SC.widgetEl || !SC.state.widgetVisible) return;
    const video = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
    if (!video || !document.contains(video)) {
      SC.widgetEl.classList.add('sc-hidden');
      return;
    }

    const vRect = SC.getVideoBoundingClientRect ? SC.getVideoBoundingClientRect(video) : video.getBoundingClientRect();
    if (vRect.width < 50 || vRect.height < 50 || vRect.bottom <= 0 || vRect.top >= window.innerHeight || vRect.right <= 0 || vRect.left >= window.innerWidth) {
      SC.widgetEl.classList.add('sc-hidden');
      return;
    }

    SC.widgetEl.classList.remove('sc-hidden');

    const pad = 6;
    const vTop = Math.max(0, vRect.top);
    const vBottom = Math.min(window.innerHeight, vRect.bottom);
    const vLeft = Math.max(0, vRect.left);
    const vRight = Math.min(window.innerWidth, vRect.right);

    // Constrain maximum panel dimensions to video detect window
    SC.widgetEl.style.maxWidth = `${Math.max(260, Math.round((vRight - vLeft) - (pad * 2)))}px`;
    SC.widgetEl.style.maxHeight = `${Math.max(160, Math.round((vBottom - vTop) - (pad * 2)))}px`;

    const elW = SC.widgetEl.offsetWidth || 340;
    const elH = SC.widgetEl.offsetHeight || 220;

    const minX = vRect.left + pad;
    const maxX = Math.max(minX, vRect.right - elW - pad);
    const minY = vRect.top + pad;
    const maxY = Math.max(minY, vRect.bottom - elH - pad);

    let targetLeft;
    let targetTop;

    if (typeof SC.state.widgetVideoRelX === 'number' && typeof SC.state.widgetVideoRelY === 'number') {
      targetLeft = vRect.left + SC.state.widgetVideoRelX;
      targetTop = vRect.top + SC.state.widgetVideoRelY;
    } else {
      // Default position inside video detect window: near top-right
      targetLeft = vRight - elW - 12;
      targetTop = vTop + 12;
    }

    targetLeft = Math.max(minX, Math.min(maxX, targetLeft));
    targetTop = Math.max(minY, Math.min(maxY, targetTop));

    SC.widgetEl.style.left = `${Math.round(targetLeft)}px`;
    SC.widgetEl.style.top = `${Math.round(targetTop)}px`;
    SC.widgetEl.style.right = 'auto';
    SC.widgetEl.style.bottom = 'auto';
  };

  // Coalesced rAF-throttled position updater for overlay, icons, and control panel
  let posRafScheduled = false;
  SC.scheduleUpdatePositions = function() {
    if (posRafScheduled) return;
    posRafScheduled = true;
    requestAnimationFrame(() => {
      posRafScheduled = false;
      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      if (SC.updateVideoIconsPosition) SC.updateVideoIconsPosition();
      if (SC.updateWidgetPosition) SC.updateWidgetPosition();
    });
  };

  // Remove trimmed old subtitle lines from DOM to keep memory bounded
  SC.removeLinesFromDOM = function(removedLines) {
    if (!SC.listEl || !removedLines || !removedLines.length) return;
    for (let i = 0; i < removedLines.length; i++) {
      const el = SC.shadowRoot?.getElementById(removedLines[i].id);
      if (el) el.remove();
    }
    if (SC.updateBadge) SC.updateBadge();
  };

  // Initialize the in-page floating widget within Shadow DOM
  SC.initInPageWidget = function() {
    if (document.getElementById('subtitles-capturer-host')) return;

    const host = document.createElement('div');
    host.id = 'subtitles-capturer-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    (document.body || document.documentElement).appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    SC.hostEl = host;
    SC.shadowRoot = shadow;

    // Load stylesheet into Shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('content.css')
      : ((SC.extensionBaseUrl || '') + 'content.css');
    shadow.appendChild(link);

    // Fallback base styles for badge icon and container
    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host, #subtitles-capturer-host { position: fixed; z-index: 2147483647; pointer-events: none; }
      .sc-hidden { display: none !important; }
      .sc-video-badge-btn {
        position: fixed !important;
        width: 32px !important;
        height: 32px !important;
        border-radius: 8px !important;
        background: rgba(18, 20, 26, 0.88) !important;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        color: #f1f3f9 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        z-index: 2147483645 !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5) !important;
        padding: 0 !important;
        pointer-events: auto !important;
        opacity: 1;
        transition: opacity 0.25s ease, transform 0.15s ease, background 0.15s ease, border-color 0.15s ease !important;
      }
      .sc-video-badge-btn.sc-autohide {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 1s ease, transform 0.15s ease, background 0.15s ease, border-color 0.15s ease !important;
      }
      .sc-video-badge-btn svg { width: 18px !important; height: 18px !important; fill: currentColor !important; pointer-events: none !important; }
      .sc-video-badge-btn:hover { background: rgba(24, 119, 242, 0.95) !important; }
      .sc-video-badge-btn.sc-active { background: rgba(24, 119, 242, 0.95) !important; border-color: #60a5fa !important; color: #ffffff !important; }
      .sc-subtitles-toggle-wrap { display: inline-flex; align-items: center; gap: 5px; margin-right: 4px; padding: 2px 7px; background: rgba(255, 255, 255, 0.07); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); cursor: pointer; user-select: none; }
      .sc-subtitles-toggle-label { font-size: 11px; font-weight: 600; color: #e2e8f0; line-height: 1; }
      .sc-switch { position: relative; display: inline-block; width: 26px; height: 14px; cursor: pointer; margin: 0; }
      .sc-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
      .sc-switch-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(148, 163, 184, 0.35); border-radius: 14px; transition: 0.2s; }
      .sc-switch-slider:before { position: absolute; content: ""; height: 10px; width: 10px; left: 2px; bottom: 2px; background-color: #fff; border-radius: 50%; transition: 0.2s; }
      .sc-switch input:checked + .sc-switch-slider { background-color: #1877f2; }
      .sc-switch input:checked + .sc-switch-slider:before { transform: translateX(12px); }
      .sc-vol-loading { display: inline-flex !important; align-items: center !important; justify-content: center !important; vertical-align: middle !important; line-height: 1 !important; color: #93c5fd !important; }
      .sc-loading-spinner { display: inline-block !important; width: 1em !important; height: 1em !important; box-sizing: border-box !important; vertical-align: middle !important; animation: sc-spin 0.8s linear infinite !important; }
      span.sc-loading-spinner { border: 2px solid rgba(255, 255, 255, 0.25) !important; border-top-color: #60a5fa !important; border-radius: 50% !important; }
      svg.sc-loading-spinner { border: none !important; }
      @keyframes sc-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    shadow.appendChild(baseStyle);

    // Create Widget
    const widget = document.createElement('div');
    widget.className = 'sc-widget sc-hidden';
    widget.id = 'sc-widget';
    widget.innerHTML = `
      <div class="sc-header" id="sc-header">
        <div class="sc-title-area">
          <svg class="sc-icon" viewBox="0 0 24 24">
            <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
          </svg>
          <span id="sc-status">Мультисубтитры</span>
        </div>
        <div class="sc-header-actions">
          <div class="sc-subtitles-toggle-wrap" id="sc-toggle-subtitles-wrap" title="Субтитры: Вкл">
            <label class="sc-switch">
              <input type="checkbox" id="sc-toggle-subtitles" checked>
              <span class="sc-switch-slider"></span>
            </label>
          </div>
          <button class="sc-btn-icon" id="sc-btn-global-styles" title="Общие стили субтитров (подложка, шрифт, пресеты)">🎨</button>
          <button class="sc-btn-icon" id="sc-btn-lang-tags" title="Тег языка перед субтитрами на видео (По умолчанию: выкл)">🏷</button>
          <button class="sc-btn-icon" id="sc-btn-font-dec" title="Уменьшить шрифт">A-</button>
          <button class="sc-btn-icon" id="sc-btn-font-inc" title="Увеличить шрифт">A+</button>
          <button class="sc-btn-icon" id="sc-btn-minimize" title="Свернуть">_</button>
          <button class="sc-btn-icon" id="sc-btn-close" title="Скрыть панель">✕</button>
        </div>
      </div>

      <!-- Multi-language selection bar -->
      <div class="sc-lang-bar" id="sc-lang-bar">
        <div class="sc-lang-list" id="sc-lang-list"></div>
        <button class="sc-btn-add-lang" id="sc-btn-add-lang" title="Добавить новый селектор языка">+ Добавить селектор языка</button>
      </div>

      <!-- Embedded Styles Accordion Panel -->
      <div class="sc-styles-panel sc-hidden" id="sc-styles-panel"></div>

      <!-- Subtitle position sliders with input (ai_instrs/_.md:24) -->
      <div class="sc-pos-bar" id="sc-pos-bar">
        <span class="sc-pos-label">Позиция:</span>
        <div class="sc-pos-item">
          <span class="sc-pos-axis">X</span>
          <input type="range" class="sc-pos-slider" id="sc-slider-x" min="0" max="100" value="50" title="Позиционирование субтитров X (0-100%)">
          <div class="sc-pos-input-wrap">
            <input type="number" class="sc-pos-input" id="sc-input-x" min="0" max="100" value="50" title="Ввод координаты X (0-100%)"><span class="sc-pos-unit">%</span>
          </div>
        </div>
        <div class="sc-pos-item">
          <span class="sc-pos-axis">Y</span>
          <input type="range" class="sc-pos-slider" id="sc-slider-y" min="0" max="100" value="90" title="Позиционирование субтитров Y (0-100%)">
          <div class="sc-pos-input-wrap">
            <input type="number" class="sc-pos-input" id="sc-input-y" min="0" max="100" value="90" title="Ввод координаты Y (0-100%)"><span class="sc-pos-unit">%</span>
          </div>
        </div>
      </div>
    `;

    // Launcher button when widget is closed
    const launcher = document.createElement('button');
    launcher.className = 'sc-launcher-btn sc-hidden';
    launcher.id = 'sc-launcher';
    launcher.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
      </svg>
      <span>Субтитры</span>
    `;

    // Initialize On-video Subtitles Overlay
    if (SC.initOverlay) SC.initOverlay(shadow);

    shadow.appendChild(widget);
    shadow.appendChild(launcher);

    SC.widgetEl = widget;
    SC.launcherBtn = launcher;
    SC.listEl = null;
    SC.countBadge = null;

    // Prevent accidental HTML5 text/element dragging across widget except language items
    widget.addEventListener('dragstart', (e) => {
      if (!e.target.closest('.sc-lang-item')) {
        e.preventDefault();
      }
    });

    SC.setupWidgetEvents();
    if (SC.renderLanguageList) SC.renderLanguageList();
    SC.setupDraggable(widget, shadow.getElementById('sc-header'));
  };

  // Update on-video overlay when translation finishes
  SC.updateTranslationInDOM = function(lineId, itemIdOrLang, text) {
    if (SC.state.currentActiveLine && SC.state.currentActiveLine.id === lineId) {
      if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
    }
  };

  // Trigger on-video overlay update when language configuration changes
  SC.renderAllLines = function() {
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
  };

  // Apply font size adjustment to on-video overlay
  SC.applyFontSize = function() {
    if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
  };

  // Setup event listeners for widget controls
  SC.setupWidgetEvents = function() {
    const shadow = SC.shadowRoot;
    const autoScrollBtn = shadow.getElementById('sc-btn-autoscroll');
    const minBtn = shadow.getElementById('sc-btn-minimize');
    const closeBtn = shadow.getElementById('sc-btn-close');
    const clearBtn = shadow.getElementById('sc-btn-clear');
    const copyAllBtn = shadow.getElementById('sc-btn-copy-all');
    const fontIncBtn = shadow.getElementById('sc-btn-font-inc');
    const fontDecBtn = shadow.getElementById('sc-btn-font-dec');
    const addLangBtn = shadow.getElementById('sc-btn-add-lang');
    const sliderX = shadow.getElementById('sc-slider-x');
    const sliderY = shadow.getElementById('sc-slider-y');
    const inputX = shadow.getElementById('sc-input-x');
    const inputY = shadow.getElementById('sc-input-y');
    const langTagsBtn = shadow.getElementById('sc-btn-lang-tags');
    const globalStylesBtn = shadow.getElementById('sc-btn-global-styles');

    // Global subtitle styles modal (ai_instrs/_.md:22-30)
    if (globalStylesBtn) {
      globalStylesBtn.addEventListener('click', () => {
        if (SC.openGlobalStylesModal) SC.openGlobalStylesModal();
      });
    }

    // Add language selector button (ai_instrs/_.md)
    if (addLangBtn) {
      addLangBtn.addEventListener('click', () => {
        if (SC.addNewLanguageSelector) {
          SC.addNewLanguageSelector();
        }
      });
    }

    // Auto-scroll toggle
    if (autoScrollBtn) {
      autoScrollBtn.addEventListener('click', () => {
        SC.state.autoScroll = !SC.state.autoScroll;
        autoScrollBtn.classList.toggle('active', SC.state.autoScroll);
        if (SC.state.autoScroll && SC.scrollListToBottom) SC.scrollListToBottom();
      });
    }

    // Font size adjustments
    if (fontIncBtn) {
      fontIncBtn.addEventListener('click', () => {
        if (SC.state.fontSize < 22) {
          SC.state.fontSize += 1;
          SC.applyFontSize();
        }
      });
    }
    if (fontDecBtn) {
      fontDecBtn.addEventListener('click', () => {
        if (SC.state.fontSize > 10) {
          SC.state.fontSize -= 1;
          SC.applyFontSize();
        }
      });
    }

    // Minimize toggle
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        SC.state.minimized = !SC.state.minimized;
        SC.widgetEl.classList.toggle('sc-minimized', SC.state.minimized);
        minBtn.textContent = SC.state.minimized ? '▢' : '_';
      });
    }

    // Close to launcher
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        SC.closeWidget();
      });
    }

    // Launcher click to reopen
    if (SC.launcherBtn) {
      SC.launcherBtn.addEventListener('click', () => {
        SC.openWidget();
      });
    }

    // Video Subtitles Position sliders (ai_instrs/_.md:24)
    const posBar = shadow.getElementById('sc-pos-bar');
    if (posBar) {
      posBar.addEventListener('dragstart', (e) => e.preventDefault());
    }

    SC.syncPositionSliders = function() {
      if (sliderX && inputX) {
        sliderX.value = SC.state.overlayPosX;
        inputX.value = SC.state.overlayPosX;
      }
      if (sliderY && inputY) {
        sliderY.value = SC.state.overlayPosY;
        inputY.value = SC.state.overlayPosY;
      }
    };

    const attachPointerDrag = (slider, onUpdate) => {
      if (!slider) return;

      let activePointerId = null;

      const calcPct = (e) => {
        const rect = slider.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const x = e.clientX;
        return Math.round(Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100)));
      };

      slider.addEventListener('pointerdown', (e) => {
        activePointerId = e.pointerId;
        try { slider.setPointerCapture(e.pointerId); } catch (_) {}
        const pct = calcPct(e);
        slider.value = pct;
        onUpdate(pct);
        e.preventDefault();
        e.stopPropagation();
      });

      slider.addEventListener('pointermove', (e) => {
        if (activePointerId === null) return;
        const pct = calcPct(e);
        slider.value = pct;
        onUpdate(pct);
        e.preventDefault();
        e.stopPropagation();
      });

      const release = (e) => {
        if (activePointerId !== null) {
          try { slider.releasePointerCapture(activePointerId); } catch (_) {}
          activePointerId = null;
        }
      };

      slider.addEventListener('pointerup', release);
      slider.addEventListener('pointercancel', release);
      slider.addEventListener('dragstart', (e) => e.preventDefault());
    };

    attachPointerDrag(sliderX, (val) => {
      SC.state.overlayPosX = val;
      if (inputX) inputX.value = val;
      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
    });

    attachPointerDrag(sliderY, (val) => {
      SC.state.overlayPosY = val;
      if (inputY) inputY.value = val;
      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
    });

    if (sliderX && inputX) {
      sliderX.addEventListener('input', () => {
        SC.state.overlayPosX = Number(sliderX.value);
        inputX.value = SC.state.overlayPosX;
        if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      });
    }

    if (sliderY && inputY) {
      sliderY.addEventListener('input', () => {
        SC.state.overlayPosY = Number(sliderY.value);
        inputY.value = SC.state.overlayPosY;
        if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      });
    }

    // Direct numeric input handlers
    const setupInputField = (input, slider, isX) => {
      if (!input) return;

      const applyValue = (rawVal) => {
        let val = parseInt(rawVal, 10);
        if (isNaN(val)) val = 0;
        val = Math.max(0, Math.min(100, val));
        input.value = val;
        if (slider) slider.value = val;
        if (isX) {
          SC.state.overlayPosX = val;
        } else {
          SC.state.overlayPosY = val;
        }
        if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      };

      input.addEventListener('input', () => {
        if (input.value === '') return;
        applyValue(input.value);
      });

      input.addEventListener('change', () => {
        applyValue(input.value);
      });

      input.addEventListener('blur', () => {
        applyValue(input.value);
      });

      input.addEventListener('mousedown', (e) => e.stopPropagation());
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => e.stopPropagation());
    };

    setupInputField(inputX, sliderX, true);
    setupInputField(inputY, sliderY, false);

    SC.syncPositionSliders();

    // Master subtitles toggle (enable / disable subtitles display)
    const toggleSubtitles = shadow.getElementById('sc-toggle-subtitles');
    const toggleWrap = shadow.getElementById('sc-toggle-subtitles-wrap');
    const toggleLabel = shadow.getElementById('sc-toggle-subtitles-label');
    if (toggleSubtitles) {
      const updateToggleUI = () => {
        const isEnabled = SC.state.subtitlesEnabled !== false;
        toggleSubtitles.checked = isEnabled;
        if (toggleLabel) toggleLabel.textContent = isEnabled ? 'Вкл' : 'Выкл';
        if (toggleWrap) {
          toggleWrap.title = isEnabled ? 'Субтитры: Вкл' : 'Субтитры: Выкл';
          toggleWrap.classList.toggle('sc-disabled', !isEnabled);
        }
      };
      updateToggleUI();

      toggleSubtitles.addEventListener('change', () => {
        SC.state.subtitlesEnabled = toggleSubtitles.checked;
        updateToggleUI();
        showStatus(SC.state.subtitlesEnabled ? 'Субтитры включены' : 'Субтитры выключены');
        if (SC.state.subtitlesEnabled) {
          if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
        } else {
          if (SC.overlayEl) SC.overlayEl.classList.add('sc-hidden');
        }
      });
    }

    // Language tags prefix toggle (ai_instrs/_.md:23)
    if (langTagsBtn) {
      langTagsBtn.addEventListener('click', () => {
        SC.state.showLanguageTags = !SC.state.showLanguageTags;
        langTagsBtn.classList.toggle('active', SC.state.showLanguageTags);
        langTagsBtn.title = SC.state.showLanguageTags
          ? 'Тег языка перед субтитрами на видео: Вкл'
          : 'Тег языка перед субтитрами на видео: Выкл (по умолчанию)';
        showStatus(SC.state.showLanguageTags ? 'Теги языка: Вкл' : 'Теги языка: Выкл');
        if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      });
    }

    let toastTimer = null;
    function showStatus(text) {
      let toast = shadow.getElementById('sc-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sc-toast';
        toast.className = 'sc-toast';
        if (SC.widgetEl) SC.widgetEl.appendChild(toast);
        else shadow.appendChild(toast);
      }
      toast.textContent = text;
      toast.classList.add('sc-toast-visible');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('sc-toast-visible');
      }, 1800);
    }

    // Clear history
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (SC.clearAllSubtitles) SC.clearAllSubtitles();
      });
    }

    // Copy all
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', () => {
        const textToCopy = SC.state.lines.map(l => {
          const fullText = SC.getLineFullText ? SC.getLineFullText(l) : l.text;
          return fullText ? `[${l.videoTime}] ${fullText}` : '';
        }).filter(Boolean).join('\n');

        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyAllBtn.textContent = 'Скопировано!';
          setTimeout(() => { copyAllBtn.textContent = 'Копировать все'; }, 1500);
        });
      });
    }
  };

  // Draggable logic for widget window header: strictly constrained to active video detect window (ai_instrs/_.md:8)
  SC.setupDraggable = function(element, handle) {
    if (!handle || !element) return;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, select, input, a')) return;
      const video = SC.getActiveVideo ? SC.getActiveVideo() : null;
      if (!video) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      if (handle.setPointerCapture && e.pointerId !== undefined) {
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (_) {}
      }

      const onPointerMove = (ev) => {
        if (!isDragging) return;
        const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
        if (!v) return;

        const vRect = v.getBoundingClientRect();
        const elW = element.offsetWidth;
        const elH = element.offsetHeight;
        const pad = 6;

        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Strictly clamped inside the video detect window boundaries (ai_instrs/_.md:8)
        const minX = vRect.left + pad;
        const maxX = Math.max(minX, vRect.right - elW - pad);
        const minY = vRect.top + pad;
        const maxY = Math.max(minY, vRect.bottom - elH - pad);

        newLeft = Math.max(minX, Math.min(maxX, newLeft));
        newTop = Math.max(minY, Math.min(maxY, newTop));

        element.style.left = `${Math.round(newLeft)}px`;
        element.style.top = `${Math.round(newTop)}px`;
        element.style.right = 'auto';
        element.style.bottom = 'auto';

        SC.state.widgetVideoRelX = newLeft - vRect.left;
        SC.state.widgetVideoRelY = newTop - vRect.top;
      };

      const onPointerUp = (ev) => {
        if (!isDragging) return;
        isDragging = false;
        if (handle.releasePointerCapture && ev?.pointerId !== undefined) {
          try {
            handle.releasePointerCapture(ev.pointerId);
          } catch (_) {}
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });
  };
})();
