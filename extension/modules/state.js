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
    const match = cleaned.match(/^([a-z]{2,3})/);
    return match ? match[1] : 'auto';
  };

  // Resolve language code from a track identifier (e.g. 'track:ru', 'yt:en', 'track:0', 'auto')
  SC.resolveTrackLang = function(trackId) {
    if (!trackId || trackId === 'auto') {
      const sourceItem = SC.state.languages?.find(l => l.type === 'source');
      if (sourceItem && sourceItem.lang && sourceItem.lang !== 'auto' && sourceItem.lang !== trackId) {
        return SC.resolveTrackLang(sourceItem.lang);
      }
      const video = SC.getActiveVideo();
      if (video && video.textTracks && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const lang = video.textTracks[i].language;
          if (lang && lang.trim()) {
            const norm = SC.normalizeLangCode(lang);
            if (norm !== 'auto') return norm;
          }
        }
      }
      if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) {
        const ytLang = SC.ytCaptionTracks[0].languageCode;
        if (ytLang) {
          const norm = SC.normalizeLangCode(ytLang);
          if (norm !== 'auto') return norm;
        }
      }
      return 'auto';
    }

    if (trackId.startsWith('yt:')) {
      const code = trackId.replace('yt:', '');
      return SC.normalizeLangCode(code);
    }

    if (trackId.startsWith('track:')) {
      const suffix = trackId.replace('track:', '');
      if (/^\d+$/.test(suffix)) {
        const idx = parseInt(suffix, 10);
        const video = SC.getActiveVideo();
        if (video && video.textTracks && video.textTracks[idx]) {
          const trLang = video.textTracks[idx].language;
          if (trLang && trLang.trim()) {
            return SC.normalizeLangCode(trLang);
          }
        }
        return 'auto';
      }
      return SC.normalizeLangCode(suffix);
    }

    return SC.normalizeLangCode(trackId);
  };

  // Suggest a translation target language that is different from the source video language
  SC.getSuggestedTargetLang = function() {
    const detectedSource = SC.resolveTrackLang('auto');
    const existingTransCodes = new Set(
      SC.state.languages
        .filter(l => l.type === 'translation')
        .map(l => l.lang)
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
    widgetVisible: true,
    minimized: false,
    lastAddedText: '',
    lastAddedTime: 0,
    lastVideoTime: -1,
    activeStreamingLineId: null,
    // Multi-subtitles: 1 source and multiple translations/tracks
    languages: [
      { id: 'source', type: 'source', lang: 'auto', label: 'Оригинал', visible: true }
    ],
    translationCache: new Map(),
    overlayPosX: 50, // 0-100% X position (ai_instrs/_.md:24)
    overlayPosY: 90, // 0-100% Y position (ai_instrs/_.md:24)
    currentActiveLine: null,
    overlayFadeTimeout: null,
    activeVideo: null,
    showLanguageTags: false // Default off (ai_instrs/_.md:23)
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

  // Find currently active or playing video element with caching
  SC.getActiveVideo = function() {
    if (SC.state.activeVideo && document.contains(SC.state.activeVideo) && !SC.state.activeVideo.paused) {
      return SC.state.activeVideo;
    }
    const videos = document.getElementsByTagName('video');
    if (!videos.length) return null;
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      if (!v.paused && !v.ended && v.readyState > 2) {
        SC.state.activeVideo = v;
        return v;
      }
    }
    if (SC.state.activeVideo && document.contains(SC.state.activeVideo)) {
      return SC.state.activeVideo;
    }
    SC.state.activeVideo = videos[0];
    return videos[0];
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
        if (l.type === 'source') return line.text;
        if (l.mode === 'track') return (line.trackTexts && line.trackTexts[l.lang]) ? line.trackTexts[l.lang] : line.text;
        return (line.translations && (line.translations[l.id] || line.translations[l.lang])) || '';
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
})();
