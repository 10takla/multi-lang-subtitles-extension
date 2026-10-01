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
    link.href = chrome.runtime.getURL('content.css');
    shadow.appendChild(link);

    // Create Widget
    const widget = document.createElement('div');
    widget.className = 'sc-widget';
    widget.id = 'sc-widget';
    widget.innerHTML = `
      <div class="sc-header" id="sc-header">
        <div class="sc-title-area">
          <svg class="sc-icon" viewBox="0 0 24 24">
            <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
          </svg>
          <span id="sc-status">Мультисубтитры</span>
          <span class="sc-badge" id="sc-count">0</span>
        </div>
        <div class="sc-header-actions">
          <button class="sc-btn-icon" id="sc-btn-position" title="Позиционирование субтитров на видео (Внизу / В центре / Вверху)">⛶</button>
          <button class="sc-btn-icon active" id="sc-btn-autoscroll" title="Автопрокрутка к новым строкам">↓</button>
          <button class="sc-btn-icon" id="sc-btn-font-dec" title="Уменьшить шрифт">A-</button>
          <button class="sc-btn-icon" id="sc-btn-font-inc" title="Увеличить шрифт">A+</button>
          <button class="sc-btn-icon" id="sc-btn-minimize" title="Свернуть">_</button>
          <button class="sc-btn-icon" id="sc-btn-close" title="Скрыть панель">✕</button>
        </div>
      </div>

      <!-- Multi-language selection bar -->
      <div class="sc-lang-bar" id="sc-lang-bar">
        <div class="sc-lang-list" id="sc-lang-list"></div>
        <button class="sc-btn-add-lang" id="sc-btn-add-lang" title="Добавить перевод или альтернативную дорожку">+ Добавить язык</button>
      </div>

      <div class="sc-body" id="sc-body">
        <div class="sc-empty-msg" id="sc-empty">
          Ожидание субтитров...<br>
          Включите субтитры в плеере или воспроизведите видео.
        </div>
      </div>

      <div class="sc-footer">
        <button class="sc-btn-text" id="sc-btn-clear">Очистить</button>
        <button class="sc-btn-text" id="sc-btn-copy-all">Копировать все</button>
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
    SC.listEl = shadow.getElementById('sc-body');
    SC.countBadge = shadow.getElementById('sc-count');

    SC.setupWidgetEvents();
    SC.renderLanguageList();
    SC.setupDraggable(widget, shadow.getElementById('sc-header'));
  };

  // Render language selectors list in the widget header
  SC.renderLanguageList = function() {
    if (!SC.shadowRoot) return;
    const container = SC.shadowRoot.getElementById('sc-lang-list');
    if (!container) return;
    container.innerHTML = '';

    const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];

    SC.state.languages.forEach((item, index) => {
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

      // Visibility toggle button
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

      // Controls: Source selector or Translation/Track selector
      if (item.type === 'source') {
        row.classList.add('sc-source-highlight');

        const badge = document.createElement('span');
        badge.className = 'sc-lang-badge';
        badge.textContent = '★ Источник';
        row.appendChild(badge);

        const select = document.createElement('select');
        select.className = 'sc-lang-select sc-source-select';
        select.title = 'Выбор источника субтитров для видео';

        if (availTracks.length > 0) {
          availTracks.forEach((tr, idx) => {
            const opt = document.createElement('option');
            opt.value = tr.value;
            opt.textContent = tr.label;
            // Default to first track from list if auto or unset
            if ((item.lang === 'auto' || !item.lang) && idx === 0) {
              item.lang = tr.value;
              if (tr.value.startsWith('yt:')) {
                const code = tr.value.replace('yt:', '');
                const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
                if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, tr.value);
              }
            }
            if (item.lang === tr.value) opt.selected = true;
            select.appendChild(opt);
          });
        } else {
          select.innerHTML = '<option value="auto" selected>Авто / Плеер</option>';
        }

        select.addEventListener('change', (e) => {
          item.lang = e.target.value;
          if (item.lang.startsWith('yt:')) {
            const code = item.lang.replace('yt:', '');
            const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
            if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.lang);
          }
          SC.renderAllLines();
        });
        row.appendChild(select);
      } else {
        const controls = document.createElement('div');
        controls.className = 'sc-lang-controls';

        // Mode: Translation (Google Translate) vs Native video track
        const modeSelect = document.createElement('select');
        modeSelect.className = 'sc-lang-select sc-mode-select';
        modeSelect.title = 'Режим: Перевод или субтитр из видео';
        modeSelect.innerHTML = `
          <option value="trans" ${item.mode !== 'track' ? 'selected' : ''}>Перевод</option>
          <option value="track" ${item.mode === 'track' ? 'selected' : ''}>Субтитр видео</option>
        `;
        controls.appendChild(modeSelect);

        if (item.mode === 'track') {
          // Direct subtitle from available video tracks
          const trackSelect = document.createElement('select');
          trackSelect.className = 'sc-lang-select sc-track-select';
          trackSelect.title = 'Выбор субтитра из списка субтитров доступных к видео';

          if (availTracks.length > 0) {
            availTracks.forEach((tr, idx) => {
              const opt = document.createElement('option');
              opt.value = tr.value;
              opt.textContent = tr.label;
              if (item.lang === tr.value || (!item.lang && idx === 0)) {
                opt.selected = true;
                item.lang = tr.value;
              }
              trackSelect.appendChild(opt);
            });
          } else {
            trackSelect.innerHTML = '<option value="track:0">Субтитры не найдены</option>';
          }

          trackSelect.addEventListener('change', (e) => {
            item.lang = e.target.value;
            if (item.lang.startsWith('yt:')) {
              const code = item.lang.replace('yt:', '');
              const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
              if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.lang);
            }
            SC.renderAllLines();
          });
          controls.appendChild(trackSelect);
        } else {
          // Translation: source selection + target translation language selection
          // 1. Source choice
          const sourceSelect = document.createElement('select');
          sourceSelect.className = 'sc-lang-select sc-source-from-select';
          sourceSelect.title = 'Выбор источника для перевода';

          const defOpt = document.createElement('option');
          defOpt.value = 'auto';
          defOpt.textContent = 'Из оригинала';
          if (!item.sourceFrom || item.sourceFrom === 'auto') defOpt.selected = true;
          sourceSelect.appendChild(defOpt);

          availTracks.forEach(tr => {
            const opt = document.createElement('option');
            opt.value = tr.value;
            opt.textContent = tr.label;
            if (item.sourceFrom === tr.value) opt.selected = true;
            sourceSelect.appendChild(opt);
          });

          sourceSelect.addEventListener('change', (e) => {
            item.sourceFrom = e.target.value;
            if (item.sourceFrom.startsWith('yt:')) {
              const code = item.sourceFrom.replace('yt:', '');
              const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
              if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.sourceFrom);
            }
            if (SC.retranslateItem) SC.retranslateItem(item);
            SC.renderAllLines();
          });
          controls.appendChild(sourceSelect);

          // Arrow
          const arrow = document.createElement('span');
          arrow.className = 'sc-trans-arrow';
          arrow.textContent = '➔';
          controls.appendChild(arrow);

          // 2. Target language choice
          const targetSelect = document.createElement('select');
          targetSelect.className = 'sc-lang-select sc-target-lang-select';
          targetSelect.title = 'Выбор языка перевода (Google Translate)';

          SC.AVAILABLE_LANGUAGES.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.name;
            if (item.lang === lang.code) opt.selected = true;
            targetSelect.appendChild(opt);
          });

          targetSelect.addEventListener('change', (e) => {
            item.lang = e.target.value;
            if (SC.retranslateItem) SC.retranslateItem(item);
            SC.renderAllLines();
          });
          controls.appendChild(targetSelect);
        }

        modeSelect.addEventListener('change', (e) => {
          const newMode = e.target.value;
          item.mode = newMode;
          if (newMode === 'track') {
            item.lang = availTracks.length > 0 ? availTracks[0].value : 'track:0';
            if (item.lang.startsWith('yt:')) {
              const code = item.lang.replace('yt:', '');
              const foundYt = SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
              if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.lang);
            }
          } else {
            item.sourceFrom = 'auto';
            item.lang = (item.lang && !item.lang.includes(':')) ? item.lang : 'ru';
            if (SC.retranslateItem) SC.retranslateItem(item);
          }
          SC.renderLanguageList();
          SC.renderAllLines();
        });

        row.appendChild(controls);
      }

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

      if (item.type === 'translation') {
        const delBtn = document.createElement('button');
        delBtn.className = 'sc-btn-mini';
        delBtn.style.color = '#ef4444';
        delBtn.title = 'Удалить этот перевод';
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

  // Render HTML structure for a single subtitle line in the widget
  SC.renderLineHTML = function(line) {
    let entriesHTML = '';
    SC.state.languages.forEach(item => {
      if (!item.visible) return;

      if (item.type === 'source') {
        entriesHTML += `
          <div class="sc-sub-entry sc-sub-source">
            <span class="sc-sub-tag">★ ОРИГ</span>
            <span class="sc-sub-text">${SC.escapeHtml(line.text)}</span>
          </div>
        `;
      } else if (item.mode === 'track') {
        const trackText = line.trackTexts && line.trackTexts[item.lang] ? line.trackTexts[item.lang] : line.text;
        const avail = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
        const found = avail.find(a => a.value === item.lang);
        const tag = (found ? found.label.replace(/^\[.*?\]\s*/, '') : (item.label || 'ТРЕК')).slice(0, 6).toUpperCase();
        entriesHTML += `
          <div class="sc-sub-entry sc-sub-track" data-track="${item.lang}">
            <span class="sc-sub-tag" style="background:rgba(168,85,247,0.2);color:#c084fc">${SC.escapeHtml(tag)}</span>
            <span class="sc-sub-text">${SC.escapeHtml(trackText)}</span>
          </div>
        `;
      } else {
        const transText = line.translations ? (line.translations[item.id] || line.translations[item.lang]) : null;
        const tag = SC.getLangName(item.lang).slice(0, 4).toUpperCase();
        entriesHTML += `
          <div class="sc-sub-entry sc-sub-trans" data-item-id="${item.id}" data-lang="${item.lang}">
            <span class="sc-sub-tag">${tag}</span>
            <span class="sc-sub-text">${transText ? SC.escapeHtml(transText) : '<span class="sc-sub-loading">перевод...</span>'}</span>
          </div>
        `;
      }
    });

    return `
      <span class="sc-timestamp">${line.videoTime}</span>
      <div class="sc-line-content">
        ${entriesHTML || '<span class="sc-sub-loading">(языки скрыты)</span>'}
      </div>
      <button class="sc-line-copy" title="Копировать строку">📋</button>
    `;
  };

  // Update translation text for a line in the widget DOM
  SC.updateTranslationInDOM = function(lineId, itemIdOrLang, text) {
    if (SC.listEl) {
      const lineEl = SC.shadowRoot.getElementById(lineId);
      if (lineEl) {
        const transRow = lineEl.querySelector(`.sc-sub-trans[data-item-id="${itemIdOrLang}"] .sc-sub-text`)
                      || lineEl.querySelector(`.sc-sub-trans[data-lang="${itemIdOrLang}"] .sc-sub-text`);
        if (transRow) {
          transRow.innerHTML = SC.escapeHtml(text);
        }
      }
    }
    if (SC.state.currentActiveLine && SC.state.currentActiveLine.id === lineId) {
      if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
    }
  };

  // Append new subtitle line to widget DOM
  SC.appendLineToDOM = function(line) {
    if (!SC.listEl) return;

    const emptyMsg = SC.shadowRoot.getElementById('sc-empty');
    if (emptyMsg) emptyMsg.remove();

    const prevLatest = SC.listEl.querySelector('.sc-line.sc-latest');
    if (prevLatest) prevLatest.classList.remove('sc-latest');

    const lineEl = document.createElement('div');
    lineEl.className = 'sc-line sc-latest';
    lineEl.id = line.id;
    lineEl.style.fontSize = `${SC.state.fontSize}px`;
    lineEl.innerHTML = SC.renderLineHTML(line);

    lineEl.querySelector('.sc-line-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      const allText = SC.getLineFullText(line);
      navigator.clipboard.writeText(`[${line.videoTime}] ${allText}`).then(() => {
        const btn = lineEl.querySelector('.sc-line-copy');
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '📋'; }, 1200);
      });
    });

    SC.listEl.appendChild(lineEl);
    SC.updateBadge();

    if (SC.state.autoScroll) {
      SC.scrollListToBottom();
    }
  };

  // Render all recorded lines in the widget
  SC.renderAllLines = function() {
    if (!SC.listEl) return;
    if (!SC.state.lines.length) {
      SC.listEl.innerHTML = `
        <div class="sc-empty-msg" id="sc-empty">
          Ожидание субтитров...<br>
          Включите субтитры в плеере или воспроизведите видео.
        </div>
      `;
      if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      return;
    }

    SC.listEl.innerHTML = '';
    SC.state.lines.forEach((line, idx) => {
      const lineEl = document.createElement('div');
      const isLatest = idx === SC.state.lines.length - 1;
      lineEl.className = `sc-line ${isLatest ? 'sc-latest' : ''}`;
      lineEl.id = line.id;
      lineEl.style.fontSize = `${SC.state.fontSize}px`;
      lineEl.innerHTML = SC.renderLineHTML(line);

      lineEl.querySelector('.sc-line-copy').addEventListener('click', (e) => {
        e.stopPropagation();
        const allText = SC.getLineFullText(line);
        navigator.clipboard.writeText(`[${line.videoTime}] ${allText}`).then(() => {
          const btn = lineEl.querySelector('.sc-line-copy');
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });

      SC.listEl.appendChild(lineEl);
    });

    SC.updateBadge();
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
    if (SC.state.autoScroll) {
      SC.scrollListToBottom();
    }
  };

  // Update existing line in DOM
  SC.updateLineInDOM = function(line) {
    if (!SC.listEl) return;
    const lineEl = SC.shadowRoot.getElementById(line.id);
    if (lineEl) {
      lineEl.innerHTML = SC.renderLineHTML(line);
      lineEl.querySelector('.sc-line-copy').addEventListener('click', (e) => {
        e.stopPropagation();
        const allText = SC.getLineFullText(line);
        navigator.clipboard.writeText(`[${line.videoTime}] ${allText}`).then(() => {
          const btn = lineEl.querySelector('.sc-line-copy');
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });
    }
    if (SC.state.currentActiveLine && SC.state.currentActiveLine.id === line.id) {
      if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
    }
  };

  SC.scrollListToBottom = function() {
    if (!SC.listEl) return;
    SC.listEl.scrollTop = SC.listEl.scrollHeight;
  };

  SC.updateBadge = function() {
    if (SC.countBadge) {
      SC.countBadge.textContent = SC.state.lines.length;
    }
  };

  SC.clearAllSubtitles = function() {
    SC.state.lines = [];
    SC.state.lastAddedText = '';
    SC.state.lastAddedTime = 0;
    SC.state.activeStreamingLineId = null;
    SC.state.currentActiveLine = null;
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();

    if (SC.listEl) {
      SC.listEl.innerHTML = `
        <div class="sc-empty-msg" id="sc-empty">
          Ожидание субтитров...<br>
          Включите субтитры в плеере или воспроизведите видео.
        </div>
      `;
    }
    SC.updateBadge();

    try {
      chrome.runtime.sendMessage({ type: 'RESET_COUNT' }).catch(() => {});
    } catch (_) {}
  };

  SC.applyFontSize = function() {
    if (SC.listEl) {
      const lines = SC.listEl.querySelectorAll('.sc-line');
      lines.forEach(l => {
        l.style.fontSize = `${SC.state.fontSize}px`;
      });
    }
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
    const posBtn = shadow.getElementById('sc-btn-position');

    // Add translation language
    if (addLangBtn) {
      addLangBtn.addEventListener('click', () => {
        const existingCodes = new Set(SC.state.languages.map(l => l.lang));
        const nextLang = SC.AVAILABLE_LANGUAGES.find(l => !existingCodes.has(l.code)) || SC.AVAILABLE_LANGUAGES[0];

        const newTrans = {
          id: `trans_${Date.now()}`,
          type: 'translation',
          mode: 'trans',
          sourceFrom: 'auto',
          lang: nextLang.code,
          visible: true
        };
        SC.state.languages.push(newTrans);
        SC.renderLanguageList();
        if (SC.retranslateItem) SC.retranslateItem(newTrans);
        SC.renderAllLines();
      });
    }

    // Auto-scroll toggle
    autoScrollBtn.addEventListener('click', () => {
      SC.state.autoScroll = !SC.state.autoScroll;
      autoScrollBtn.classList.toggle('active', SC.state.autoScroll);
      if (SC.state.autoScroll) SC.scrollListToBottom();
    });

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
      SC.state.widgetVisible = false;
      SC.widgetEl.classList.add('sc-hidden');
      SC.launcherBtn.classList.remove('sc-hidden');
    });

    // Launcher click to reopen
    SC.launcherBtn.addEventListener('click', () => {
      SC.state.widgetVisible = true;
      SC.widgetEl.classList.remove('sc-hidden');
      SC.launcherBtn.classList.add('sc-hidden');
      if (SC.state.autoScroll) SC.scrollListToBottom();
    });

    // Video Subtitles Position control (bottom -> center -> top -> bottom)
    if (posBtn) {
      posBtn.addEventListener('click', () => {
        if (SC.state.videoOverlayPosition === 'bottom') {
          SC.state.videoOverlayPosition = 'center';
          posBtn.title = 'Позиционирование субтитров на видео: По центру';
          posBtn.classList.add('active');
          showStatus('Позиция: Центр');
        } else if (SC.state.videoOverlayPosition === 'center') {
          SC.state.videoOverlayPosition = 'top';
          posBtn.title = 'Позиционирование субтитров на видео: Вверху';
          posBtn.classList.add('active');
          showStatus('Позиция: Верх');
        } else {
          SC.state.videoOverlayPosition = 'bottom';
          posBtn.title = 'Позиционирование субтитров на видео: Внизу';
          posBtn.classList.remove('active');
          showStatus('Позиция: Низ');
        }
        SC.state.customOverlayPos = null;
        if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      });
    }

    function showStatus(text) {
      const statusEl = shadow.getElementById('sc-status');
      if (statusEl) {
        statusEl.textContent = text;
        setTimeout(() => {
          if (statusEl.textContent === text) {
            statusEl.textContent = 'Мультисубтитры';
          }
        }, 2000);
      }
    }

    // Clear history
    clearBtn.addEventListener('click', () => {
      SC.clearAllSubtitles();
    });

    // Copy all
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
  };

  // Draggable logic for widget window header
  SC.setupDraggable = function(element, handle) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      element.style.bottom = 'auto';
      element.style.right = 'auto';
      element.style.left = `${initialLeft}px`;
      element.style.top = `${initialTop}px`;

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        newLeft = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, newTop));

        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
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
