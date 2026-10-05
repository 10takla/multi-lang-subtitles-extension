/**
 * Video Subtitles Capturer - Language Bar Module (ai_instrs/_.md:21-26, 38-42)
 * Manages the multi-language selector list, reordering (drag & drop and arrows),
 * subtitle track vs. translation mode selection, engine choice, buffer characters input,
 * and adding/removing language selectors.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Add a new language selector (ai_instrs/_.md)
  SC.addNewLanguageSelector = function() {
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
      bufferChars: SC.getDefaultBufferChars ? SC.getDefaultBufferChars('google') : 1000,
      bufferSec: 30,
      lang: nextLangCode,
      visible: true
    };
    SC.state.languages.push(newSelector);
    SC.renderLanguageList();
    if (SC.retranslateItem) SC.retranslateItem(newSelector);
    if (SC.prefetchUpcomingTranslations) {
      const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
      SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, newSelector.bufferChars);
    }
    if (SC.renderAllLines) SC.renderAllLines();
  };

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
          if (SC.renderAllLines) SC.renderAllLines();
        }
      });

      // Drag and order controls (ai_instrs/_.md:23-26)
      const orderControls = document.createElement('div');
      orderControls.className = 'sc-lang-order-wrap';

      // Element for grab and toggle drag
      const dragHandle = document.createElement('span');
      dragHandle.className = 'sc-lang-drag';
      dragHandle.title = 'Зажмите для перетаскивания (или клик для переключения режима перетаскивания)';
      dragHandle.textContent = '⠿';
      dragHandle.style.touchAction = 'none';

      let isPointerDragging = false;
      let toggleDragActive = false;

      dragHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDragActive = !toggleDragActive;
        dragHandle.classList.toggle('sc-drag-active', toggleDragActive);
        row.classList.toggle('sc-toggle-drag-selected', toggleDragActive);
      });

      dragHandle.addEventListener('pointerdown', (e) => {
        isPointerDragging = true;
        row.classList.add('sc-dragging');
        try { dragHandle.setPointerCapture(e.pointerId); } catch (_) {}
        e.stopPropagation();
      });
      dragHandle.addEventListener('pointermove', (e) => {
        if (!isPointerDragging) return;
        const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sc-lang-item');
        if (targetEl && targetEl !== row && targetEl.dataset.index !== undefined) {
          const fromIdx = index;
          const toIdx = parseInt(targetEl.dataset.index, 10);
          if (!isNaN(toIdx) && fromIdx !== toIdx) {
            const moved = SC.state.languages.splice(fromIdx, 1)[0];
            SC.state.languages.splice(toIdx, 0, moved);
            SC.renderLanguageList();
            if (SC.renderAllLines) SC.renderAllLines();
          }
        }
      });
      const endPointerDrag = (e) => {
        if (!isPointerDragging) return;
        isPointerDragging = false;
        row.classList.remove('sc-dragging');
        try { dragHandle.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      dragHandle.addEventListener('pointerup', endPointerDrag);
      dragHandle.addEventListener('pointercancel', endPointerDrag);
      orderControls.appendChild(dragHandle);

      // Single up/down/up-down arrow button for order change (ai_instrs/_.md:43)
      const btnOrder = document.createElement('button');
      btnOrder.type = 'button';
      btnOrder.className = 'sc-btn-mini sc-btn-order';
      const isFirst = index === 0;
      const isLast = index === SC.state.languages.length - 1;

      if (isFirst && !isLast) {
        btnOrder.textContent = '▼';
        btnOrder.title = 'Переместить вниз';
      } else if (isLast && !isFirst) {
        btnOrder.textContent = '▲';
        btnOrder.title = 'Переместить вверх';
      } else if (!isFirst && !isLast) {
        btnOrder.textContent = '⇅';
        btnOrder.title = 'Переместить (клик: вниз, Shift+клик: вверх)';
      } else {
        btnOrder.textContent = '⇅';
        btnOrder.disabled = true;
      }

      btnOrder.addEventListener('click', (e) => {
        e.stopPropagation();
        if (SC.state.languages.length <= 1) return;
        const moveUp = e.shiftKey ? true : (index === SC.state.languages.length - 1);
        if (moveUp && index > 0) {
          const moved = SC.state.languages.splice(index, 1)[0];
          SC.state.languages.splice(index - 1, 0, moved);
        } else if (!moveUp && index < SC.state.languages.length - 1) {
          const moved = SC.state.languages.splice(index, 1)[0];
          SC.state.languages.splice(index + 1, 0, moved);
        }
        SC.renderLanguageList();
        if (SC.renderAllLines) SC.renderAllLines();
      });
      orderControls.appendChild(btnOrder);

      row.appendChild(orderControls);

      // Visibility toggle button (ai_instrs/_.md)
      const visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = `sc-lang-vis ${item.visible ? '' : 'sc-hidden-vis'}`;
      visBtn.title = item.visible ? 'Скрыть этот язык' : 'Показать этот язык';
      visBtn.textContent = item.visible ? '👁' : '⊘';
      visBtn.addEventListener('click', () => {
        item.visible = !item.visible;
        SC.renderLanguageList();
        if (SC.renderAllLines) SC.renderAllLines();
      });
      row.appendChild(visBtn);

      // Styles button for current language selector (ai_instrs/_.md)
      const styleBtn = document.createElement('button');
      styleBtn.type = 'button';
      styleBtn.className = 'sc-lang-style-btn';
      styleBtn.title = 'Стили текста субтитра для этого языка';
      styleBtn.textContent = '🎨';
      styleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (SC.openLangStyleModal) SC.openLangStyleModal(item);
      });
      row.appendChild(styleBtn);

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
                const foundYt = SC.ytCaptionTracks && SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
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
            const foundYt = SC.ytCaptionTracks && SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
            if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.trackId);
          }
          if (SC.renderAllLines) SC.renderAllLines();
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
                const foundYt = SC.ytCaptionTracks && SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
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
            const foundYt = SC.ytCaptionTracks && SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
            if (foundYt && SC.loadYouTubeTimedText) SC.loadYouTubeTimedText(foundYt, item.sourceTrack);
          }
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
          }
          if (SC.renderAllLines) SC.renderAllLines();
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

        if (SC.AVAILABLE_LANGUAGES) {
          SC.AVAILABLE_LANGUAGES.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.name;
            if (item.targetLang === lang.code) opt.selected = true;
            targetSelect.appendChild(opt);
          });
        }

        targetSelect.addEventListener('change', (e) => {
          item.targetLang = e.target.value;
          item.lang = item.targetLang;
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, item.bufferChars);
          }
          if (SC.renderAllLines) SC.renderAllLines();
        });
        controls.appendChild(targetSelect);

        // Translation engine select (ai_instrs/_.md:21-25)
        const engines = (SC.getAvailableEngines ? SC.getAvailableEngines() : SC.TRANSLATION_ENGINES) || [
          { id: 'google', name: 'Google', maxChars: 1800 },
          { id: 'yandex', name: 'Yandex', maxChars: 10000 },
          { id: 'chrome', name: 'Chrome AI', maxChars: 4000 }
        ];
        if (!engines.some(e => e.id === item.engine)) {
          item.engine = engines[0]?.id || 'google';
        }
        item.engine = item.engine || 'google';
        const engineSelect = document.createElement('select');
        engineSelect.className = 'sc-lang-select sc-engine-select';
        engineSelect.title = 'Выбор движка перевода (по умолчанию: Google Translate)';
        engines.forEach(eng => {
          const opt = document.createElement('option');
          opt.value = eng.id;
          opt.textContent = eng.name;
          if (item.engine === eng.id) opt.selected = true;
          engineSelect.appendChild(opt);
        });

        // Buffer input in characters (ai_instrs/_.md:25)
        const getEngineMax = (eng) => (SC.getEngineMaxChars ? SC.getEngineMaxChars(eng) : (eng === 'yandex' ? 10000 : (eng === 'chrome' ? 4000 : 1800)));
        const engineMax = getEngineMax(item.engine);
        const defaultChars = SC.getDefaultBufferChars ? SC.getDefaultBufferChars(item.engine) : Math.min(1000, engineMax);
        if (item.bufferChars === undefined || item.bufferChars === null) {
          item.bufferChars = defaultChars;
        } else {
          item.bufferChars = Math.max(1, Math.min(Number(item.bufferChars), engineMax));
        }

        const bufferWrap = document.createElement('div');
        bufferWrap.className = 'sc-buffer-wrap';
        bufferWrap.title = `Буфер упреждения перевода (в символах, макс. ${engineMax})`;
        bufferWrap.innerHTML = `
          <span class="sc-buffer-label">Буфер:</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="sc-buffer-input" value="${item.bufferChars}" title="Буфер упреждения перевода в символах (макс. ${engineMax})">
        `;
        const bufferInput = bufferWrap.querySelector('.sc-buffer-input');

        engineSelect.addEventListener('change', (e) => {
          item.engine = e.target.value;
          const currentMax = getEngineMax(item.engine);
          if (item.bufferChars > currentMax) {
            item.bufferChars = currentMax;
          }
          if (bufferInput) {
            bufferInput.value = item.bufferChars;
            bufferInput.title = `Буфер упреждения перевода в символах (макс. ${currentMax})`;
          }
          if (SC.retranslateItem) SC.retranslateItem(item);
          if (SC.prefetchUpcomingTranslations) {
            const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, item.bufferChars);
          }
          if (SC.renderAllLines) SC.renderAllLines();
        });
        controls.appendChild(engineSelect);

        const onBufferChange = (e) => {
          if (e.type === 'input') {
            bufferInput.value = bufferInput.value.replace(/\D/g, '');
          }
          if (e.type === 'change' || e.type === 'blur') {
            const val = parseInt(bufferInput.value, 10);
            const currentMax = getEngineMax(item.engine);
            item.bufferChars = isNaN(val) ? Math.min(1000, currentMax) : Math.max(1, Math.min(currentMax, val));
            bufferInput.value = item.bufferChars;
            if (SC.prefetchUpcomingTranslations) {
              const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
              SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, item.bufferChars);
            }
          }
        };
        bufferInput.addEventListener('input', onBufferChange);
        bufferInput.addEventListener('change', onBufferChange);
        bufferInput.addEventListener('blur', onBufferChange);
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
            const foundYt = SC.ytCaptionTracks && SC.ytCaptionTracks.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
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
            const v = SC.getActiveVideo ? SC.getActiveVideo() : null;
            SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
          }
        }
        SC.renderLanguageList();
        if (SC.renderAllLines) SC.renderAllLines();
      });

      row.appendChild(controls);

      // Actions: delete selector
      const actions = document.createElement('div');
      actions.className = 'sc-lang-actions';

      if (SC.state.languages.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'sc-btn-mini';
        delBtn.style.color = '#ef4444';
        delBtn.title = 'Удалить этот селектор';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
          SC.state.languages.splice(index, 1);
          SC.renderLanguageList();
          if (SC.renderAllLines) SC.renderAllLines();
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(actions);
      container.appendChild(row);
    });
  };
})();
