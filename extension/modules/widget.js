/**
 * Video Subtitles Capturer - Widget Module
 * Manages the floating Shadow DOM panel, language selector bar, subtitle feed, and events.
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
  SC.videoIcons = new Map();

  // Open control panel
  SC.openWidget = function() {
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
  };

  // Close control panel
  SC.closeWidget = function() {
    SC.state.widgetVisible = false;
    if (SC.widgetEl) {
      SC.widgetEl.classList.add('sc-hidden');
    }
    if (SC.updateVideoIconsState) SC.updateVideoIconsState();
  };

  // Update visual state (active class and title) for all on-video launcher icons
  SC.updateVideoIconsState = function() {
    if (!SC.videoIcons || SC.videoIcons.size === 0) return;
    for (const [video, btn] of SC.videoIcons.entries()) {
      const isActive = Boolean(SC.state.widgetVisible && SC.state.activeVideo === video);
      btn.classList.toggle('sc-active', isActive);
      btn.title = isActive ? 'Скрыть панель управления' : 'Открыть панель управления';
    }
  };

  // Register video as having detected subtitles and create on-video launcher icon
  SC.registerVideoWithSubtitles = function(video) {
    if (!video || !SC.shadowRoot) return;
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
    SC.updateVideoIconsPosition();
    SC.updateVideoIconsState();
  };

  // Update positions for all on-video launcher icons strictly within video detect window
  SC.updateVideoIconsPosition = function() {
    if (!SC.videoIcons || SC.videoIcons.size === 0) return;
    for (const [video, btn] of SC.videoIcons.entries()) {
      const doc = video.ownerDocument || document;
      if (!doc.contains(video)) {
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
      const top = Math.max(minTop, Math.min(maxTop, visibleTop + pad));

      btn.style.display = 'flex';
      btn.style.top = `${Math.round(top)}px`;
      btn.style.left = `${Math.round(left)}px`;
    }
  };

  // Adjust control panel position strictly within video detect window boundaries (ai_instrs/_.md:8)
  SC.updateWidgetPosition = function() {
    if (!SC.widgetEl || !SC.state.widgetVisible) return;
    const video = SC.getActiveVideo();
    const doc = video?.ownerDocument || document;
    if (!video || !doc.contains(video)) {
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
      targetLeft = visibleRight - elW - 12;
      targetTop = visibleTop + 12;
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
    SC.updateBadge();
  };

  // Initialize the in-page floating widget within Shadow DOM
  SC.initInPageWidget = function() {
    if (document.getElementById('subtitles-capturer-host')) return;

    const host = document.createElement('div');
    host.id = 'subtitles-capturer-host';
    (document.body || document.documentElement).appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    SC.hostEl = host;
    SC.shadowRoot = shadow;

    // Load stylesheet into Shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('content.css')
      : '/extension/content.css';
    shadow.appendChild(link);

    // Fallback base styles for badge icon and container
    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host, #subtitles-capturer-host { position: fixed; z-index: 2147483647; pointer-events: none; }
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
      }
      .sc-video-badge-btn svg { width: 18px !important; height: 18px !important; fill: currentColor !important; pointer-events: none !important; }
      .sc-video-badge-btn:hover { background: rgba(24, 119, 242, 0.95) !important; }
      .sc-video-badge-btn.sc-active { background: rgba(24, 119, 242, 0.95) !important; border-color: #60a5fa !important; color: #ffffff !important; }
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
    SC.initOverlay(shadow);

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
    SC.renderLanguageList();
    SC.setupDraggable(widget, shadow.getElementById('sc-header'));
  };

  // Render language selectors list in the widget header
  // Render language selectors list in the widget header
  SC.renderLanguageList = function() {
    if (!SC.shadowRoot) return;
    const container = SC.shadowRoot.getElementById('sc-lang-list');
    if (!container) return;
    container.innerHTML = '';

    const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];

    SC.state.languages.forEach((item, index) => {
      // Normalize selector properties
      if (!item.mode) {
        item.mode = (item.type === 'source' || item.mode === 'track') ? 'track' : 'trans';
      }
      if (item.mode === 'track') {
        if (!item.trackId || !availTracks.some(a => a.value === item.trackId)) {
          item.trackId = availTracks.length > 0 ? availTracks[0].value : '';
        }
        item.lang = item.trackId;
        item.type = 'source';
      } else {
        if (!item.sourceTrack || !availTracks.some(a => a.value === item.sourceTrack)) {
          item.sourceTrack = (item.sourceFrom && availTracks.some(a => a.value === item.sourceFrom))
            ? item.sourceFrom
            : (availTracks.length > 0 ? availTracks[0].value : '');
        }
        item.sourceFrom = item.sourceTrack;
        if (!item.targetLang) {
          item.targetLang = (item.lang && !item.lang.includes(':') && item.lang !== 'auto')
            ? item.lang
            : (SC.getSuggestedTargetLang ? SC.getSuggestedTargetLang(item.sourceTrack) : 'en');
        }
        item.lang = item.targetLang;
        item.type = 'translation';
      }

      const row = document.createElement('div');
      row.className = 'sc-lang-item';
      row.draggable = true;
      row.dataset.index = index;

      // Drag & Drop reordering
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(index));
        row.classList.add('sc-dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('sc-dragging');
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = index;
        if (!isNaN(fromIdx) && fromIdx !== toIdx) {
          const moved = SC.state.languages.splice(fromIdx, 1)[0];
          SC.state.languages.splice(toIdx, 0, moved);
          SC.renderLanguageList();
          SC.renderAllLines();
        }
      });

      // Drag handle
      const dragHandle = document.createElement('span');
      dragHandle.className = 'sc-lang-drag';
      dragHandle.title = 'Перетащите для изменения порядка';
      dragHandle.textContent = '⠿';
      row.appendChild(dragHandle);

      // Visibility toggle button (ai_instrs/_.md)
      const visBtn = document.createElement('button');
      visBtn.className = `sc-lang-vis ${item.visible ? '' : 'sc-hidden-vis'}`;
      visBtn.title = item.visible ? 'Скрыть этот язык' : 'Показать этот язык';
      visBtn.textContent = item.visible ? '👁' : '⊘';
      visBtn.addEventListener('click', () => {
        item.visible = !item.visible;
        SC.renderLanguageList();
        SC.renderAllLines();
      });
      row.appendChild(visBtn);

      // Controls container
      const controls = document.createElement('div');
      controls.className = 'sc-lang-controls';

      // Mode select: "Субтитр" (Выбор субтитра из суб-списка) vs "Перевод" (Перевод с выбором языка)
      const modeSelect = document.createElement('select');
      modeSelect.className = 'sc-lang-select sc-mode-select';
      modeSelect.title = 'Режим: Субтитр из суб-списка или Перевод';
      modeSelect.innerHTML = `
        <option value="track" ${item.mode === 'track' ? 'selected' : ''}>Субтитр</option>
        <option value="trans" ${item.mode === 'trans' ? 'selected' : ''}>Перевод</option>
      `;
      controls.appendChild(modeSelect);

      if (item.mode === 'track') {
        // Direct subtitle from sub-list (default: first element)
        const trackSelect = document.createElement('select');
        trackSelect.className = 'sc-lang-select sc-track-select';
        trackSelect.title = 'Выбор субтитра из суб-списка доступных к видео (по умолчанию первый)';

        if (availTracks.length > 0) {
          trackSelect.disabled = false;
          const trackExists = availTracks.some(a => a.value === item.trackId);
          availTracks.forEach((tr, idx) => {
            const opt = document.createElement('option');
            opt.value = tr.value;
            opt.textContent = tr.label;
            if (item.trackId === tr.value || (!trackExists && idx === 0)) {
              opt.selected = true;
              item.trackId = tr.value;
              item.lang = tr.value;
              if (item.trackId.startsWith('yt:')) {
                const code = item.trackId.replace('yt:', '');
                const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
                if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.trackId);
              }
            }
            trackSelect.appendChild(opt);
          });
        } else {
          trackSelect.innerHTML = '<option value="" disabled selected>Дорожки не обнаружены</option>';
          trackSelect.disabled = true;
        }

        trackSelect.addEventListener('change', (e) => {
          item.trackId = e.target.value;
          item.lang = item.trackId;
          if (item.trackId.startsWith('yt:')) {
            const code = item.trackId.replace('yt:', '');
            const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
            if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.trackId);
          }
          SC.renderAllLines();
        });
        controls.appendChild(trackSelect);
      } else {
        // Translation: source from sub-list + target translation language (Google Translate)
        const sourceSelect = document.createElement('select');
        sourceSelect.className = 'sc-lang-select sc-source-from-select';
        sourceSelect.title = 'Выбор источника из суб-списка';

        if (availTracks.length > 0) {
          sourceSelect.disabled = false;
          const sourceExists = availTracks.some(a => a.value === item.sourceTrack);
          availTracks.forEach((tr, idx) => {
            const opt = document.createElement('option');
            opt.value = tr.value;
            opt.textContent = tr.label;
            if (item.sourceTrack === tr.value || (!sourceExists && idx === 0)) {
              opt.selected = true;
              item.sourceTrack = tr.value;
              item.sourceFrom = tr.value;
              if (item.sourceTrack.startsWith('yt:')) {
                const code = item.sourceTrack.replace('yt:', '');
                const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
                if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.sourceTrack);
              }
            }
            sourceSelect.appendChild(opt);
          });
        } else {
          sourceSelect.innerHTML = '<option value="" disabled selected>Дорожки не обнаружены</option>';
          sourceSelect.disabled = true;
        }

        sourceSelect.addEventListener('change', (e) => {
          item.sourceTrack = e.target.value;
          item.sourceFrom = item.sourceTrack;
          if (item.sourceTrack.startsWith('yt:')) {
            const code = item.sourceTrack.replace('yt:', '');
            const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
            if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.sourceTrack);
          }
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo();
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
          }
          SC.renderAllLines();
        });
        controls.appendChild(sourceSelect);

        // Arrow
        const arrow = document.createElement('span');
        arrow.className = 'sc-trans-arrow';
        arrow.textContent = '➔';
        controls.appendChild(arrow);

        // Target language choice (Google Translate)
        const targetSelect = document.createElement('select');
        targetSelect.className = 'sc-lang-select sc-target-lang-select';
        targetSelect.title = 'Выбор языка перевода (Google Translate)';

        SC.AVAILABLE_LANGUAGES.forEach(lang => {
          const opt = document.createElement('option');
          opt.value = lang.code;
          opt.textContent = lang.name;
          if (item.targetLang === lang.code) opt.selected = true;
          targetSelect.appendChild(opt);
        });

        targetSelect.addEventListener('change', (e) => {
          item.targetLang = e.target.value;
          item.lang = item.targetLang;
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo();
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, item.bufferSec || 30);
          }
          SC.renderAllLines();
        });
        controls.appendChild(targetSelect);

        // Translation engine select (ai_instrs/_.md:21-24)
        item.engine = item.engine || 'google';
        const engineSelect = document.createElement('select');
        engineSelect.className = 'sc-lang-select sc-engine-select';
        engineSelect.title = 'Выбор движка перевода (по умолчанию: Google Translate)';
        const engines = SC.TRANSLATION_ENGINES || [
          { id: 'google', name: 'Google' },
          { id: 'yandex', name: 'Yandex' },
          { id: 'chrome', name: 'Chrome AI' }
        ];
        engines.forEach(eng => {
          const opt = document.createElement('option');
          opt.value = eng.id;
          opt.textContent = eng.name;
          if (item.engine === eng.id) opt.selected = true;
          engineSelect.appendChild(opt);
        });
        engineSelect.addEventListener('change', (e) => {
          item.engine = e.target.value;
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo();
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, item.bufferSec || 30);
          }
          SC.renderAllLines();
        });
        controls.appendChild(engineSelect);

        // Buffer input (seconds, default 30s) (ai_instrs/_.md:25)
        item.bufferSec = (item.bufferSec !== undefined && item.bufferSec !== null) ? Number(item.bufferSec) : 30;
        const bufferWrap = document.createElement('div');
        bufferWrap.className = 'sc-buffer-wrap';
        bufferWrap.title = 'Буфер упреждения перевода (по умолчанию 30 секунд)';
        bufferWrap.innerHTML = `
          <span class="sc-buffer-label">Буфер:</span>
          <input type="number" class="sc-buffer-input" min="5" max="300" step="5" value="${item.bufferSec}" title="Буфер упреждения перевода в секундах">
          <span class="sc-buffer-unit">с</span>
        `;
        const bufferInput = bufferWrap.querySelector('.sc-buffer-input');
        const onBufferChange = () => {
          const val = parseInt(bufferInput.value, 10);
          item.bufferSec = isNaN(val) ? 30 : Math.max(1, Math.min(600, val));
          bufferInput.value = item.bufferSec;
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo();
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, item.bufferSec);
          }
        };
        bufferInput.addEventListener('change', onBufferChange);
        bufferInput.addEventListener('input', onBufferChange);
        controls.appendChild(bufferWrap);
      }

      modeSelect.addEventListener('change', (e) => {
        const newMode = e.target.value;
        item.mode = newMode;
        if (newMode === 'track') {
          item.type = 'source';
          item.trackId = availTracks.length > 0 ? availTracks[0].value : '';
          item.lang = item.trackId;
          if (item.trackId && item.trackId.startsWith('yt:')) {
            const code = item.trackId.replace('yt:', '');
            const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
            if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.trackId);
          }
        } else {
          item.type = 'translation';
          item.sourceTrack = availTracks.length > 0 ? availTracks[0].value : '';
          item.sourceFrom = item.sourceTrack;
          const suggested = SC.getSuggestedTargetLang ? SC.getSuggestedTargetLang(item.sourceTrack) : 'en';
          item.targetLang = (item.targetLang && !item.targetLang.includes(':') && item.targetLang !== 'auto') ? item.targetLang : suggested;
          item.lang = item.targetLang;
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo();
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
          }
        }
        SC.renderLanguageList();
        SC.renderAllLines();
      });

      row.appendChild(controls);

      // Actions: Move up/down and delete
      const actions = document.createElement('div');
      actions.className = 'sc-lang-actions';

      if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.className = 'sc-btn-mini';
        upBtn.title = 'Вверх';
        upBtn.textContent = '▲';
        upBtn.addEventListener('click', () => {
          const tmp = SC.state.languages[index];
          SC.state.languages[index] = SC.state.languages[index - 1];
          SC.state.languages[index - 1] = tmp;
          SC.renderLanguageList();
          SC.renderAllLines();
        });
        actions.appendChild(upBtn);
      }

      if (index < SC.state.languages.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.className = 'sc-btn-mini';
        downBtn.title = 'Вниз';
        downBtn.textContent = '▼';
        downBtn.addEventListener('click', () => {
          const tmp = SC.state.languages[index];
          SC.state.languages[index] = SC.state.languages[index + 1];
          SC.state.languages[index + 1] = tmp;
          SC.renderLanguageList();
          SC.renderAllLines();
        });
        actions.appendChild(downBtn);
      }

      if (SC.state.languages.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'sc-btn-mini';
        delBtn.style.color = '#ef4444';
        delBtn.title = 'Удалить этот селектор';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
          SC.state.languages.splice(index, 1);
          SC.renderLanguageList();
          SC.renderAllLines();
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(actions);
      container.appendChild(row);
    });
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

    // Add language selector (ai_instrs/_.md)
    if (addLangBtn) {
      addLangBtn.addEventListener('click', () => {
        const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
        const nextLangCode = SC.getSuggestedTargetLang ? SC.getSuggestedTargetLang() : 'en';

        const newSelector = {
          id: `lang_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          type: 'translation',
          mode: 'trans',
          trackId: availTracks.length > 0 ? availTracks[0].value : '',
          sourceTrack: availTracks.length > 0 ? availTracks[0].value : '',
          sourceFrom: availTracks.length > 0 ? availTracks[0].value : '',
          targetLang: nextLangCode,
          engine: 'google',
          bufferSec: 30,
          lang: nextLangCode,
          visible: true
        };
        SC.state.languages.push(newSelector);
        SC.renderLanguageList();
        if (SC.retranslateItem) SC.retranslateItem(newSelector);
        if (SC.prefetchUpcomingTranslations) {
          const v = SC.getActiveVideo();
          SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, newSelector.bufferSec || 30);
        }
        SC.renderAllLines();
      });
    }

    // Auto-scroll toggle
    if (autoScrollBtn) {
      autoScrollBtn.addEventListener('click', () => {
        SC.state.autoScroll = !SC.state.autoScroll;
        autoScrollBtn.classList.toggle('active', SC.state.autoScroll);
        if (SC.state.autoScroll) SC.scrollListToBottom();
      });
    }

    // Font size adjustments
    fontIncBtn.addEventListener('click', () => {
      if (SC.state.fontSize < 22) {
        SC.state.fontSize += 1;
        SC.applyFontSize();
      }
    });
    fontDecBtn.addEventListener('click', () => {
      if (SC.state.fontSize > 10) {
        SC.state.fontSize -= 1;
        SC.applyFontSize();
      }
    });

    // Minimize toggle
    minBtn.addEventListener('click', () => {
      SC.state.minimized = !SC.state.minimized;
      SC.widgetEl.classList.toggle('sc-minimized', SC.state.minimized);
      minBtn.textContent = SC.state.minimized ? '▢' : '_';
    });

    // Close to launcher
    closeBtn.addEventListener('click', () => {
      SC.closeWidget();
    });

    // Launcher click to reopen
    SC.launcherBtn.addEventListener('click', () => {
      SC.openWidget();
    });

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
        SC.clearAllSubtitles();
      });
    }

    // Copy all
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', () => {
        const textToCopy = SC.state.lines.map(l => {
          const fullText = SC.getLineFullText(l);
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
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, select, input, a')) return;
      const video = SC.getActiveVideo();
      if (!video) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const v = SC.getActiveVideo();
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

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };
})();
