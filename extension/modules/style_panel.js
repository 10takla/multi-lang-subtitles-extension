/**
 * Video Subtitles Capturer - Style Panel Module (ai_instrs/_.md:11-26, 44-46)
 * Manages the embedded accordion panels for global styles and individual language styles.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Embedded Accordion Panel for individual language subtitle styles (ai_instrs/_.md:44-46)
  // Only two settings: 'выбор шрифта' and 'подложка текста селекторов' with Inherit or custom value
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
        textColor: 'inherit',
        bgEnabled: 'inherit',
        bgColor: 'inherit',
        border: 'inherit',
        padding: 'inherit',
        paddingY: 'inherit',
        paddingX: 'inherit'
      };
    }
    const st = item.style;
    const gStyles = SC.state.globalStyles || {};
    const gFont = gStyles.font || {};
    const gSelBg = gStyles.selectorBg || {};

    const isBgActive = st.bgEnabled === true || st.bgEnabled === 'on';

    panel.innerHTML = `
      <div class="sc-embedded-style-card">
        <div class="sc-embedded-style-header">
          <span class="sc-embedded-style-title">⚙ Стили строки: ${SC.escapeHtml(item.label || item.lang || 'Селектор')}</span>
          <div class="sc-embedded-style-actions">
            <button type="button" class="sc-btn-icon" id="sc-style-reset" title="Сбросить в Inherit">↺</button>
            <button type="button" class="sc-btn-icon" id="sc-style-embed-close" title="Закрыть">✕</button>
          </div>
        </div>
        <div class="sc-embedded-style-grid">
          <!-- 1. Выбор шрифта (ai_instrs/_.md:45) -->
          <div class="sc-style-group-title">Выбор шрифта:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Готовый стиль:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-preset">
              <option value="inherit" ${st.preset === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="base" ${st.preset === 'base' ? 'selected' : ''}>Base</option>
              <option value="netflix" ${st.preset === 'netflix' ? 'selected' : ''}>Netflix</option>
              <option value="youtube" ${st.preset === 'youtube' ? 'selected' : ''}>YouTube</option>
              <option value="custom" ${st.preset === 'custom' ? 'selected' : ''}>Свой</option>
            </select>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Шрифт:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-font-family">
              <option value="inherit" ${st.fontFamily === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="inherit_default" ${st.fontFamily === 'inherit_default' ? 'selected' : ''}>По умолчанию</option>
              <option value="Arial, Helvetica, sans-serif" ${st.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
              <option value="'Roboto', 'Segoe UI', sans-serif" ${st.fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto</option>
              <option value="'Netflix Sans', Helvetica, Arial, sans-serif" ${st.fontFamily.includes('Netflix') ? 'selected' : ''}>Netflix Sans</option>
              <option value="'YouTube Noto', Roboto, Arial, sans-serif" ${st.fontFamily.includes('YouTube') ? 'selected' : ''}>YouTube Noto</option>
              <option value="'Roboto Mono', monospace" ${st.fontFamily.includes('monospace') ? 'selected' : ''}>Моноширинный</option>
              <option value="Georgia, serif" ${st.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
            </select>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Жирность:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-font-weight">
              <option value="inherit" ${st.fontWeight === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="normal" ${st.fontWeight === 'normal' || st.fontWeight === '400' ? 'selected' : ''}>Normal</option>
              <option value="500" ${st.fontWeight === '500' ? 'selected' : ''}>500</option>
              <option value="600" ${st.fontWeight === '600' ? 'selected' : ''}>600</option>
              <option value="bold" ${st.fontWeight === 'bold' || st.fontWeight === '700' ? 'selected' : ''}>Bold</option>
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
              <input type="color" class="sc-style-color-input" id="sc-style-text-color" value="${st.textColor && st.textColor !== 'inherit' ? st.textColor : (gFont.textColor || '#ffffff')}">
              <button type="button" class="sc-style-btn-reset" id="sc-style-color-inherit-btn" style="padding: 0 4px; font-size: 9px;">Inh</button>
            </div>
          </div>

          <!-- 2. Подложка текста селекторов (ai_instrs/_.md:46, 12-13) -->
          <div class="sc-style-group-title">Подложка текста селектора:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Подложка:</label>
            <select class="sc-lang-select sc-style-select" id="sc-style-bg-mode">
              <option value="inherit" ${st.bgEnabled === 'inherit' ? 'selected' : ''}>Inherit</option>
              <option value="off" ${st.bgEnabled === false || st.bgEnabled === 'off' ? 'selected' : ''}>Выкл</option>
              <option value="on" ${isBgActive ? 'selected' : ''}>Вкл</option>
            </select>
          </div>

          <!-- Появляются только если включен (ai_instrs/_.md:12-13) -->
          <div class="sc-style-subgroup ${isBgActive ? '' : 'sc-hidden'}" id="sc-style-subgroup-fields">
            <div class="sc-style-field">
              <label class="sc-style-label">Цвет:</label>
              <div class="sc-style-color-row">
                <input type="color" class="sc-style-color-input" id="sc-style-bg-color" value="${st.bgColor && st.bgColor !== 'inherit' ? st.bgColor.slice(0, 7) : (gSelBg.color?.slice(0, 7) || '#000000')}">
                <button type="button" class="sc-style-btn-reset" id="sc-style-bg-inherit-btn" style="padding: 0 4px; font-size: 9px;">Inh</button>
              </div>
            </div>

            <div class="sc-style-field">
              <label class="sc-style-label">Контур:</label>
              <select class="sc-lang-select sc-style-select" id="sc-style-bg-border">
                <option value="inherit" ${st.border === 'inherit' ? 'selected' : ''}>Inherit</option>
                <option value="none" ${st.border === 'none' ? 'selected' : ''}>Без контура</option>
                <option value="1px solid rgba(255, 255, 255, 0.2)" ${st.border?.includes('255') ? 'selected' : ''}>Светлый</option>
              </select>
            </div>

            <div class="sc-style-field">
              <label class="sc-style-label">Отступ:</label>
              <div class="sc-style-size-row">
                <input type="range" class="sc-style-range" id="sc-style-bg-pad" min="0" max="16" value="${(st.padding !== undefined && st.padding !== 'inherit') ? st.padding : (st.paddingY !== undefined && st.paddingY !== 'inherit') ? st.paddingY : (gSelBg.padding ?? gSelBg.paddingY ?? 4)}">
                <span class="sc-style-val" id="sc-style-bg-pad-val">${(st.padding === 'inherit' || (st.padding === undefined && st.paddingY === 'inherit')) ? 'Inherit' : `${st.padding ?? st.paddingY ?? 4}px`}</span>
                <button type="button" class="sc-style-btn-reset" id="sc-style-pad-inherit-btn" style="padding: 0 4px; font-size: 9px;">Inh</button>
              </div>
            </div>
          </div>
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
    const bgSubgroup = panel.querySelector('#sc-style-subgroup-fields');
    const bgColorInput = panel.querySelector('#sc-style-bg-color');
    const bgInheritBtn = panel.querySelector('#sc-style-bg-inherit-btn');
    const bgBorderSel = panel.querySelector('#sc-style-bg-border');
    const bgPadSlider = panel.querySelector('#sc-style-bg-pad');
    const bgPadVal = panel.querySelector('#sc-style-bg-pad-val');
    const padInheritBtn = panel.querySelector('#sc-style-pad-inherit-btn');

    const triggerStyleUpdate = () => {
      if (SC.renderAllLines) SC.renderAllLines();
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

    // Subgroup visibility when switch is toggled (ai_instrs/_.md:12-13)
    bgModeSel.addEventListener('change', () => {
      if (bgModeSel.value === 'on') {
        st.bgEnabled = true;
        bgSubgroup.classList.remove('sc-hidden');
        st.bgColor = bgColorInput.value + 'cc';
        st.border = bgBorderSel.value;
        st.padding = parseInt(bgPadSlider.value, 10) || 4;
        st.paddingY = st.padding;
        st.paddingX = st.padding;
      } else if (bgModeSel.value === 'off') {
        st.bgEnabled = false;
        bgSubgroup.classList.add('sc-hidden');
      } else {
        st.bgEnabled = 'inherit';
        bgSubgroup.classList.add('sc-hidden');
      }
      triggerStyleUpdate();
    });

    bgColorInput.addEventListener('input', () => {
      st.bgColor = bgColorInput.value + 'cc';
      triggerStyleUpdate();
    });

    bgInheritBtn.addEventListener('click', () => {
      st.bgColor = 'inherit';
      bgColorInput.value = gSelBg.color?.slice(0, 7) || '#000000';
      triggerStyleUpdate();
    });

    bgBorderSel.addEventListener('change', () => {
      st.border = bgBorderSel.value;
      triggerStyleUpdate();
    });

    bgPadSlider.addEventListener('input', () => {
      st.padding = parseInt(bgPadSlider.value, 10) || 0;
      st.paddingY = st.padding;
      st.paddingX = st.padding;
      bgPadVal.textContent = `${st.padding}px`;
      triggerStyleUpdate();
    });

    padInheritBtn.addEventListener('click', () => {
      st.padding = 'inherit';
      st.paddingY = 'inherit';
      st.paddingX = 'inherit';
      bgPadVal.textContent = 'Inherit';
      bgPadSlider.value = gSelBg.padding ?? gSelBg.paddingY ?? 4;
      triggerStyleUpdate();
    });

    panel.querySelector('#sc-style-reset').addEventListener('click', () => {
      item.style = {
        preset: 'inherit',
        fontFamily: 'inherit',
        fontWeight: 'inherit',
        fontStyle: 'inherit',
        fontSizePercent: 'inherit',
        textColor: 'inherit',
        bgEnabled: 'inherit',
        bgColor: 'inherit',
        border: 'inherit',
        padding: 'inherit',
        paddingY: 'inherit',
        paddingX: 'inherit'
      };
      presetSel.value = 'inherit';
      fontSel.value = 'inherit';
      weightSel.value = 'inherit';
      italicSel.value = 'inherit';
      sizeSlider.value = gFont.fontSizePercent || 100;
      sizeVal.textContent = 'Inherit';
      textColorInput.value = gFont.textColor || '#ffffff';
      bgModeSel.value = 'inherit';
      bgSubgroup.classList.add('sc-hidden');
      triggerStyleUpdate();
    });

    const closePanel = () => {
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
    };

    panel.querySelector('#sc-style-embed-close').addEventListener('click', closePanel);
  };

  // Embedded Accordion Panel for global subtitle styles (ai_instrs/_.md:11-26)
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
    const subListBg = gStyles.subListBg = gStyles.subListBg || { enabled: true, color: 'rgba(12, 15, 20, 0.86)', border: '1px solid rgba(255, 255, 255, 0.2)', padding: 6, paddingY: 6, paddingX: 6, borderRadius: 8 };
    const selectorBg = gStyles.selectorBg = gStyles.selectorBg || { enabled: false, color: 'rgba(0, 0, 0, 0.75)', border: 'none', padding: 4, paddingY: 4, paddingX: 4, borderRadius: 4 };
    const gFont = gStyles.font = gStyles.font || { preset: 'base', fontFamily: 'inherit', fontWeight: 'normal', fontStyle: 'normal', fontSizePercent: 100, textColor: '#ffffff' };
    const maxWidthPct = typeof gStyles.maxWidthPercent === 'number' ? gStyles.maxWidthPercent : 100;
    const textAlignVal = gStyles.textAlign || 'left';

    panel.innerHTML = `
      <div class="sc-embedded-style-card">
        <div class="sc-embedded-style-header">
          <span class="sc-embedded-style-title">🎨 Общие стили субтитров</span>
          <div class="sc-embedded-style-actions">
            <button type="button" class="sc-btn-icon" id="sc-gstyle-reset" title="Сбросить">↺</button>
            <button type="button" class="sc-btn-icon" id="sc-gstyle-embed-close" title="Закрыть">✕</button>
          </div>
        </div>
        <div class="sc-embedded-style-grid">
          <!-- 1. Подложка текста суб-списка (ai_instrs/_.md:12) -->
          <div class="sc-style-group-title">Подложка текста суб-списка:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Подложка:</label>
            <div class="sc-style-bg-row">
              <label class="sc-switch">
                <input type="checkbox" id="sc-gstyle-sublist-enabled" ${subListBg.enabled ? 'checked' : ''}>
                <span class="sc-switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- Если включен, появляются выбор: цвет, контур, padding (ai_instrs/_.md:12) -->
          <div class="sc-style-subgroup ${subListBg.enabled ? '' : 'sc-hidden'}" id="sc-gstyle-sublist-fields">
            <div class="sc-style-field">
              <label class="sc-style-label">Цвет:</label>
              <input type="color" class="sc-style-color-input" id="sc-gstyle-sublist-color" value="#0c0f14">
            </div>
            <div class="sc-style-field">
              <label class="sc-style-label">Контур:</label>
              <select class="sc-lang-select sc-style-select" id="sc-gstyle-sublist-border">
                <option value="1px solid rgba(255, 255, 255, 0.2)" ${subListBg.border.includes('255') ? 'selected' : ''}>Светлый</option>
                <option value="1px solid #1877f2" ${subListBg.border.includes('1877f2') ? 'selected' : ''}>Синий</option>
                <option value="none" ${subListBg.border === 'none' ? 'selected' : ''}>Без контура</option>
              </select>
            </div>
            <div class="sc-style-field">
              <label class="sc-style-label">Отступ:</label>
              <div class="sc-style-size-row">
                <input type="range" class="sc-style-range" id="sc-gstyle-sublist-pad" min="0" max="24" value="${subListBg.padding ?? subListBg.paddingY ?? 6}">
                <span class="sc-style-val" id="sc-gstyle-sublist-pad-val">${subListBg.padding ?? subListBg.paddingY ?? 6}px</span>
              </div>
            </div>
          </div>

          <!-- 2. Подложка текста селекторов (ai_instrs/_.md:13) -->
          <div class="sc-style-group-title">Подложка текста селекторов:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Подложка:</label>
            <div class="sc-style-bg-row">
              <label class="sc-switch">
                <input type="checkbox" id="sc-gstyle-sel-enabled" ${selectorBg.enabled ? 'checked' : ''}>
                <span class="sc-switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- Если включен, появляются выбор: цвет, контур, padding (ai_instrs/_.md:13) -->
          <div class="sc-style-subgroup ${selectorBg.enabled ? '' : 'sc-hidden'}" id="sc-gstyle-sel-fields">
            <div class="sc-style-field">
              <label class="sc-style-label">Цвет:</label>
              <input type="color" class="sc-style-color-input" id="sc-gstyle-sel-color" value="#000000">
            </div>
            <div class="sc-style-field">
              <label class="sc-style-label">Контур:</label>
              <select class="sc-lang-select sc-style-select" id="sc-gstyle-sel-border">
                <option value="none" ${selectorBg.border === 'none' ? 'selected' : ''}>Без контура</option>
                <option value="1px solid rgba(255, 255, 255, 0.2)" ${selectorBg.border.includes('255') ? 'selected' : ''}>Светлый</option>
              </select>
            </div>
            <div class="sc-style-field">
              <label class="sc-style-label">Отступ:</label>
              <div class="sc-style-size-row">
                <input type="range" class="sc-style-range" id="sc-gstyle-sel-pad" min="0" max="16" value="${selectorBg.padding ?? selectorBg.paddingY ?? 4}">
                <span class="sc-style-val" id="sc-gstyle-sel-pad-val">${selectorBg.padding ?? selectorBg.paddingY ?? 4}px</span>
              </div>
            </div>
          </div>

          <!-- 3. Геометрия списка: Gap, Макс. ширина, Выравнивание (ai_instrs/_.md:14-16) -->
          <div class="sc-style-group-title">Геометрия списка:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Gap между текстами:</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-gap" min="0" max="20" value="${gStyles.lineGap ?? 3}">
              <span class="sc-style-val" id="sc-gstyle-gap-val">${gStyles.lineGap ?? 3}px</span>
            </div>
          </div>

          <div class="sc-style-field" id="sc-gstyle-maxwidth-wrap">
            <label class="sc-style-label">Максимальная ширина:</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-maxwidth" min="10" max="100" step="5" value="${maxWidthPct}">
              <span class="sc-style-val" id="sc-gstyle-maxwidth-val">${maxWidthPct}%</span>
            </div>
          </div>

          <div class="sc-style-field">
            <label class="sc-style-label">Выравнивание:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-align">
              <option value="left" ${textAlignVal === 'left' ? 'selected' : ''}>По левому краю</option>
              <option value="center" ${textAlignVal === 'center' ? 'selected' : ''}>По центру</option>
              <option value="right" ${textAlignVal === 'right' ? 'selected' : ''}>По правому краю</option>
            </select>
          </div>

          <!-- 4. Выбор шрифта (ai_instrs/_.md:17-21) -->
          <div class="sc-style-group-title">Выбор шрифта:</div>
          <div class="sc-style-field">
            <label class="sc-style-label">Готовый стиль:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-preset">
              <option value="base" ${gFont.preset === 'base' ? 'selected' : ''}>Base</option>
              <option value="netflix" ${gFont.preset === 'netflix' ? 'selected' : ''}>Netflix</option>
              <option value="youtube" ${gFont.preset === 'youtube' ? 'selected' : ''}>YouTube</option>
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
              <option value="normal" ${gFont.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="500" ${gFont.fontWeight === '500' ? 'selected' : ''}>500</option>
              <option value="600" ${gFont.fontWeight === '600' ? 'selected' : ''}>600</option>
              <option value="bold" ${gFont.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Курсив:</label>
            <select class="sc-lang-select sc-style-select" id="sc-gstyle-style">
              <option value="normal" ${gFont.fontStyle === 'normal' ? 'selected' : ''}>Прямой</option>
              <option value="italic" ${gFont.fontStyle === 'italic' ? 'selected' : ''}>Курсив</option>
            </select>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Размер:</label>
            <div class="sc-style-size-row">
              <input type="range" class="sc-style-range" id="sc-gstyle-size" min="60" max="200" step="5" value="${gFont.fontSizePercent || 100}">
              <span class="sc-style-val" id="sc-gstyle-size-val">${gFont.fontSizePercent || 100}%</span>
            </div>
          </div>
          <div class="sc-style-field">
            <label class="sc-style-label">Цвет текста:</label>
            <input type="color" class="sc-style-color-input" id="sc-gstyle-color" value="${gFont.textColor || '#ffffff'}">
          </div>
        </div>
      </div>
    `;

    const sublistCheck = panel.querySelector('#sc-gstyle-sublist-enabled');
    const sublistFields = panel.querySelector('#sc-gstyle-sublist-fields');
    const sublistColor = panel.querySelector('#sc-gstyle-sublist-color');
    const sublistBorder = panel.querySelector('#sc-gstyle-sublist-border');
    const sublistPad = panel.querySelector('#sc-gstyle-sublist-pad');
    const sublistPadVal = panel.querySelector('#sc-gstyle-sublist-pad-val');

    const selCheck = panel.querySelector('#sc-gstyle-sel-enabled');
    const selFields = panel.querySelector('#sc-gstyle-sel-fields');
    const selColor = panel.querySelector('#sc-gstyle-sel-color');
    const selBorder = panel.querySelector('#sc-gstyle-sel-border');
    const selPad = panel.querySelector('#sc-gstyle-sel-pad');
    const selPadVal = panel.querySelector('#sc-gstyle-sel-pad-val');

    const gapRange = panel.querySelector('#sc-gstyle-gap');
    const gapVal = panel.querySelector('#sc-gstyle-gap-val');
    const maxwidthWrap = panel.querySelector('#sc-gstyle-maxwidth-wrap');
    const maxwidthRange = panel.querySelector('#sc-gstyle-maxwidth');
    const maxwidthVal = panel.querySelector('#sc-gstyle-maxwidth-val');
    const alignSel = panel.querySelector('#sc-gstyle-align');

    const presetSel = panel.querySelector('#sc-gstyle-preset');
    const fontSel = panel.querySelector('#sc-gstyle-font');
    const weightSel = panel.querySelector('#sc-gstyle-weight');
    const styleSel = panel.querySelector('#sc-gstyle-style');
    const sizeRange = panel.querySelector('#sc-gstyle-size');
    const sizeVal = panel.querySelector('#sc-gstyle-size-val');
    const colorInput = panel.querySelector('#sc-gstyle-color');

    const applyGlobalChanges = () => {
      subListBg.enabled = sublistCheck.checked;
      sublistFields.classList.toggle('sc-hidden', !subListBg.enabled);
      subListBg.color = sublistColor.value + 'db';
      subListBg.border = sublistBorder.value;
      subListBg.padding = parseInt(sublistPad.value, 10);
      subListBg.paddingY = subListBg.padding;
      subListBg.paddingX = subListBg.padding;
      sublistPadVal.textContent = `${subListBg.padding}px`;

      selectorBg.enabled = selCheck.checked;
      selFields.classList.toggle('sc-hidden', !selectorBg.enabled);
      selectorBg.color = selColor.value + 'cc';
      selectorBg.border = selBorder.value;
      selectorBg.padding = parseInt(selPad.value, 10);
      selectorBg.paddingY = selectorBg.padding;
      selectorBg.paddingX = selectorBg.padding;
      selPadVal.textContent = `${selectorBg.padding}px`;

      gStyles.lineGap = parseInt(gapRange.value, 10);
      gapVal.textContent = `${gStyles.lineGap}px`;

      gStyles.maxWidthPercent = parseInt(maxwidthRange.value, 10) || 100;
      maxwidthVal.textContent = `${gStyles.maxWidthPercent}%`;

      gStyles.textAlign = alignSel.value;

      gFont.preset = presetSel.value;
      gFont.fontFamily = fontSel.value;
      gFont.fontWeight = weightSel.value;
      gFont.fontStyle = styleSel.value;
      gFont.fontSizePercent = parseInt(sizeRange.value, 10) || 100;
      sizeVal.textContent = `${gFont.fontSizePercent}%`;
      gFont.textColor = colorInput.value;

      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      if (SC.renderAllLines) SC.renderAllLines();
    };

    // Subgroup visibility toggles (ai_instrs/_.md:12-13)
    sublistCheck.addEventListener('change', () => {
      sublistFields.classList.toggle('sc-hidden', !sublistCheck.checked);
      applyGlobalChanges();
    });
    sublistColor.addEventListener('input', applyGlobalChanges);
    sublistBorder.addEventListener('change', applyGlobalChanges);
    sublistPad.addEventListener('input', applyGlobalChanges);

    selCheck.addEventListener('change', () => {
      selFields.classList.toggle('sc-hidden', !selCheck.checked);
      applyGlobalChanges();
    });
    selColor.addEventListener('input', applyGlobalChanges);
    selBorder.addEventListener('change', applyGlobalChanges);
    selPad.addEventListener('input', applyGlobalChanges);

    gapRange.addEventListener('input', applyGlobalChanges);

    // Block resizing skeleton preview effect (ai_instrs/_.md:15, 25-26)
    maxwidthRange.addEventListener('input', () => {
      applyGlobalChanges();
      if (SC.showOverlaySkeleton) SC.showOverlaySkeleton(gStyles.maxWidthPercent);
    });
    maxwidthRange.addEventListener('change', () => {
      if (SC.hideOverlaySkeleton) SC.hideOverlaySkeleton();
    });
    if (maxwidthWrap) {
      maxwidthWrap.addEventListener('mouseenter', () => {
        if (SC.showOverlaySkeleton) SC.showOverlaySkeleton(gStyles.maxWidthPercent);
      });
      maxwidthWrap.addEventListener('mouseleave', () => {
        if (SC.hideOverlaySkeleton) SC.hideOverlaySkeleton();
      });
    }

    alignSel.addEventListener('change', applyGlobalChanges);

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
      fontSel.value = gFont.fontFamily;
      weightSel.value = gFont.fontWeight;
      sublistCheck.checked = subListBg.enabled;
      sublistFields.classList.toggle('sc-hidden', !subListBg.enabled);
      selCheck.checked = selectorBg.enabled;
      selFields.classList.toggle('sc-hidden', !selectorBg.enabled);
      applyGlobalChanges();
    });

    fontSel.addEventListener('change', applyGlobalChanges);
    weightSel.addEventListener('change', applyGlobalChanges);
    styleSel.addEventListener('change', applyGlobalChanges);
    sizeRange.addEventListener('input', applyGlobalChanges);
    colorInput.addEventListener('input', applyGlobalChanges);

    panel.querySelector('#sc-gstyle-reset').addEventListener('click', () => {
      SC.state.globalStyles = {
        subListBg: { enabled: true, color: 'rgba(12, 15, 20, 0.86)', border: '1px solid rgba(255, 255, 255, 0.2)', padding: 6, paddingY: 6, paddingX: 6, borderRadius: 8 },
        selectorBg: { enabled: false, color: 'rgba(0, 0, 0, 0.75)', border: 'none', padding: 4, paddingY: 4, paddingX: 4, borderRadius: 4 },
        lineGap: 3,
        maxWidthPercent: 100,
        textAlign: 'left',
        font: { preset: 'base', fontFamily: 'inherit', fontWeight: 'normal', fontStyle: 'normal', fontSizePercent: 100, textColor: '#ffffff' }
      };
      if (SC.openGlobalStylesModal) SC.openGlobalStylesModal();
      if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
      if (SC.renderAllLines) SC.renderAllLines();
    });

    const closePanel = () => {
      panel.classList.add('sc-hidden');
      panel.innerHTML = '';
      panel.dataset.activeItem = '';
      if (SC.hideOverlaySkeleton) SC.hideOverlaySkeleton();
    };

    panel.querySelector('#sc-gstyle-embed-close').addEventListener('click', closePanel);
  };
})();
