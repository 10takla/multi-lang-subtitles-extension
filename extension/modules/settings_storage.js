/**
 * Video Subtitles Capturer - Settings & Presets Storage Module
 * Implements persistent configuration in chrome.storage.local according to ai_instrs/_.md:41-46:
 * - Глобальные настройки: именованные пресеты (sc_presets).
 *   - Встроенный системный пресет «По умолчанию» (default) задаёт базовые дефолты.
 *   - В пресеты сохраняются все настройки суб-списка, кроме выбора дорожки субтитров (включая источник перевода).
 * - Локальные настройки сайта: под ключом origin основной страницы (scheme + hostname + port),
 *   общий для всех страниц, видео и плееров сайта, включая встроенные iframe (sc_sites_settings).
 * - Каждое изменение автоматически сохраняется в локальные настройки сайта.
 * - Применение выбранного пресета к текущему сайту с автосохранением локальных настроек.
 * - Для отсутствующих значений локальных настроек используется пресет «По умолчанию».
 * - Состояние вкл/выкл субтитров (subtitlesEnabled) строго исключено из настроек.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  const STORAGE_KEY_PRESETS = 'sc_presets';
  const STORAGE_KEY_SITES = 'sc_sites_settings';

  SC.DEFAULT_PRESET_ID = 'default';
  SC.DEFAULT_PRESET_NAME = 'По умолчанию';

  /**
   * Generates a stable origin key for the site (scheme + hostname + port).
   * Requirement: ai_instrs/_.md:44 "ключ origin основной страницы (scheme + hostname + port), общий для всех страниц, видео и плееров сайта, включая встроенные iframe."
   */
  SC.getSettingsOriginKey = function() {
    try {
      if (window.self !== window.top) {
        try {
          if (window.top && window.top.location && window.top.location.origin) {
            return window.top.location.origin;
          }
        } catch (_) {}

        if (window.location && window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
          return window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1];
        }

        if (document.referrer) {
          try {
            const refUrl = new URL(document.referrer);
            if (refUrl.origin && refUrl.origin !== 'null') {
              return refUrl.origin;
            }
          } catch (_) {}
        }
      }

      if (window.location && window.location.origin && window.location.origin !== 'null') {
        return window.location.origin;
      }
      return `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
    } catch (_) {
      return window.location.hostname || 'site';
    }
  };

  SC.getSettingsInstanceKey = function() {
    return SC.getSettingsOriginKey();
  };

  /**
   * Extracts saveable settings payload from SC.state.
   * STRICT CONSTRAINT: Excludes subtitlesEnabled (ai_instrs/_.md:48-49).
   * Requirement: ai_instrs/_.md:43: "Сохраняй в пресеты все настройки суб-списка, кроме выбора дорожки субтитров (включая источник перевода): он принадлежит текущему видео."
   */
  SC.exportConfigurableSettings = function(isPreset = false) {
    const s = SC.state || {};
    return {
      fontSize: typeof s.fontSize === 'number' ? s.fontSize : 13,
      overlayPosX: typeof s.overlayPosX === 'number' ? s.overlayPosX : 50,
      overlayPosY: typeof s.overlayPosY === 'number' ? s.overlayPosY : 90,
      moveLocked: Boolean(s.moveLocked),
      showLanguageTags: Boolean(s.showLanguageTags),
      autoScroll: Boolean(s.autoScroll),
      globalStyles: JSON.parse(JSON.stringify(s.globalStyles || {})),
      languages: Array.isArray(s.languages) ? s.languages.map(l => {
        const isTrackMode = l.mode === 'track' || l.type === 'source';
        const langObj = {
          id: l.id,
          mode: isTrackMode ? 'track' : 'trans',
          targetLang: l.targetLang || (l.lang && !l.lang.includes(':') && l.lang !== 'auto' ? l.lang : 'en'),
          engine: l.engine || 'google',
          bufferChars: l.bufferChars,
          bufferSec: l.bufferSec,
          type: isTrackMode ? 'source' : 'translation',
          visible: Boolean(l.visible),
          style: l.style ? JSON.parse(JSON.stringify(l.style)) : undefined
        };

        if (isPreset) {
          // Omit video-specific track selections
          langObj.trackId = '';
          langObj.sourceTrack = '';
          langObj.sourceFrom = '';
          langObj.lang = isTrackMode ? '' : langObj.targetLang;
        } else {
          // Preserve local site track selections
          langObj.trackId = l.trackId || '';
          langObj.sourceTrack = l.sourceTrack || '';
          langObj.sourceFrom = l.sourceFrom || '';
          langObj.lang = l.lang || '';
        }
        return langObj;
      }) : []
    };
  };

  /**
   * Generates built-in default values for the «По умолчанию» preset.
   */
  SC.getBuiltInDefaultSettings = function() {
    return {
      fontSize: 13,
      overlayPosX: 50,
      overlayPosY: 90,
      moveLocked: true,
      showLanguageTags: false,
      autoScroll: true,
      globalStyles: {
        subListBg: {
          enabled: true,
          color: 'rgba(12, 15, 20, 0.86)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          padding: 6,
          paddingY: 6,
          paddingX: 6,
          borderRadius: 8
        },
        selectorBg: {
          enabled: false,
          color: 'rgba(0, 0, 0, 0.75)',
          border: 'none',
          padding: 4,
          paddingY: 4,
          paddingX: 4,
          borderRadius: 4
        },
        lineGap: 3,
        maxWidthPercent: 68,
        textAlign: 'left',
        font: {
          preset: 'base',
          fontFamily: 'inherit',
          fontWeight: 'normal',
          fontStyle: 'normal',
          fontSizePercent: 100,
          textColor: '#ffffff',
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)'
        }
      },
      languages: [
        {
          id: 'lang_init',
          mode: 'track',
          trackId: '',
          sourceTrack: '',
          sourceFrom: '',
          targetLang: 'en',
          engine: 'google',
          bufferChars: 1000,
          bufferSec: 30,
          lang: '',
          type: 'source',
          visible: true
        }
      ]
    };
  };

  /**
   * Deep merges target into source object without undefined overwriting.
   */
  function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    const result = { ...(base || {}) };
    for (const key of Object.keys(override)) {
      const val = override[key];
      if (val === undefined) continue;
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = deepMerge(result[key] || {}, val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  /**
   * Applies loaded settings onto SC.state without overwriting subtitlesEnabled.
   * Requirement: ai_instrs/_.md:46 "Применяй локальные настройки сайта, а для отсутствующих значений используй пресет «По умолчанию»."
   */
  function mergeSettingsInPlace(target, values) {
    for (const [key, value] of Object.entries(values)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
        mergeSettingsInPlace(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }
  SC.applyConfigurableSettings = function(siteSettings, defaultPreset) {
    const s = SC.state;
    if (!s) return;

    const base = defaultPreset && typeof defaultPreset === 'object'
      ? defaultPreset
      : SC.getBuiltInDefaultSettings();
    const site = siteSettings && typeof siteSettings === 'object' ? siteSettings : {};
    const merged = deepMerge(base, site);

    if (typeof merged.fontSize === 'number') s.fontSize = merged.fontSize;
    if (typeof merged.overlayPosX === 'number') s.overlayPosX = merged.overlayPosX;
    if (typeof merged.overlayPosY === 'number') s.overlayPosY = merged.overlayPosY;
    if (typeof merged.moveLocked === 'boolean') s.moveLocked = merged.moveLocked;
    if (typeof merged.showLanguageTags === 'boolean') s.showLanguageTags = merged.showLanguageTags;
    if (typeof merged.autoScroll === 'boolean') s.autoScroll = merged.autoScroll;

    if (merged.globalStyles && typeof merged.globalStyles === 'object') {
      s.globalStyles = mergeSettingsInPlace(s.globalStyles || {}, merged.globalStyles);
    }

    if (Array.isArray(merged.languages) && merged.languages.length > 0) {
      const current = new Map((s.languages || []).map(item => [item.id, item]));
      s.languages = merged.languages.map(l => {
        const item = current.get(l.id) || {};
        return mergeSettingsInPlace(item, { ...l, visible: l.visible !== false });
      });
    }
    // Refresh UI components
    if (SC.syncSettingsControls) SC.syncSettingsControls();
    if (SC.syncPositionSliders) SC.syncPositionSliders();
    if (SC.renderLanguageList) SC.renderLanguageList();
    if (SC.applyFontSize) SC.applyFontSize();
    if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
    if (SC.renderAllLines) SC.renderAllLines();
  };

  /**
   * Loads all presets from storage, ensuring the default preset exists.
   */
  SC.getPresets = function() {
    return new Promise((resolve) => {
      const fallbackDefaults = {
        [SC.DEFAULT_PRESET_ID]: {
          id: SC.DEFAULT_PRESET_ID,
          name: SC.DEFAULT_PRESET_NAME,
          settings: SC.getBuiltInDefaultSettings()
        }
      };

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([STORAGE_KEY_PRESETS], (res) => {
          let presets = res?.[STORAGE_KEY_PRESETS] || {};
          if (!presets[SC.DEFAULT_PRESET_ID]) {
            presets[SC.DEFAULT_PRESET_ID] = fallbackDefaults[SC.DEFAULT_PRESET_ID];
          }
          resolve(presets);
        });
      } else {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_PRESETS);
          let presets = raw ? JSON.parse(raw) : {};
          if (!presets[SC.DEFAULT_PRESET_ID]) {
            presets[SC.DEFAULT_PRESET_ID] = fallbackDefaults[SC.DEFAULT_PRESET_ID];
          }
          resolve(presets);
        } catch (_) {
          resolve(fallbackDefaults);
        }
      }
    });
  };

  /**
   * Saves a named preset into chrome.storage.local.
   */
  SC.savePreset = function(presetId, presetName, settingsPayload = null) {
    return new Promise(async (resolve) => {
      const presets = await SC.getPresets();
      const payload = settingsPayload || SC.exportConfigurableSettings(true);

      const id = presetId || `preset_${Date.now()}`;
      const name = presetName || (id === SC.DEFAULT_PRESET_ID ? SC.DEFAULT_PRESET_NAME : 'Пресет');

      presets[id] = {
        id: id,
        name: name,
        settings: payload
      };

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY_PRESETS]: presets }, () => {
          if (SC.updatePresetDropdown) SC.updatePresetDropdown(id);
          resolve(id);
        });
      } else {
        try {
          localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
        } catch (_) {}
        if (SC.updatePresetDropdown) SC.updatePresetDropdown(id);
        resolve(id);
      }
    });
  };

  /**
   * Saves current site settings into the currently selected preset (or default preset).
   */
  function portableSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Некорректные настройки пресета');
    const result = {};
    const defaults = SC.getBuiltInDefaultSettings();
    for (const key of ['fontSize', 'overlayPosX', 'overlayPosY', 'moveLocked', 'showLanguageTags', 'autoScroll', 'globalStyles', 'languages']) {
      if (!(key in settings)) continue;
      if (typeof settings[key] !== typeof defaults[key] || settings[key] === null) throw new Error(`Некорректное поле: ${key}`);
      result[key] = JSON.parse(JSON.stringify(settings[key]));
    }
    if (result.globalStyles && (Array.isArray(result.globalStyles) || typeof result.globalStyles !== 'object')) throw new Error('Некорректные стили');
    if (result.languages !== undefined) {
      if (!Array.isArray(result.languages)) throw new Error('Некорректный суб-список');
      result.languages = result.languages.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Некорректный селектор');
        const track = item.mode === 'track' || item.type === 'source';
        const clean = {id: `lang_import_${index}`, mode: track ? 'track' : 'trans', type: track ? 'source' : 'translation', trackId: '', sourceTrack: '', sourceFrom: ''};
        for (const key of ['targetLang', 'engine', 'bufferChars', 'bufferSec', 'visible', 'style']) {
          if (item[key] !== undefined) clean[key] = item[key];
        }
        if (clean.targetLang !== undefined && typeof clean.targetLang !== 'string') throw new Error('Некорректный язык перевода');
        if (clean.engine !== undefined && typeof clean.engine !== 'string') throw new Error('Некорректный движок перевода');
        for (const key of ['bufferChars', 'bufferSec']) {
          if (clean[key] !== undefined && (typeof clean[key] !== 'number' || !Number.isFinite(clean[key]) || clean[key] < 0)) throw new Error('Некорректный буфер перевода');
        }
        if (clean.visible !== undefined && typeof clean.visible !== 'boolean') throw new Error('Некорректная видимость');
        if (clean.style !== undefined && (!clean.style || typeof clean.style !== 'object' || Array.isArray(clean.style))) throw new Error('Некорректный стиль селектора');
        clean.lang = track ? '' : (clean.targetLang || 'en');
        return clean;
      });
    }
    return result;
  }

  SC.exportPresetsText = async function() {
    const presets = await SC.getPresets();
    return JSON.stringify({version: 1, presets: Object.values(presets).map(p => ({id: p.id === SC.DEFAULT_PRESET_ID ? 'default' : undefined, name: p.name, settings: portableSettings(p.settings)}))}, null, 2);
  };

  SC.importPresetsText = async function(text, conflictMode = 'copy') {
    let parsed;
    try {
      parsed = JSON.parse(text, (key, value) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Недопустимое поле');
        return value;
      });
    } catch (_) { throw new Error('Некорректная JSON-строка'); }
    if (parsed?.version !== 1 || !Array.isArray(parsed.presets) || !parsed.presets.length) throw new Error('Ожидается экспорт пресетов версии 1');
    if (!['copy', 'replace'].includes(conflictMode)) throw new Error('Выберите способ обработки совпадений');
    const incoming = parsed.presets.map(p => {
      if (!p || typeof p.name !== 'string' || !p.name.trim()) throw new Error('У пресета отсутствует название');
      return {isDefault: p.id === 'default', name: p.name.trim(), settings: portableSettings(p.settings)};
    });
    const presets = await SC.getPresets();
    const normalize = name => name.trim().toLocaleLowerCase();
    for (const p of incoming) {
      const existing = p.isDefault ? presets[SC.DEFAULT_PRESET_ID] : Object.values(presets).find(item => normalize(item.name) === normalize(p.name));
      let id, name = p.name;
      if (existing && conflictMode === 'replace') {
        id = existing.id;
        if (id === SC.DEFAULT_PRESET_ID) name = SC.DEFAULT_PRESET_NAME;
      } else {
        id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        let suffix = 2;
        while (Object.values(presets).some(item => normalize(item.name) === normalize(name))) name = `${p.name} (${suffix++})`;
      }
      presets[id] = {id, name, settings: p.settings};
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({sc_presets: presets}, () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message)); else resolve();
        });
      });
    } else localStorage.setItem('sc_presets', JSON.stringify(presets));
    if (SC.updatePresetDropdown) await SC.updatePresetDropdown();
    return incoming.length;
  };
  SC.renamePreset = async function(presetId, name) {
    if (!presetId || presetId === SC.DEFAULT_PRESET_ID) return false;
    name = String(name || '').trim();
    if (!name) throw new Error('Введите название пресета');
    const presets = await SC.getPresets();
    if (!Object.prototype.hasOwnProperty.call(presets, presetId)) return false;
    if (Object.values(presets).some(p => p.id !== presetId && p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error('Пресет с таким названием уже существует');
    }
    presets[presetId].name = name;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEY_PRESETS]: presets }, () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
    } else {
      localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
    }
    if (SC.updatePresetDropdown) await SC.updatePresetDropdown(presetId);
    return true;
  };
  SC.deletePreset = async function(presetId) {
    if (!presetId || presetId === SC.DEFAULT_PRESET_ID) return false;
    const presets = await SC.getPresets();
    if (!Object.prototype.hasOwnProperty.call(presets, presetId)) return false;
    delete presets[presetId];
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEY_PRESETS]: presets }, () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
    } else {
      localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
    }
    if (SC.updatePresetDropdown) await SC.updatePresetDropdown(SC.DEFAULT_PRESET_ID);
    return true;
  };
  SC.saveCurrentSettingsAsGlobalDefaults = function(presetId = null) {
    return new Promise(async (resolve) => {
      const select = SC.shadowRoot?.getElementById('sc-preset-select');
      const targetId = presetId || (select ? select.value : SC.DEFAULT_PRESET_ID) || SC.DEFAULT_PRESET_ID;
      const presets = await SC.getPresets();
      const existingName = presets[targetId]?.name || (targetId === SC.DEFAULT_PRESET_ID ? SC.DEFAULT_PRESET_NAME : 'Пресет');

      await SC.savePreset(targetId, existingName, SC.exportConfigurableSettings(true));
      if (SC.showToast) {
        SC.showToast(`Пресет «${existingName}» сохранён`);
      }
      resolve(true);
    });
  };

  /**
   * Applies selected preset to the current site with auto-saving to local site settings.
   * Requirement: ai_instrs/_.md:45 "Выбранный пресет применяй к текущему сайту с автосохранением локальных настроек."
   */
  SC.applyPresetToCurrentSite = async function(presetId) {
    const presets = await SC.getPresets();
    const preset = presets[presetId] || presets[SC.DEFAULT_PRESET_ID];
    if (!preset || !preset.settings) return;

    // Preserve local tracks of active video if currently available
    const curTracks = (SC.state?.languages || []).map(l => ({
      trackId: l.trackId,
      sourceTrack: l.sourceTrack,
      sourceFrom: l.sourceFrom
    }));

    const presetSettings = JSON.parse(JSON.stringify(preset.settings));
    if (Array.isArray(presetSettings.languages)) {
      presetSettings.languages.forEach((l, idx) => {
        if (curTracks[idx]) {
          if (!l.trackId && curTracks[idx].trackId) l.trackId = curTracks[idx].trackId;
          if (!l.sourceTrack && curTracks[idx].sourceTrack) l.sourceTrack = curTracks[idx].sourceTrack;
          if (!l.sourceFrom && curTracks[idx].sourceFrom) l.sourceFrom = curTracks[idx].sourceFrom;
        }
      });
    }

    const defaultPreset = presets[SC.DEFAULT_PRESET_ID]?.settings || SC.getBuiltInDefaultSettings();
    SC.applyConfigurableSettings(presetSettings, defaultPreset);

    if (SC.autoSaveSiteSettings) {
      SC.autoSaveSiteSettings();
    }
    if (SC.showToast) {
      SC.showToast(`Применён пресет: ${preset.name}`);
    }
  };

  /**
   * Automatically saves current settings for the active site origin (ai_instrs/_.md:44).
   * Debounced to prevent excessive writes on sliders.
   */
  let autoSaveTimeout = null;
  SC.autoSaveSiteSettings = function() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      const originKey = SC.getSettingsOriginKey();
      const currentConfig = SC.exportConfigurableSettings(false);

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([STORAGE_KEY_SITES], (res) => {
          const sites = res?.[STORAGE_KEY_SITES] || {};
          sites[originKey] = currentConfig;
          chrome.storage.local.set({ [STORAGE_KEY_SITES]: sites });
        });
      } else {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_SITES);
          const sites = raw ? JSON.parse(raw) : {};
          sites[originKey] = currentConfig;
          localStorage.setItem(STORAGE_KEY_SITES, JSON.stringify(sites));
        } catch (_) {}
      }
    }, 300);
  };

  /**
   * Loads settings on startup:
   * Requirement: ai_instrs/_.md:46 "Применяй локальные настройки сайта, а для отсутствующих значений используй пресет «По умолчанию»."
   */
  SC.initSettings = function() {
    const originKey = SC.getSettingsOriginKey();

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY_PRESETS, STORAGE_KEY_SITES], (res) => {
        const presets = res?.[STORAGE_KEY_PRESETS] || {};
        const defaultPreset = presets[SC.DEFAULT_PRESET_ID]?.settings || SC.getBuiltInDefaultSettings();
        const sites = res?.[STORAGE_KEY_SITES] || {};
        const siteConfig = sites[originKey] || null;

        SC.applyConfigurableSettings(siteConfig, defaultPreset);
        if (SC.updatePresetDropdown) SC.updatePresetDropdown();
      });

      // Synchronize changes across frames or tabs if storage changes externally
      try {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          if (changes[STORAGE_KEY_SITES] || changes[STORAGE_KEY_PRESETS]) {
            const curOrigin = SC.getSettingsOriginKey();
            chrome.storage.local.get([STORAGE_KEY_PRESETS, STORAGE_KEY_SITES], (res) => {
              const presets = res?.[STORAGE_KEY_PRESETS] || {};
              const defaultPreset = presets[SC.DEFAULT_PRESET_ID]?.settings || SC.getBuiltInDefaultSettings();
              const sites = res?.[STORAGE_KEY_SITES] || {};
              const siteConfig = sites[curOrigin] || null;
              // Own autosaves already reflect the current state. Replacing it detaches
              // style objects referenced by the open editor's event handlers.
              const currentConfig = SC.exportConfigurableSettings(false);
              if (!siteConfig || JSON.stringify(siteConfig) !== JSON.stringify(currentConfig)) {
                SC.applyConfigurableSettings(siteConfig, defaultPreset);
              }
              if (SC.updatePresetDropdown) SC.updatePresetDropdown();
            });
          }
        });
      } catch (_) {}
    } else {
      try {
        const rawPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
        const presets = rawPresets ? JSON.parse(rawPresets) : {};
        const defaultPreset = presets[SC.DEFAULT_PRESET_ID]?.settings || SC.getBuiltInDefaultSettings();
        const rawSites = localStorage.getItem(STORAGE_KEY_SITES);
        const sites = rawSites ? JSON.parse(rawSites) : {};
        const siteConfig = sites[originKey] || null;
        SC.applyConfigurableSettings(siteConfig, defaultPreset);
        if (SC.updatePresetDropdown) SC.updatePresetDropdown();
      } catch (_) {}
    }
  };
})();
