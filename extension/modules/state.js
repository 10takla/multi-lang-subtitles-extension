/**
 * Video Subtitles Capturer - State & Utilities Module
 */

(() => {
  // Prevent duplicate injection in the same frame
  if (window.__subtitlesCapturerInjected) return;
  window.__subtitlesCapturerInjected = true;

  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Available languages for translation (Google Translate)
  SC.AVAILABLE_LANGUAGES = [
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'zh-CN', name: '中文' },
    { code: 'ja', name: '日本語' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'uk', name: 'Українська' },
    { code: 'ar', name: 'العربية' }
  ];

  // Available translation engines (ai_instrs/_.md:21-25)
  SC.TRANSLATION_ENGINES = [
    { id: 'google', name: 'Google', maxChars: 1800 },
    { id: 'yandex', name: 'Yandex', maxChars: 10000 },
    { id: 'chrome', name: 'Chrome AI', maxChars: 4000 }
  ];

  SC.ENGINE_MAX_CHARS = {
    google: 1800,
    yandex: 10000,
    chrome: 4000
  };

  SC.getEngineMaxChars = function(engine = 'google') {
    return SC.ENGINE_MAX_CHARS[engine] || 1800;
  };

  SC.isChromeAIAvailable = function() {
    return Boolean(
      typeof window !== 'undefined' && (
        (window.translation && typeof window.translation.createTranslator === 'function') ||
        (window.ai && window.ai.translator && typeof window.ai.translator.create === 'function')
      )
    );
  };

  SC.getAvailableEngines = function() {
    const hasChromeAI = SC.isChromeAIAvailable ? SC.isChromeAIAvailable() : false;
    return SC.TRANSLATION_ENGINES.filter(eng => eng.id !== 'chrome' || hasChromeAI);
  };

  SC.getDefaultBufferChars = function(engine = 'google') {
    return Math.min(1000, SC.getEngineMaxChars(engine));
  };

  SC.getLangName = function(code) {
    const found = SC.AVAILABLE_LANGUAGES.find(l => l.code === code);
    return found ? found.name : code;
  };

  // Normalize language code to standard 2-3 letter code or 'auto'
  SC.normalizeLangCode = function(raw) {
    if (!raw || typeof raw !== 'string') return 'auto';
    const cleaned = raw.trim().toLowerCase();
    if (!cleaned || cleaned === 'auto' || /^\d+$/.test(cleaned)) return 'auto';
    if (cleaned === 'zh-cn' || cleaned === 'zh_cn') return 'zh-CN';
    if (cleaned === 'zh-tw' || cleaned === 'zh_tw') return 'zh-TW';

    // Match keywords in track labels or descriptions
    if (/рус|rus|russian/i.test(cleaned)) return 'ru';
    if (/англ|eng|english/i.test(cleaned)) return 'en';
    if (/исп|spa|esp|spanish/i.test(cleaned)) return 'es';
    if (/нем|deu|ger|german/i.test(cleaned)) return 'de';
    if (/фран|fra|fre|french/i.test(cleaned)) return 'fr';
    if (/кит|chi|zho|chinese/i.test(cleaned)) return 'zh-CN';
    if (/япон|jpn|jap|japanese/i.test(cleaned)) return 'ja';
    if (/ита|ita|italian/i.test(cleaned)) return 'it';
    if (/пор|por|portuguese/i.test(cleaned)) return 'pt';
    if (/тур|tur|turkish/i.test(cleaned)) return 'tr';
    if (/укр|ukr|ukrainian/i.test(cleaned)) return 'uk';
    if (/араб|ara|arabic/i.test(cleaned)) return 'ar';
    if (/поль|pol|polish/i.test(cleaned)) return 'pl';
    if (/корей|kor|korean/i.test(cleaned)) return 'ko';

    // Check if raw matches known ISO-639-1 2-letter codes or matches AVAILABLE_LANGUAGES
    if (SC.AVAILABLE_LANGUAGES && SC.AVAILABLE_LANGUAGES.some(l => l.code.toLowerCase() === cleaned)) {
      return cleaned;
    }

    // 3-letter codes map
    const map3to2 = {
      eng: 'en', rus: 'ru', spa: 'es', deu: 'de', ger: 'de', fra: 'fr', fre: 'fr',
      ita: 'it', por: 'pt', zho: 'zh-CN', chi: 'zh-CN', jpn: 'ja', kor: 'ko',
      tur: 'tr', ukr: 'uk', ara: 'ar', pol: 'pl', ces: 'cs', cze: 'cs',
      nld: 'nl', dut: 'nl', swe: 'sv', ron: 'ro', rum: 'ro', ell: 'el',
      gre: 'el', heb: 'he', hin: 'hi', ind: 'id', tha: 'th', vie: 'vi'
    };
    if (map3to2[cleaned]) return map3to2[cleaned];

    if (/^[a-z]{2}$/.test(cleaned)) {
      if (['cu', 'tr', 'yt'].includes(cleaned) && raw.includes(':')) return 'auto';
      return cleaned;
    }

    // Check URL patterns like "/ru.vtt", "_en.srt", "subs/ru"
    const urlMatch = cleaned.match(/[\/._-]([a-z]{2})(?:\.(?:vtt|srt)|\/|$)/);
    if (urlMatch) {
      const code = urlMatch[1];
      if (['en', 'ru', 'es', 'de', 'fr', 'ja', 'it', 'pt', 'tr', 'uk', 'ar', 'zh'].includes(code)) {
        return code;
      }
    }

    return 'auto';
  };

  // Resolve language code from a track identifier (e.g. 'track:ru', 'yt:en', 'track:0', 'auto')
  SC.resolveTrackLang = function(trackId) {
    if (!trackId || trackId === 'auto') {
      const trackItem = SC.state.languages?.find(l => (l.mode === 'track' || l.type === 'source') && (l.trackId || l.lang));
      if (trackItem) {
        const val = trackItem.trackId || trackItem.lang;
        if (val && val !== 'auto' && val !== trackId) {
          const res = SC.resolveTrackLang(val);
          if (res !== 'auto') return res;
        }
      }
      const video = SC.getActiveVideo();
      if (video && video.textTracks && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const lang = video.textTracks[i].language || video.textTracks[i].label;
          if (lang && lang.trim()) {
            const norm = SC.normalizeLangCode(lang);
            if (norm !== 'auto') return norm;
          }
        }
      }
      if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) {
        const ytLang = SC.ytCaptionTracks[0].languageCode || SC.ytCaptionTracks[0].name?.simpleText;
        if (ytLang) {
          const norm = SC.normalizeLangCode(ytLang);
          if (norm !== 'auto') return norm;
        }
      }
      const avail = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
      if (avail.length > 0) {
        for (const t of avail) {
          if (t.value && t.value !== 'auto' && t.value !== trackId) {
            const res = SC.resolveTrackLang(t.value);
            if (res !== 'auto') return res;
          }
        }
      }
      return 'auto';
    }

    if (trackId.startsWith('yt:')) {
      const code = trackId.replace('yt:', '');
      const foundYt = SC.ytCaptionTracks?.find(t => t.languageCode === code || String(SC.ytCaptionTracks.indexOf(t)) === code);
      if (foundYt) {
        const lang = SC.normalizeLangCode(foundYt.languageCode || foundYt.name?.simpleText || foundYt.name?.runs?.[0]?.text);
        if (lang !== 'auto') return lang;
      }
      return SC.normalizeLangCode(code);
    }

    if (trackId.startsWith('track:')) {
      const suffix = trackId.replace('track:', '');
      if (/^\d+$/.test(suffix)) {
        const idx = parseInt(suffix, 10);
        const video = SC.getActiveVideo();
        if (video && video.textTracks && video.textTracks[idx]) {
          const tr = video.textTracks[idx];
          const trLang = tr.language || tr.label;
          if (trLang && trLang.trim()) {
            return SC.normalizeLangCode(trLang);
          }
        }
        return 'auto';
      }
      return SC.normalizeLangCode(suffix);
    }

    if (trackId.startsWith('custom:')) {
      const cTr = SC.customCaptionTracks?.find(t => t.id === trackId);
      if (cTr) {
        const fromLabel = SC.normalizeLangCode(cTr.label);
        if (fromLabel !== 'auto') return fromLabel;
        const fromUrl = SC.normalizeLangCode(cTr.url);
        if (fromUrl !== 'auto') return fromUrl;
      }
      const avail = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
      const found = avail.find(t => t.value === trackId);
      if (found && found.label) {
        const fromLabel = SC.normalizeLangCode(found.label);
        if (fromLabel !== 'auto') return fromLabel;
      }
      return 'auto';
    }

    const avail = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
    const found = avail.find(t => t.value === trackId);
    if (found && found.label) {
      const fromLabel = SC.normalizeLangCode(found.label);
      if (fromLabel !== 'auto') return fromLabel;
    }

    return SC.normalizeLangCode(trackId);
  };

  // Suggest a translation target language that is different from the source video language
  SC.getSuggestedTargetLang = function(sourceTrackId = null) {
    const detectedSource = SC.resolveTrackLang(sourceTrackId || 'auto');
    const existingTransCodes = new Set(
      SC.state.languages
        .filter(l => (l.mode === 'trans' || l.type === 'translation') && l.mode !== 'track')
        .map(l => l.targetLang || l.lang)
    );

    const candidate = SC.AVAILABLE_LANGUAGES.find(l => {
      if (existingTransCodes.has(l.code)) return false;
      if (detectedSource !== 'auto' && (l.code === detectedSource || detectedSource.startsWith(l.code))) return false;
      return true;
    });

    if (candidate) return candidate.code;
    return detectedSource === 'ru' ? 'en' : 'ru';
  };

  // State container
  SC.state = {
    lines: [],
    autoScroll: true,
    fontSize: 13,
    widgetVisible: false,
    minimized: false,
    widgetVideoRelX: null,
    widgetVideoRelY: null,
    lastAddedText: '',
    lastAddedTime: 0,
    lastVideoTime: -1,
    activeStreamingLineId: null,
    // Multi-subtitles: Unified language selectors (ai_instrs/_.md)
    languages: [
      {
        id: 'lang_init',
        mode: 'track', // 'track' (Выбор субтитра из суб-списка) | 'trans' (Перевод с выбором языка)
        trackId: '', // Default to first element of sub-list when available
        sourceTrack: '',
        targetLang: 'en',
        engine: 'google',
        bufferChars: 1000,
        bufferSec: 30,
        lang: '',
        type: 'source',
        visible: true
      }
    ],
    translationCache: new Map(),
    overlayPosX: 50, // 0-100% X position (ai_instrs/_.md:27)
    overlayPosY: 90, // 0-100% Y position (ai_instrs/_.md:27)
    currentActiveLine: null,
    overlayFadeTimeout: null,
    showLanguageTags: false, // Default off (ai_instrs/_.md:26)
    subtitlesEnabled: true, // Master toggle for subtitles display
    // Общие стили (ai_instrs/_.md:22-30)
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
      font: {
        preset: 'base', // 'base' | 'netflix' | 'youtube' | 'custom'
        fontFamily: 'inherit',
        fontWeight: 'normal',
        fontStyle: 'normal',
        fontSizePercent: 100,
        textColor: '#ffffff',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)'
      }
    }
  };

  SC.MAX_LINES = 250;

  // Helper: Format seconds to MM:SS or HH:MM:SS
  SC.formatTime = function(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  // Get all accessible documents strictly scoped to current document to prevent duplicate cross-frame overlays
  SC.getAccessibleDocuments = function() {
    return [document];
  };

  // Get video's bounding rectangle mapped to current viewport (accounting for iframes)
  SC.getVideoBoundingClientRect = function(video) {
    if (!video) return null;
    return video.getBoundingClientRect();
  };

  // Get video strictly local to this document
  SC.getLocalVideo = function() {
    if (SC.state.activeVideo && SC.state.activeVideo.ownerDocument === document && document.contains(SC.state.activeVideo)) {
      return SC.state.activeVideo;
    }
    const videos = document.getElementsByTagName('video');
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      if (!v.paused && !v.ended && v.readyState > 2) {
        SC.state.activeVideo = v;
        return v;
      }
    }
    if (videos.length > 0) {
      SC.state.activeVideo = videos[0];
      return videos[0];
    }
    return null;
  };

  // Find currently active or playing video element strictly in this document
  SC.getActiveVideo = function() {
    return SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
  };

  // Sanitize text
  SC.cleanText = function(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '') // strip any HTML tags
      .replace(/\r\n|\r|\n/g, ' ') // convert inner line breaks to spaces
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Escape HTML characters
  SC.escapeHtml = function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Get full formatted text for a subtitle line across all visible languages
  SC.getLineFullText = function(line) {
    if (!line) return '';
    return SC.state.languages
      .filter(l => l.visible)
      .map(l => {
        if (l.mode === 'track' || l.type === 'source') {
          const trackVal = l.trackId || l.lang || 'auto';
          return (line.trackTexts && line.trackTexts[trackVal]) ? line.trackTexts[trackVal] : line.text;
        }
        return (line.translations && (line.translations[l.id] || line.translations[l.targetLang || l.lang])) || '';
      })
      .filter(Boolean)
      .join(' | ');
  };

  // Broadcast line update to open popup if any
  SC.broadcastLineUpdate = function(line, isNew = false) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: isNew ? 'NEW_LINE' : 'UPDATE_LINE',
          line: line
        }).catch(() => {});
      }
    } catch (_) {}
  };

  // Helper to render loading spinner under font-size (ai_instrs/_.md:48)
  SC.getLoadingSpinnerHtml = function() {
    return '<span class="sc-vol-loading" role="status" aria-label="Загрузка">' +
      '<svg class="sc-loading-spinner" viewBox="0 0 24 24" width="1em" height="1em" fill="none" style="vertical-align:middle;animation:sc-spin 0.8s linear infinite;">' +
        '<circle cx="12" cy="12" r="9" stroke="rgba(255, 255, 255, 0.25)" stroke-width="3"></circle>' +
        '<path d="M12 3 a 9 9 0 0 1 9 9" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"></path>' +
      '</svg>' +
    '</span>';
  };

  SC.loadingTracks = new Set();
  SC.isTrackLoading = function(trackId) {
    if (!trackId || !SC.loadingTracks) return false;
    return SC.loadingTracks.has(trackId);
  };
  SC.setTrackLoading = function(trackId, isLoading) {
    if (!trackId) return;
    if (!SC.loadingTracks) SC.loadingTracks = new Set();
    if (isLoading) SC.loadingTracks.add(trackId);
    else SC.loadingTracks.delete(trackId);
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
  };
})();

