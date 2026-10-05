/**
 * Video Subtitles Capturer - Style Panel Module (ai_instrs/_.md:11-20, 38-42)
 * Manages the embedded accordion panels for global styles and individual language styles.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Embedded Accordion Panel for individual language subtitle styles (ai_instrs/_.md:38-42)
  SC.openLangStyleModal = function(item) {
    if (!SC.shadowRoot) return;
    const panel = SC.shadowRoot.getElementById('sc-styles-panel');
    if (!panel) return;

    // Toggle: if already open for this item, close it
    if (!panel.classList.contains('sc-hidden') && panel.dataset.activeItem === item.id) {
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
      return;
    }

    panel.classList.remove('sc-hidden');
    panel.dataset.activeItem = item.id;

    if (!item.style) {
      item.style = {
        preset: 'inherit',
        fontFamily: 'inherit',
        fontWeight: 'inherit',
        fontStyle: 'inherit',
        fontSizePercent: 'inherit',
        bgEnabled: 'inherit',
        bgColor: 'inherit',
        textColor: 'inherit'
      };
    }
    const st = item.style;
    const gStyles = SC.state.globalStyles || {};
    const gFont = gStyles.font || {};

    panel.innerHTML = `
      <div class="sc-embedded-style-card">
        <div class="sc-embedded-style-header">
          <span class="sc-embedded-style-title">⚙ Стили строки: ${SC.escapeHtml(item.label || item.lang || 'Язык')}</span>
          <button type="button" class="sc-btn-icon" id="sc-style-embed-close" title="Закрыть">✕</button>
        </div>
        <div class="sc-embedded-style-grid">
          <div class="sc-style-field">
            <label class="sc-style-label">Общий стиль:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-preset">
              <option value="inherit" ${st.preset === 'inherit' ? 'selected' : ''}>Inherit (из общих)</option>
              <option value="base" ${st.preset === 'base' ? 'selected' : ''}>Base</option>
              <option value="netflix" ${st.preset === 'netflix' ? 'selected' : ''}>Netflix (контур)</option>
              <option value="youtube" ${st.preset === 'youtube' ? 'selected' : ''}>YouTube (плашка)</option>
              <option value="custom" ${st.preset === 'custom' ? 'selected' : ''}>Свой</option>
            </select>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Шрифт:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-font-family">
              <option value="inherit" ${st.fontFamily === 'inherit' ? 'selected' : ''}>Inherit (из общих)</option>
              <option value="Arial, Helvetica, sans-serif" ${st.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
              <option value="'Roboto', 'Segoe UI', sans-serif" ${st.fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto / Segoe UI</option>
              <option value="'Netflix Sans', Helvetica, Arial, sans-serif" ${st.fontFamily.includes('Netflix') ? 'selected' : ''}>Netflix Sans</option>
              <option value="'YouTube Noto', Roboto, Arial, sans-serif" ${st.fontFamily.includes('YouTube') ? 'selected' : ''}>YouTube Noto</option>
              <option value="'Roboto Mono', monospace" ${st.fontFamily.includes('monospace') ? 'selected' : ''}>Моноширинный</option>
              <option value="Georgia, serif" ${st.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
              <option value="'Impact', 'Arial Black', sans-serif" ${st.fontFamily.includes('Impact') ? 'selected' : ''}>Impact</option>
            </select>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Жирность:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-font-weight">
              <option value="inherit" ${st.fontWeight === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="normal" ${st.fontWeight === 'normal' || st.fontWeight === '400' ? 'selected' : ''}>Normal (400)</option>
              <option value="500" ${st.fontWeight === '500' ? 'selected' : ''}>500</option>
              <option value="600" ${st.fontWeight === '600' ? 'selected' : ''}>600</option>
              <option value="bold" ${st.fontWeight === 'bold' || st.fontWeight === '700' ? 'selected' : ''}>Bold (700)</option>
            </select>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Курсив:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-italic-mode">
              <option value="inherit" ${st.fontStyle === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="normal" ${st.fontStyle === 'normal' ? 'selected' : ''}>Прямой</option>
              <option value="italic" ${st.fontStyle === 'italic' ? 'selected' : ''}>Курсив</option>
            </select>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Размер:</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-style-size-slider" min="60" max="200" step="5" value="${st.fontSizePercent === 'inherit' ? (gFont.fontSizePercent || 100) : st.fontSizePercent}">
              <span class="sc-style-val" id="sc-style-size-val">${st.fontSizePercent === 'inherit' ? 'Inherit' : `${st.fontSizePercent}%`}</span>
              <button type="button" class="sc-style-btn-reset" id="sc-style-size-inherit-btn" style="padding: 0 4px; font-size: 9px;">Inh</button>
            </div>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Цвет текста:</label>
            <div class="sc-style-color-row">
              <input type="color" class="sc-style-color-input" id="sc-style-text-color" value="${st.textColor === 'inherit' ? (gFont.textColor || '#ffffff') : (st.textColor || '#ffffff')}">
              <button type="button" class="sc-style-btn-reset" id="sc-style-color-inherit-btn" style="padding: 0 4px; font-size: 9px;">Inh</button>
            </div>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Фон строки:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-bg-mode">
              <option value="inherit" ${st.bgEnabled === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="off" ${st.bgEnabled === false ? 'selected' : ''}>Выкл</option>
              <option value="on" ${st.bgEnabled === true ? 'selected' : ''}>Вкл</option>
            </select>
            <input type="color" class="sc-style-color-input" id="sc-style-bg-color" value="${st.bgColor && st.bgColor !== 'inherit' ? st.bgColor.slice(0, 7) : '#000000'}" ${st.bgEnabled === true ? '' : 'disabled'}>
          </div>
        </div>
        <div class="sc-embedded-style-footer">
          <button type="button" class="sc-style-btn-reset" id="sc-style-reset">Сбросить в Inherit</button>
          <button type="button" class="sc-style-btn-apply" id="sc-style-apply">Закрыть</button>
        </div>
      </div>
    `;

    const presetSel = panel.querySelector('#sc-style-preset');
    const fontSel = panel.querySelector('#sc-style-font-family');
    const weightSel = panel.querySelector('#sc-style-font-weight');
    const italicSel = panel.querySelector('#sc-style-italic-mode');
    const sizeSlider = panel.querySelector('#sc-style-size-slider');
    const sizeVal = panel.querySelector('#sc-style-size-val');
    const sizeInheritBtn = panel.querySelector('#sc-style-size-inherit-btn');
    const textColorInput = panel.querySelector('#sc-style-text-color');
    const colorInheritBtn = panel.querySelector('#sc-style-color-inherit-btn');
    const bgModeSel = panel.querySelector('#sc-style-bg-mode');
    const bgColorInput = panel.querySelector('#sc-style-bg-color');

    const triggerStyleUpdate = () => {
      SC.renderAllLines();
      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
    };

    presetSel.addEventListener('change', () => {
      st.preset = presetSel.value;
      if (st.preset === 'base' || st.preset === 'netflix' || st.preset === 'youtube') {
        if (st.preset === 'netflix') {
          st.fontFamily = "'Netflix Sans', Helvetica, Arial, sans-serif";
          st.fontWeight = 'bold';
        } else if (st.preset === 'youtube') {
          st.fontFamily = "'YouTube Noto', Roboto, Arial, sans-serif";
          st.bgEnabled = true;
          st.bgColor = 'rgba(8, 8, 8, 0.75)';
        }
        fontSel.value = st.fontFamily;
        weightSel.value = st.fontWeight;
      }
      triggerStyleUpdate();
    });

    fontSel.addEventListener('change', () => {
      st.fontFamily = fontSel.value;
      triggerStyleUpdate();
    });

    weightSel.addEventListener('change', () => {
      st.fontWeight = weightSel.value;
      triggerStyleUpdate();
    });

    italicSel.addEventListener('change', () => {
      st.fontStyle = italicSel.value;
      triggerStyleUpdate();
    });

    sizeSlider.addEventListener('input', () => {
      st.fontSizePercent = parseInt(sizeSlider.value, 10) || 100;
      sizeVal.textContent = `${st.fontSizePercent}%`;
      triggerStyleUpdate();
    });

    sizeInheritBtn.addEventListener('click', () => {
      st.fontSizePercent = 'inherit';
      sizeVal.textContent = 'Inherit';
      sizeSlider.value = gFont.fontSizePercent || 100;
      triggerStyleUpdate();
    });

    textColorInput.addEventListener('input', () => {
      st.textColor = textColorInput.value;
      triggerStyleUpdate();
    });

    colorInheritBtn.addEventListener('click', () => {
      st.textColor = 'inherit';
      textColorInput.value = gFont.textColor || '#ffffff';
      triggerStyleUpdate();
    });

    bgModeSel.addEventListener('change', () => {
      if (bgModeSel.value === 'inherit') {
        st.bgEnabled = 'inherit';
        bgColorInput.disabled = true;
      } else if (bgModeSel.value === 'on') {
        st.bgEnabled = true;
        bgColorInput.disabled = false;
        st.bgColor = bgColorInput.value + 'cc';
      } else {
        st.bgEnabled = false;
        bgColorInput.disabled = true;
      }
      triggerStyleUpdate();
    });

    bgColorInput.addEventListener('input', () => {
      st.bgColor = bgColorInput.value + 'cc';
      triggerStyleUpdate();
    });

    panel.querySelector('#sc-style-reset').addEventListener('click', () => {
      item.style = {
        preset: 'inherit',
        fontFamily: 'inherit',
        fontWeight: 'inherit',
        fontStyle: 'inherit',
        fontSizePercent: 'inherit',
        bgEnabled: 'inherit',
        bgColor: 'inherit',
        textColor: 'inherit'
      };
      presetSel.value = 'inherit';
      fontSel.value = 'inherit';
      weightSel.value = 'inherit';
      italicSel.value = 'inherit';
      sizeSlider.value = gFont.fontSizePercent || 100;
      sizeVal.textContent = 'Inherit';
      bgModeSel.value = 'inherit';
      bgColorInput.disabled = true;
      triggerStyleUpdate();
    });

    const closePanel = () => {
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
    };

    panel.querySelector('#sc-style-embed-close').addEventListener('click', closePanel);
    panel.querySelector('#sc-style-apply').addEventListener('click', closePanel);
  };

  // Embedded Accordion Panel for global subtitle styles (ai_instrs/_.md:11-20)
  SC.openGlobalStylesModal = function() {
    if (!SC.shadowRoot) return;
    const panel = SC.shadowRoot.getElementById('sc-styles-panel');
    if (!panel) return;

    // Toggle: if already open for global styles, close it
    if (!panel.classList.contains('sc-hidden') && panel.dataset.activeItem === 'global') {
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
      return;
    }

    panel.classList.remove('sc-hidden');
    panel.dataset.activeItem = 'global';

    const gStyles = SC.state.globalStyles = SC.state.globalStyles || {};
    const subListBg = gStyles.subListBg = gStyles.subListBg || { enabled: true, color: 'rgba(12, 15, 20, 0.86)', border: '1px solid rgba(255, 255, 255, 0.2)', paddingY: 6, paddingX: 14, borderRadius: 8 };
    const selectorBg = gStyles.selectorBg = gStyles.selectorBg || { enabled: false, color: 'rgba(0, 0, 0, 0.75)', border: 'none', paddingY: 2, paddingX: 6, borderRadius: 4 };
    const gFont = gStyles.font = gStyles.font || { preset: 'base', fontFamily: 'inherit', fontWeight: 'normal', fontStyle: 'normal', fontSizePercent: 100, textColor: '#ffffff' };

    panel.innerHTML = `
      <div class="sc-embedded-style-card">
        <div class="sc-embedded-style-header">
          <span class="sc-embedded-style-title">🎨 Общие стили субтитров (для всего списка)</span>
          <button type="button" class="sc-btn-icon" id="sc-gstyle-embed-close" title="Закрыть">✕</button>
        </div>
        <div class="sc-embedded-style-grid">
          <!-- 1. Подложка суб-списка -->
          <div class="sc-style-group-title">1. Подложка суб-списка (всего контейнера):</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Фон контейнера:</label>
            <div class="sc-style-bg-row">
              <label class="sc-switch">
                <input type="checkbox" id="sc-gstyle-sublist-enabled" ${subListBg.enabled ? 'checked' : ''}>
                <span class="sc-switch-slider"></span>
              </label>
              <input type="color" class="sc-style-color-input" id="sc-gstyle-sublist-color" value="#0c0f14" ${subListBg.enabled ? '' : 'disabled'}>
            </div>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Контур (border):</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-sublist-border">
              <option value="1px solid rgba(255, 255, 255, 0.2)" ${subListBg.border.includes('255') ? 'selected' : ''}>Светлый</option>
              <option value="1px solid #1877f2" ${subListBg.border.includes('1877f2') ? 'selected' : ''}>Синий</option>
              <option value="none" ${subListBg.border === 'none' ? 'selected' : ''}>Без контура</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Отступ (padding):</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-sublist-pad" min="0" max="24" value="${subListBg.paddingY}">
              <span class="sc-style-val" id="sc-gstyle-sublist-pad-val">${subListBg.paddingY}px</span>
            </div>
          </div>

          <!-- 2. Подложка селекторов -->
          <div class="sc-style-group-title">2. Подложка селекторов (индивидуально для строк):</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Фон строк:</label>
            <div class="sc-style-bg-row">
              <label class="sc-switch">
                <input type="checkbox" id="sc-gstyle-sel-enabled" ${selectorBg.enabled ? 'checked' : ''}>
                <span class="sc-switch-slider"></span>
              </label>
              <input type="color" class="sc-style-color-input" id="sc-gstyle-sel-color" value="#000000" ${selectorBg.enabled ? '' : 'disabled'}>
            </div>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Контур строки:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-sel-border">
              <option value="none" ${selectorBg.border === 'none' ? 'selected' : ''}>Без контура</option>
              <option value="1px solid rgba(255, 255, 255, 0.2)" ${selectorBg.border.includes('255') ? 'selected' : ''}>Светлый</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Отступ (padding):</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-sel-pad" min="0" max="16" value="${selectorBg.paddingY ?? 2}">
              <span class="sc-style-val" id="sc-gstyle-sel-pad-val">${selectorBg.paddingY ?? 2}px</span>
            </div>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Gap между строками:</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-gap" min="0" max="20" value="${gStyles.lineGap ?? 3}">
              <span class="sc-style-val" id="sc-gstyle-gap-val">${gStyles.lineGap ?? 3}px</span>
            </div>
          </div>

          <!-- 3. Шрифт -->
          <div class="sc-style-group-title">3. Общий шрифт:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Готовый стиль:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-preset">
              <option value="base" ${gFont.preset === 'base' ? 'selected' : ''}>Base</option>
              <option value="netflix" ${gFont.preset === 'netflix' ? 'selected' : ''}>Netflix (контур)</option>
              <option value="youtube" ${gFont.preset === 'youtube' ? 'selected' : ''}>YouTube (плашка)</option>
              <option value="custom" ${gFont.preset === 'custom' ? 'selected' : ''}>Свой</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Шрифт:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-font">
              <option value="inherit" ${gFont.fontFamily === 'inherit' ? 'selected' : ''}>По умолчанию</option>
              <option value="Arial, Helvetica, sans-serif" ${gFont.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
              <option value="'Roboto', 'Segoe UI', sans-serif" ${gFont.fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto</option>
              <option value="'Netflix Sans', Helvetica, Arial, sans-serif" ${gFont.fontFamily.includes('Netflix') ? 'selected' : ''}>Netflix Sans</option>
              <option value="'YouTube Noto', Roboto, Arial, sans-serif" ${gFont.fontFamily.includes('YouTube') ? 'selected' : ''}>YouTube Noto</option>
              <option value="'Roboto Mono', monospace" ${gFont.fontFamily.includes('monospace') ? 'selected' : ''}>Моноширинный</option>
              <option value="Georgia, serif" ${gFont.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Жирность:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-weight">
              <option value="normal" ${gFont.fontWeight === 'normal' ? 'selected' : ''}>Normal (400)</option>
              <option value="500" ${gFont.fontWeight === '500' ? 'selected' : ''}>500</option>
              <option value="600" ${gFont.fontWeight === '600' ? 'selected' : ''}>600</option>
              <option value="bold" ${gFont.fontWeight === 'bold' ? 'selected' : ''}>Bold (700)</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Размер:</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-size" min="60" max="200" step="5" value="${gFont.fontSizePercent || 100}">
              <span class="sc-style-val" id="sc-gstyle-size-val">${gFont.fontSizePercent || 100}%</span>
            </div>
          </div>
        </div>
        <div class="sc-embedded-style-footer">
          <button type="button" class="sc-style-btn-reset" id="sc-gstyle-reset">Сбросить</button>
          <button type="button" class="sc-style-btn-apply" id="sc-gstyle-apply">Закрыть</button>
        </div>
      </div>
    `;

    const sublistCheck = panel.querySelector('#sc-gstyle-sublist-enabled');
    const sublistColor = panel.querySelector('#sc-gstyle-sublist-color');
    const sublistBorder = panel.querySelector('#sc-gstyle-sublist-border');
    const sublistPad = panel.querySelector('#sc-gstyle-sublist-pad');
    const sublistPadVal = panel.querySelector('#sc-gstyle-sublist-pad-val');

    const selCheck = panel.querySelector('#sc-gstyle-sel-enabled');
    const selColor = panel.querySelector('#sc-gstyle-sel-color');
    const selBorder = panel.querySelector('#sc-gstyle-sel-border');
    const selPad = panel.querySelector('#sc-gstyle-sel-pad');
    const selPadVal = panel.querySelector('#sc-gstyle-sel-pad-val');
    const gapRange = panel.querySelector('#sc-gstyle-gap');
    const gapVal = panel.querySelector('#sc-gstyle-gap-val');

    const presetSel = panel.querySelector('#sc-gstyle-preset');
    const fontSel = panel.querySelector('#sc-gstyle-font');
    const weightSel = panel.querySelector('#sc-gstyle-weight');
    const sizeRange = panel.querySelector('#sc-gstyle-size');
    const sizeVal = panel.querySelector('#sc-gstyle-size-val');

    const applyGlobalChanges = () => {
      subListBg.enabled = sublistCheck.checked;
      sublistColor.disabled = !subListBg.enabled;
      subListBg.color = sublistColor.value + 'db';
      subListBg.border = sublistBorder.value;
      subListBg.paddingY = parseInt(sublistPad.value, 10);
      subListBg.paddingX = Math.round(subListBg.paddingY * 2.3);
      sublistPadVal.textContent = `${subListBg.paddingY}px`;

      selectorBg.enabled = selCheck.checked;
      selColor.disabled = !selectorBg.enabled;
      selectorBg.color = selColor.value + 'cc';
      selectorBg.border = selBorder.value;
      selectorBg.paddingY = parseInt(selPad.value, 10);
      selectorBg.paddingX = Math.round(selectorBg.paddingY * 2.5);
      selPadVal.textContent = `${selectorBg.paddingY}px`;

      gStyles.lineGap = parseInt(gapRange.value, 10);
      gapVal.textContent = `${gStyles.lineGap}px`;

      gFont.preset = presetSel.value;
      gFont.fontFamily = fontSel.value;
      gFont.fontWeight = weightSel.value;
      gFont.fontSizePercent = parseInt(sizeRange.value, 10) || 100;
      sizeVal.textContent = `${gFont.fontSizePercent}%`;

      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      SC.renderAllLines();
    };

    sublistCheck.addEventListener('change', applyGlobalChanges);
    sublistColor.addEventListener('input', applyGlobalChanges);
    sublistBorder.addEventListener('change', applyGlobalChanges);
    sublistPad.addEventListener('input', applyGlobalChanges);

    selCheck.addEventListener('change', applyGlobalChanges);
    selColor.addEventListener('input', applyGlobalChanges);
    selBorder.addEventListener('change', applyGlobalChanges);
    selPad.addEventListener('input', applyGlobalChanges);
    gapRange.addEventListener('input', applyGlobalChanges);

    presetSel.addEventListener('change', () => {
      if (presetSel.value === 'netflix') {
        gFont.fontFamily = "'Netflix Sans', Helvetica, Arial, sans-serif";
        gFont.fontWeight = 'bold';
        subListBg.enabled = false;
        selectorBg.enabled = false;
      } else if (presetSel.value === 'youtube') {
        gFont.fontFamily = "'YouTube Noto', Roboto, Arial, sans-serif";
        gFont.fontWeight = '500';
        subListBg.enabled = false;
        selectorBg.enabled = true;
        selectorBg.color = 'rgba(8, 8, 8, 0.75)';
      } else if (presetSel.value === 'base') {
        gFont.fontFamily = 'inherit';
        gFont.fontWeight = 'normal';
        subListBg.enabled = true;
        selectorBg.enabled = false;
      }
      sublistCheck.checked = subListBg.enabled;
      selCheck.checked = selectorBg.enabled;
      fontSel.value = gFont.fontFamily;
      weightSel.value = gFont.fontWeight;
      applyGlobalChanges();
    });

    fontSel.addEventListener('change', applyGlobalChanges);
    weightSel.addEventListener('change', applyGlobalChanges);
    sizeRange.addEventListener('input', applyGlobalChanges);

    panel.querySelector('#sc-gstyle-reset').addEventListener('click', () => {
      SC.state.globalStyles = {
        subListBg: { enabled: true, color: 'rgba(12, 15, 20, 0.86)', border: '1px solid rgba(255, 255, 255, 0.2)', paddingY: 6, paddingX: 14, borderRadius: 8 },
        selectorBg: { enabled: false, color: 'rgba(0, 0, 0, 0.75)', border: 'none', paddingY: 2, paddingX: 6, borderRadius: 4 },
        lineGap: 3,
        font: { preset: 'base', fontFamily: 'inherit', fontWeight: 'normal', fontStyle: 'normal', fontSizePercent: 100, textColor: '#ffffff' }
      };
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      SC.renderAllLines();
    });

    const closePanel = () => {
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
    };

    panel.querySelector('#sc-gstyle-embed-close').addEventListener('click', closePanel);
    panel.querySelector('#sc-gstyle-apply').addEventListener('click', closePanel);
  };
})();
