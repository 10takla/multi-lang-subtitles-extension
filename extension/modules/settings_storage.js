/**
 * Video Subtitles Capturer - Settings & Storage Module
 * Implements persistent configuration in chrome.storage.local (ai_instrs/_.md:39-45).
 * - global_defaults: Global default settings for newly visited sites.
 * - site_settings: Local settings per site instance key (URL + video_id). Auto-saved on every change.
 * - Header save button: Copies current site settings into global defaults.
 * - Exclusion: Subtitles enable/disable state (subtitlesEnabled) is strictly excluded from persistent settings.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  const STORAGE_KEY_GLOBAL = 'sc_global_defaults';
  const STORAGE_KEY_SITES = 'sc_sites_settings';

  /**
   * Generates a stable origin key for the site (scheme + hostname + port).
   * Requirement: ai_instrs/_.md:42 "ключ origin основной страницы (scheme + hostname + port), общий для всех страниц, видео и плееров сайта, включая встроенные iframe."
   */
  SC.getSettingsOriginKey = function() {
    try {
      // If we are in an iframe, attempt to read top frame origin, or ancestor origin, or document.referrer
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
   * STRICT CONSTRAINT: Excludes subtitlesEnabled (ai_instrs/_.md:46-47).
   * Requirement: ai_instrs/_.md:42: "Сохраняй глобально все настройки суб-списка, кроме выбора дорожки субтитров (включая источник перевода): он принадлежит текущему видео."
   */
  SC.exportConfigurableSettings = function(isGlobal = false) {
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

        if (isGlobal) {
          // Exclude any video-specific track IDs from global defaults
          langObj.trackId = '';
          langObj.sourceTrack = '';
          langObj.sourceFrom = '';
          // For track mode, lang held the track ID (e.g. "custom:0_17_0", "track:0", "yt:en") - exclude it
          // For translator, lang is the target language
          langObj.lang = isTrackMode ? '' : langObj.targetLang;
        } else {
          // Preserve local site settings
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
   * Requirement: ai_instrs/_.md:43 "Применяй локальные настройки сайта, а для отсутствующих значений используй глобальные."
   */
  SC.applyConfigurableSettings = function(siteSettings, globalDefaults) {
    const s = SC.state;
    if (!s) return;

    // Merge: base is global defaults (or current state defaults), overridden by siteSettings
    const base = globalDefaults && typeof globalDefaults === 'object' ? globalDefaults : {};
    const site = siteSettings && typeof siteSettings === 'object' ? siteSettings : {};
    const merged = deepMerge(base, site);

    if (typeof merged.fontSize === 'number') s.fontSize = merged.fontSize;
    if (typeof merged.overlayPosX === 'number') s.overlayPosX = merged.overlayPosX;
    if (typeof merged.overlayPosY === 'number') s.overlayPosY = merged.overlayPosY;
    if (typeof merged.moveLocked === 'boolean') s.moveLocked = merged.moveLocked;
    if (typeof merged.showLanguageTags === 'boolean') s.showLanguageTags = merged.showLanguageTags;
    if (typeof merged.autoScroll === 'boolean') s.autoScroll = merged.autoScroll;

    if (merged.globalStyles && typeof merged.globalStyles === 'object') {
      s.globalStyles = deepMerge(s.globalStyles || {}, merged.globalStyles);
    }

    if (Array.isArray(merged.languages) && merged.languages.length > 0) {
      s.languages = merged.languages.map(l => ({
        ...l,
        visible: l.visible !== false
      }));
    }

    // Refresh UI components
    if (SC.syncPositionSliders) SC.syncPositionSliders();
    if (SC.renderLanguageList) SC.renderLanguageList();
    if (SC.applyFontSize) SC.applyFontSize();
    if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition();
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
    if (SC.renderAllLines) SC.renderAllLines();
  };

  /**
   * Saves current state to global defaults in chrome.storage.local.
   * Triggered by the "Save" button in the header (ai_instrs/_.md:41).
   */
  SC.saveCurrentSettingsAsGlobalDefaults = function() {
    return new Promise((resolve) => {
      const payload = SC.exportConfigurableSettings(true);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY_GLOBAL]: payload }, () => {
          if (SC.showToast) {
            SC.showToast('Настройки сохранены по умолчанию');
          }
          resolve(true);
        });
      } else {
        try {
          localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(payload));
          if (SC.showToast) SC.showToast('Настройки сохранены по умолчанию');
        } catch (_) {}
        resolve(true);
      }
    });
  };

  /**
   * Automatically saves current settings for the active site origin (ai_instrs/_.md:42).
   * Debounced to prevent excessive writes on sliders.
   */
  let autoSaveTimeout = null;
  SC.autoSaveSiteSettings = function() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      const originKey = SC.getSettingsOriginKey();
      const currentConfig = SC.exportConfigurableSettings();

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
   * Requirement: ai_instrs/_.md:43 "Применяй локальные настройки сайта, а для отсутствующих значений используй глобальные."
   */
  SC.initSettings = function() {
    const originKey = SC.getSettingsOriginKey();

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY_GLOBAL, STORAGE_KEY_SITES], (res) => {
        const globalDefs = res?.[STORAGE_KEY_GLOBAL] || null;
        const sites = res?.[STORAGE_KEY_SITES] || {};
        const siteConfig = sites[originKey] || null;

        SC.applyConfigurableSettings(siteConfig, globalDefs);
      });

      // Synchronize changes across frames or tabs if storage changes externally
      try {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          if (changes[STORAGE_KEY_SITES] || changes[STORAGE_KEY_GLOBAL]) {
            const curOrigin = SC.getSettingsOriginKey();
            chrome.storage.local.get([STORAGE_KEY_GLOBAL, STORAGE_KEY_SITES], (res) => {
              const globalDefs = res?.[STORAGE_KEY_GLOBAL] || null;
              const sites = res?.[STORAGE_KEY_SITES] || {};
              const siteConfig = sites[curOrigin] || null;
              SC.applyConfigurableSettings(siteConfig, globalDefs);
            });
          }
        });
      } catch (_) {}
    } else {
      try {
        const rawGlob = localStorage.getItem(STORAGE_KEY_GLOBAL);
        const globalDefs = rawGlob ? JSON.parse(rawGlob) : null;
        const rawSites = localStorage.getItem(STORAGE_KEY_SITES);
        const sites = rawSites ? JSON.parse(rawSites) : {};
        const siteConfig = sites[originKey] || null;
        SC.applyConfigurableSettings(siteConfig, globalDefs);
      } catch (_) {}
    }
  };
})();
