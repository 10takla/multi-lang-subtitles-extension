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
    { id: 'google', name: 'Google' },
    { id: 'yandex', name: 'Yandex' },
    { id: 'chrome', name: 'Chrome AI' }
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
      const trackItem = SC.state.languages?.find(l => (l.mode === 'track' || l.type === 'source') && (l.trackId || l.lang));
      if (trackItem) {
        const val = trackItem.trackId || trackItem.lang;
        if (val && val !== 'auto' && val !== trackId) {
          return SC.resolveTrackLang(val);
        }
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
    activeVideo: null,
    showLanguageTags: false // Default off (ai_instrs/_.md:26)
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

  // Get all accessible documents including same-origin iframes
  SC.getAccessibleDocuments = function() {
    const docs = [document];
    function collect(rootDoc) {
      try {
        const iframes = rootDoc.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
          try {
            const doc = iframes[i].contentDocument;
            if (doc && !docs.includes(doc)) {
              docs.push(doc);
              collect(doc);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    collect(document);
    return docs;
  };

  // Get video's bounding rectangle mapped to current viewport (accounting for iframes)
  SC.getVideoBoundingClientRect = function(video) {
    if (!video) return null;
    let rect = video.getBoundingClientRect();
    const doc = video.ownerDocument;
    const hostDoc = SC.hostEl?.ownerDocument || document;
    if (doc && doc !== hostDoc) {
      try {
        const win = doc.defaultView;
        let iframe = win?.frameElement;
        if (!iframe && hostDoc) {
          const allIframes = hostDoc.querySelectorAll('iframe');
          for (let i = 0; i < allIframes.length; i++) {
            try {
              if (allIframes[i].contentDocument === doc) {
                iframe = allIframes[i];
                break;
              }
            } catch (_) {}
          }
        }
        if (iframe) {
          const ifRect = iframe.getBoundingClientRect();
          rect = {
            top: ifRect.top + rect.top,
            bottom: ifRect.top + rect.bottom,
            left: ifRect.left + rect.left,
            right: ifRect.left + rect.right,
            width: rect.width,
            height: rect.height,
            x: ifRect.left + rect.left,
            y: ifRect.top + rect.top
          };
        }
      } catch (_) {}
    }
    return rect;
  };

  // Find currently active or playing video element with caching across accessible documents
  SC.getActiveVideo = function() {
    if (SC.state.activeVideo) {
      const doc = SC.state.activeVideo.ownerDocument || document;
      if (doc.contains(SC.state.activeVideo)) {
        return SC.state.activeVideo;
      }
    }
    const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
    const allVideos = [];
    for (const doc of docs) {
      try {
        const videos = doc.getElementsByTagName('video');
        for (let i = 0; i < videos.length; i++) {
          allVideos.push(videos[i]);
        }
      } catch (_) {}
    }
    if (!allVideos.length) return null;
    for (let i = 0; i < allVideos.length; i++) {
      const v = allVideos[i];
      if (!v.paused && !v.ended && v.readyState > 2) {
        SC.state.activeVideo = v;
        return v;
      }
    }
    SC.state.activeVideo = allVideos[0];
    return allVideos[0];
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
})();

;
/**
 * Video Subtitles Capturer - Translation Module
 * Handles translation via Google Translate (client=gtx) and background service worker.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  const inFlightRequests = new Map();

  // Translate text via background script or client APIs with engine support (Google, Yandex, Chrome)
  SC.fetchTranslation = async function(text, targetLang, sourceLang = 'auto', engine = 'google') {
    if (!text || !targetLang) return null;
    const cleanSourceText = SC.cleanText(text);
    if (!cleanSourceText) return null;

    const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
    const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;

    if (normSourceLang !== 'auto' && normTargetLang !== 'auto' && normSourceLang === normTargetLang) {
      return cleanSourceText;
    }

    const currentEngine = engine || 'google';
    const cacheKey = `${currentEngine}_${normSourceLang}_${normTargetLang}_${cleanSourceText}`;
    if (SC.state.translationCache.has(cacheKey)) {
      return SC.state.translationCache.get(cacheKey);
    }
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    // Chrome Built-in Translator (Local on-device API)
    if (currentEngine === 'chrome') {
      const promise = (async () => {
        try {
          if (typeof window.translation !== 'undefined' && window.translation.createTranslator) {
            const translator = await window.translation.createTranslator({
              sourceLanguage: normSourceLang === 'auto' ? 'en' : normSourceLang,
              targetLanguage: normTargetLang
            });
            const res = await translator.translate(cleanSourceText);
            if (res && (res !== cleanSourceText || normSourceLang === normTargetLang)) {
              SC.state.translationCache.set(cacheKey, res.trim());
              return res.trim();
            }
          } else if (typeof window.ai !== 'undefined' && window.ai.translator?.create) {
            const translator = await window.ai.translator.create({
              sourceLanguage: normSourceLang === 'auto' ? 'en' : normSourceLang,
              targetLanguage: normTargetLang
            });
            const res = await translator.translate(cleanSourceText);
            if (res && (res !== cleanSourceText || normSourceLang === normTargetLang)) {
              SC.state.translationCache.set(cacheKey, res.trim());
              return res.trim();
            }
          }
        } catch (err) {
          console.warn('[Subtitles] Chrome Built-in Translator failed, falling back to Google:', err);
        }
        // Fallback to Google if Chrome AI not available or fails
        return SC.fetchTranslation(cleanSourceText, normTargetLang, normSourceLang, 'google');
      })().finally(() => {
        inFlightRequests.delete(cacheKey);
      });

      inFlightRequests.set(cacheKey, promise);
      return promise;
    }

    const promise = new Promise((resolve) => {
      const doDirectFetch = () => {
        let url;
        if (currentEngine === 'yandex') {
          const langParam = (normSourceLang && normSourceLang !== 'auto') ? `${normSourceLang}-${normTargetLang}` : normTargetLang;
          url = `https://translate.yandex.net/api/v1/tr.json/translate?srv=android&lang=${encodeURIComponent(langParam)}&text=${encodeURIComponent(cleanSourceText)}`;
        } else {
          url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(normSourceLang)}&tl=${encodeURIComponent(normTargetLang)}&dt=t&q=${encodeURIComponent(cleanSourceText)}`;
        }

        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then(d => {
            let res = '';
            if (currentEngine === 'yandex') {
              if (d && Array.isArray(d.text)) {
                res = d.text.join(' ').trim();
              }
            } else if (d && Array.isArray(d[0])) {
              res = d[0].map(c => (c && c[0]) ? c[0] : '').join('').trim();
            }
            if (res && (res !== cleanSourceText || normSourceLang === normTargetLang)) {
              SC.state.translationCache.set(cacheKey, res);
              resolve(res);
            } else {
              resolve(null);
            }
          })
          .catch(() => resolve(null));
      };

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage(
            { type: 'TRANSLATE_TEXT', text: cleanSourceText, targetLang: normTargetLang, sourceLang: normSourceLang, engine: currentEngine },
            (response) => {
              if (chrome.runtime.lastError || !response || !response.success || !response.translated) {
                doDirectFetch();
              } else {
                const res = String(response.translated).trim();
                if (res && (res !== cleanSourceText || normSourceLang === normTargetLang)) {
                  SC.state.translationCache.set(cacheKey, res);
                  resolve(res);
                } else {
                  doDirectFetch();
                }
              }
            }
          );
        } catch (_) {
          doDirectFetch();
        }
      } else {
        doDirectFetch();
      }
    }).finally(() => {
      inFlightRequests.delete(cacheKey);
    });

    inFlightRequests.set(cacheKey, promise);
    return promise;
  };

  // Prefetch translations for upcoming subtitle cues ahead of time (30-60s buffer)
  // Helper: get first element of sub-list as default source track
  const getSublistDefaultTrack = function() {
    const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
    if (availTracks.length > 0) return availTracks[0].value;
    const firstTrack = SC.state.languages.find(l => (l.mode === 'track' || l.type === 'source') && (l.trackId || l.lang));
    return (firstTrack && (firstTrack.trackId || firstTrack.lang)) || 'auto';
  };

  // Prefetch translations for upcoming subtitle cues ahead of time (using configured bufferSec, default 30s)
  SC.prefetchUpcomingTranslations = function(currentTime = null, bufferSeconds = null) {
    if (!SC.getUpcomingCues) return;

    const translationItems = SC.state.languages.filter(l => (l.mode === 'trans' || l.type === 'translation') && l.mode !== 'track');
    if (translationItems.length === 0) return;

    const activeVideo = SC.getActiveVideo();
    const t = (currentTime !== null && currentTime !== undefined)
      ? currentTime
      : (activeVideo ? activeVideo.currentTime : 0);

    const defaultSourceTrack = getSublistDefaultTrack();

    translationItems.forEach(item => {
      const targetLang = item.targetLang || item.lang;
      if (!targetLang) return;

      const sourceTrack = (item.sourceTrack && item.sourceTrack !== 'auto')
        ? item.sourceTrack
        : ((item.sourceFrom && item.sourceFrom !== 'auto') ? item.sourceFrom : defaultSourceTrack);
      const sourceLang = SC.resolveTrackLang ? SC.resolveTrackLang(sourceTrack) : 'auto';

      if (sourceLang !== 'auto' && targetLang !== 'auto' && sourceLang === targetLang) {
        return;
      }

      const effectiveBuffer = (item.bufferSec !== undefined && item.bufferSec !== null)
        ? Math.max(1, Number(item.bufferSec))
        : (bufferSeconds || 30);

      const upcomingCues = SC.getUpcomingCues(t, effectiveBuffer, sourceTrack);
      if (!upcomingCues || upcomingCues.length === 0) return;

      const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
      const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;
      const engine = item.engine || 'google';

      // Filter cues that need fetching and sort by start time ascending
      const needed = [];
      for (let i = 0; i < upcomingCues.length; i++) {
        const cue = upcomingCues[i];
        const sourceText = SC.cleanText(cue.text);
        if (!sourceText) continue;
        const cacheKey = `${engine}_${normSourceLang}_${normTargetLang}_${sourceText}`;
        if (!SC.state.translationCache.has(cacheKey) && !inFlightRequests.has(cacheKey)) {
          needed.push({ cue, text: sourceText, key: cacheKey });
        }
      }

      if (needed.length === 0) return;

      // Sort so the immediate upcoming cues are fetched first
      needed.sort((a, b) => a.cue.start - b.cue.start);

      // Fetch up to 30 nearest upcoming cues (covering full buffer)
      const batch = needed.slice(0, 30);
      for (let i = 0; i < batch.length; i++) {
        SC.fetchTranslation(batch[i].text, normTargetLang, normSourceLang, engine);
      }
    });
  };

  // Re-translate lines for a specific language configuration item
  SC.retranslateItem = function(item) {
    if (!item || item.mode === 'track') return;
    const defaultSourceTrack = getSublistDefaultTrack();
    const sourceTrack = (item.sourceTrack && item.sourceTrack !== 'auto')
      ? item.sourceTrack
      : ((item.sourceFrom && item.sourceFrom !== 'auto') ? item.sourceFrom : defaultSourceTrack);
    const sourceLang = SC.resolveTrackLang ? SC.resolveTrackLang(sourceTrack) : 'auto';
    const targetLang = item.targetLang || item.lang;
    if (!targetLang) return;

    const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
    const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;
    const engine = item.engine || 'google';

    SC.state.lines.forEach(l => {
      let sourceText = l.text;
      if (sourceTrack && sourceTrack !== 'auto' && l.trackTexts && l.trackTexts[sourceTrack]) {
        sourceText = l.trackTexts[sourceTrack];
      }
      sourceText = SC.cleanText(sourceText);
      if (!sourceText) return;

      if (!l.translations) l.translations = {};

      if (normSourceLang !== 'auto' && normTargetLang !== 'auto' && normSourceLang === normTargetLang) {
        l.translations[item.id] = sourceText;
        l.translations[normTargetLang] = sourceText;
        if (SC.updateTranslationInDOM) {
          SC.updateTranslationInDOM(l.id, item.id, sourceText);
        }
        return;
      }

      const cacheKey = `${engine}_${normSourceLang}_${normTargetLang}_${sourceText}`;
      if (SC.state.translationCache.has(cacheKey)) {
        const trans = SC.state.translationCache.get(cacheKey);
        l.translations[item.id] = trans;
        l.translations[normTargetLang] = trans;
        if (SC.updateTranslationInDOM) {
          SC.updateTranslationInDOM(l.id, item.id, trans);
        }
      } else {
        SC.fetchTranslation(sourceText, normTargetLang, normSourceLang, engine).then(trans => {
          if (trans && (trans !== sourceText || normSourceLang === normTargetLang)) {
            l.translations[item.id] = trans;
            l.translations[normTargetLang] = trans;
            if (SC.updateTranslationInDOM) {
              SC.updateTranslationInDOM(l.id, item.id, trans);
            }
            if (SC.updateVideoOverlayContent && SC.state.currentActiveLine && SC.state.currentActiveLine.id === l.id) {
              SC.updateVideoOverlayContent();
            }
          }
        });
      }
    });
  };

  // Translate a single subtitle line for all active translation items
  SC.translateLine = function(line) {
    if (!line || !line.text) return;
    if (!line.translations) line.translations = {};

    const defaultSourceTrack = getSublistDefaultTrack();

    SC.state.languages.forEach(langItem => {
      if ((langItem.mode === 'trans' || langItem.type === 'translation') && langItem.mode !== 'track') {
        const langCode = langItem.targetLang || langItem.lang;
        if (!langCode) return;

        const sourceTrack = (langItem.sourceTrack && langItem.sourceTrack !== 'auto')
          ? langItem.sourceTrack
          : ((langItem.sourceFrom && langItem.sourceFrom !== 'auto') ? langItem.sourceFrom : defaultSourceTrack);

        const sourceLang = SC.resolveTrackLang ? SC.resolveTrackLang(sourceTrack) : 'auto';

        let sourceText = line.text;
        if (sourceTrack && sourceTrack !== 'auto' && line.trackTexts && line.trackTexts[sourceTrack]) {
          sourceText = line.trackTexts[sourceTrack];
        }
        sourceText = SC.cleanText(sourceText);
        if (!sourceText) return;

        const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
        const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(langCode) : langCode;
        const engine = langItem.engine || 'google';

        if (normSourceLang !== 'auto' && normTargetLang !== 'auto' && normSourceLang === normTargetLang) {
          line.translations[langItem.id] = sourceText;
          line.translations[normTargetLang] = sourceText;
          return;
        }

        if (!line.translations[langItem.id]) {
          const cacheKey = `${engine}_${normSourceLang}_${normTargetLang}_${sourceText}`;
          if (SC.state.translationCache.has(cacheKey)) {
            const cached = SC.state.translationCache.get(cacheKey);
            line.translations[langItem.id] = cached;
            line.translations[normTargetLang] = cached;
          } else {
            SC.fetchTranslation(sourceText, normTargetLang, normSourceLang, engine).then(trans => {
              if (trans && (trans !== sourceText || normSourceLang === normTargetLang)) {
                line.translations[langItem.id] = trans;
                line.translations[normTargetLang] = trans;
                if (SC.updateTranslationInDOM) {
                  SC.updateTranslationInDOM(line.id, langItem.id, trans);
                }
                if (SC.updateVideoOverlayContent && SC.state.currentActiveLine && SC.state.currentActiveLine.id === line.id) {
                  SC.updateVideoOverlayContent();
                }
              }
            });
          }
        }
      }
    });
  };
})();

;
/**
 * Video Subtitles Capturer - YouTube Module
 * Isolated subtitle extraction via YouTube player response and TimedText API (JSON3/XML).
 * Operates without modifying player settings, toggling CC, or relying on DOM captions.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.ytCaptionTracks = [];
  SC.ytActiveCues = [];
  SC.ytTrackCues = new Map();

  let ytBridgeInjected = false;
  let lastYtFetchTime = 0;

  SC.isYouTubePage = function() {
    return location.hostname.includes('youtube.com');
  };

  /**
   * Injects bridge script into page (MAIN world) to retrieve captionTracks
   * from YouTube player response without touching UI or player state.
   */
  SC.initYouTubeBridge = function() {
    if (!SC.isYouTubePage() || ytBridgeInjected) return;
    ytBridgeInjected = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.type !== '__SC_YT_TRACKS__') return;
      const tracks = event.data.tracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        SC.ytCaptionTracks = tracks;
        const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }
        if (SC.renderLanguageList) {
          SC.renderLanguageList();
        }

        // Auto-load primary track timedtext if not loaded yet
        const primaryTrack = tracks[0];
        const primaryTrackId = `yt:${primaryTrack.languageCode || 0}`;
        if (!SC.ytTrackCues.has(primaryTrackId)) {
          SC.loadYouTubeTimedText(primaryTrack, primaryTrackId);
        }
      }
    });

    try {
      const script = document.createElement('script');
      script.textContent = `
        (() => {
          function getTracks() {
            try {
              // 1. Movie player response
              const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (player && typeof player.getPlayerResponse === 'function') {
                const resp = player.getPlayerResponse();
                const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(tracks) && tracks.length > 0) return tracks;
              }

              // 2. Window initial player response
              const initTracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
              if (Array.isArray(initTracks) && initTracks.length > 0) return initTracks;

              // 3. Player options tracklist API
              if (player && typeof player.getOption === 'function') {
                const optTracks = player.getOption('captions', 'tracklist');
                if (Array.isArray(optTracks) && optTracks.length > 0) {
                  return optTracks.map(t => ({
                    languageCode: t.languageCode || t.vssId?.replace('.', '') || 'auto',
                    name: { simpleText: t.displayName || t.languageName || t.name || t.languageCode },
                    baseUrl: t.baseUrl || t.url
                  })).filter(t => t.baseUrl);
                }
              }

              // 4. Raw player response config args
              if (window.ytplayer?.config?.args?.raw_player_response) {
                let raw = window.ytplayer.config.args.raw_player_response;
                if (typeof raw === 'string') {
                  try { raw = JSON.parse(raw); } catch (_) {}
                }
                const rawTracks = raw?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(rawTracks) && rawTracks.length > 0) return rawTracks;
              }

              // 5. Watch flexy element player data
              const flexy = document.querySelector('ytd-watch-flexy');
              if (flexy && flexy.playerData) {
                const flexyTracks = flexy.playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(flexyTracks) && flexyTracks.length > 0) return flexyTracks;
              }
            } catch (_) {}
            return null;
          }

          let pollTimer = null;
          function pollForTracks(maxAttempts = 30) {
            if (pollTimer) clearInterval(pollTimer);
            let attempts = 0;
            pollTimer = setInterval(() => {
              attempts++;
              const tracks = getTracks();
              if (tracks && tracks.length > 0) {
                clearInterval(pollTimer);
                pollTimer = null;
                window.postMessage({ type: '__SC_YT_TRACKS__', tracks: JSON.parse(JSON.stringify(tracks)) }, '*');
              } else if (attempts >= maxAttempts) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
            }, 500);
          }

          function broadcast() {
            const tracks = getTracks();
            if (tracks && tracks.length > 0) {
              window.postMessage({ type: '__SC_YT_TRACKS__', tracks: JSON.parse(JSON.stringify(tracks)) }, '*');
            } else {
              pollForTracks(15);
            }
          }

          window.addEventListener('message', (e) => {
            if (e.data && e.data.type === '__SC_REQ_YT_TRACKS__') broadcast();
          });
          document.addEventListener('yt-navigate-finish', () => setTimeout(broadcast, 300));
          document.addEventListener('yt-page-data-updated', () => setTimeout(broadcast, 300));

          pollForTracks(30);
          broadcast();
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (_) {}
  };

  /**
   * Directly extracts captionTracks from YouTube's static page scripts (DOM).
   * Operates safely within content script context without CSP violations.
   */
  SC.extractYouTubeTracksFromDOM = function() {
    if (!SC.isYouTubePage()) return [];
    if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    try {
      const scripts = document.scripts;
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent;
        if (!text || !text.includes('captionTracks')) continue;

        const idx = text.indexOf('"captionTracks":');
        if (idx !== -1) {
          const start = text.indexOf('[', idx);
          if (start !== -1) {
            let depth = 0;
            let end = -1;
            for (let j = start; j < text.length; j++) {
              if (text[j] === '[') depth++;
              else if (text[j] === ']') {
                depth--;
                if (depth === 0) {
                  end = j + 1;
                  break;
                }
              }
            }
            if (end !== -1) {
              const jsonStr = text.slice(start, end);
              try {
                const parsed = JSON.parse(jsonStr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  SC.ytCaptionTracks = parsed;
                  return parsed;
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
    return [];
  };

  /**
   * Request caption tracks from DOM scripts or bridge, or return cached list.
   */
  SC.fetchYouTubeCaptionTracks = function() {
    if (!SC.isYouTubePage()) return [];
    if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    // 1. Direct extraction from static DOM scripts
    const extracted = SC.extractYouTubeTracksFromDOM();
    if (extracted && extracted.length > 0) {
      SC.ytCaptionTracks = extracted;
      const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
      if (activeVideo && SC.registerVideoWithSubtitles) {
        SC.registerVideoWithSubtitles(activeVideo);
      }
      return extracted;
    }

    // 2. Fallback to bridge
    SC.initYouTubeBridge();

    const now = Date.now();
    if (now - lastYtFetchTime >= 1000) {
      lastYtFetchTime = now;
      try {
        window.postMessage({ type: '__SC_REQ_YT_TRACKS__' }, '*');
      } catch (_) {}
    }

    return SC.ytCaptionTracks || [];
  };

  // Handle YouTube SPA in-page video switches
  const handleYtNav = () => {
    SC.ytCaptionTracks = [];
    SC.ytActiveCues = [];
    SC.ytTrackCues.clear();
    setTimeout(() => {
      SC.fetchYouTubeCaptionTracks();
      const video = document.querySelector('video');
      if (video && SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(video)) {
        SC.registerVideoWithSubtitles(video);
      }
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
    }, 400);
  };
  document.addEventListener('yt-navigate-finish', handleYtNav);
  document.addEventListener('yt-page-data-updated', handleYtNav);

  /**
   * Fetch complete timedtext track via direct JSON3 or XML request.
   * Parses all cue events for the entire video timeline.
   */
  SC.loadYouTubeTimedText = async function(track, trackId = null) {
    if (!track || !track.baseUrl) return;
    const tId = trackId || `yt:${track.languageCode || ''}`;

    try {
      let fetchUrl = track.baseUrl;
      try {
        const u = new URL(fetchUrl);
        u.searchParams.set('fmt', 'json3');
        fetchUrl = u.toString();
      } catch (_) {
        if (fetchUrl.includes('fmt=')) {
          fetchUrl = fetchUrl.replace(/fmt=[^&]+/, 'fmt=json3');
        } else {
          fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fmt=json3';
        }
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) {
        console.warn('Timed text request failed with status:', res.status);
        return;
      }

      const rawBody = await res.text();
      let cues = [];

      // Try JSON3 parsing first
      try {
        const data = JSON.parse(rawBody);
        if (data && Array.isArray(data.events)) {
          cues = data.events
            .filter(e => e.segs && e.segs.length > 0)
            .map(e => ({
              start: (e.tStartMs || 0) / 1000,
              end: ((e.tStartMs || 0) + (e.dDurationMs || 0)) / 1000,
              text: SC.cleanText ? SC.cleanText(e.segs.map(s => s.utf8 || '').join('')) : e.segs.map(s => s.utf8 || '').join('').trim()
            }))
            .filter(c => c.text && c.text.length > 0);
        }
      } catch (_) {
        // XML parsing fallback (srv1 / srv3 transcript XML)
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(rawBody, 'text/xml');
          const textNodes = xmlDoc.querySelectorAll('text');
          if (textNodes && textNodes.length > 0) {
            textNodes.forEach(node => {
              const start = parseFloat(node.getAttribute('start') || '0');
              const dur = parseFloat(node.getAttribute('dur') || '0');
              const clean = SC.cleanText ? SC.cleanText(node.textContent || '') : (node.textContent || '').trim();
              if (clean) {
                cues.push({ start, end: start + dur, text: clean });
              }
            });
          }
        } catch (_) {}
      }

      if (cues && cues.length > 0) {
        SC.ytTrackCues.set(tId, cues);

        const firstTrack = SC.state && SC.state.languages ? SC.state.languages.find(l => (l.mode === 'track' || l.type === 'source') && (l.trackId || l.lang)) : null;
        const firstTrackId = (firstTrack && (firstTrack.trackId || firstTrack.lang)) || 'auto';
        if (firstTrackId === tId || firstTrackId === 'auto' || !SC.ytActiveCues || SC.ytActiveCues.length === 0) {
          SC.ytActiveCues = cues;
        }

        const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }

        if (SC.state && SC.state.lines) {
          SC.state.lines.forEach(l => {
            if (!l.trackTexts) l.trackTexts = {};
            if (!l.trackTexts[tId]) {
              const match = cues.find(c => l.rawTime >= c.start && l.rawTime <= c.end);
              if (match) l.trackTexts[tId] = match.text;
            }
          });
        }

        if (SC.state && SC.state.languages) {
          SC.state.languages.forEach(item => {
            if (item.sourceFrom === tId && SC.retranslateItem) {
              SC.retranslateItem(item);
            }
          });
        }

        if (SC.renderAllLines) {
          SC.renderAllLines();
        }

        // Prefetch translations 30-60 seconds ahead
        if (SC.prefetchUpcomingTranslations) {
          const v = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
          SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
        }
      }
    } catch (err) {
      console.warn('Timed text load error:', err);
    }
  };

  /**
   * Get subtitle text for a given YouTube track at a specific timestamp.
   */
  SC.getYouTubeTrackTextAtTime = function(trackId, time) {
    const cues = SC.ytTrackCues.get(trackId);
    if (cues && cues.length > 0) {
      const match = cues.find(c => time >= c.start - 0.05 && time <= c.end + 0.05);
      if (match && match.text) {
        const cleaned = SC.cleanText ? SC.cleanText(match.text) : match.text.trim();
        return cleaned || null;
      }
    }
    return null;
  };

  /**
   * Get active cue at current playback time.
   */
  SC.getYouTubeActiveCueAtTime = function(time) {
    if (!SC.ytActiveCues || SC.ytActiveCues.length === 0) return null;
    const match = SC.ytActiveCues.find(c => time >= c.start && time <= c.end);
    if (match && match.text && match.text.trim()) {
      return { text: match.text.trim(), start: match.start, end: match.end };
    }
    return null;
  };

  /**
   * Collect upcoming YouTube cues within bufferSeconds ahead of currentTime for prefetching.
   */
  SC.getUpcomingYouTubeCues = function(currentTime, bufferSeconds = 60, targetTrackId = null) {
    const maxTime = currentTime + bufferSeconds;
    const list = [];
    const seen = new Set();

    let cues = null;
    if (targetTrackId && targetTrackId.startsWith('yt:')) {
      cues = SC.ytTrackCues.get(targetTrackId);
    } else if (SC.ytActiveCues && SC.ytActiveCues.length > 0 && (!targetTrackId || targetTrackId === 'auto')) {
      cues = SC.ytActiveCues;
    }

    if (cues && cues.length > 0) {
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.end >= currentTime && c.start <= maxTime) {
          const raw = SC.cleanText ? SC.cleanText(c.text) : c.text.trim();
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            list.push({ start: c.start, end: c.end, text: raw });
          }
        }
      }
    }

    return list;
  };
})();

;
/**
 * Video Subtitles Capturer - HTML5 Capturer Module
 * Captures subtitles from native HTML5 <video> textTracks and <track> elements (WebVTT).
 * Operates in 'hidden' mode without altering native player display or user settings.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.hookedTracks = new WeakSet();

  /**
   * Ensures the text track is in 'hidden' mode rather than 'disabled'
   * so cue events fire and cues remain accessible without native rendering.
   */
  SC.ensureHiddenMode = function(tr) {
    if (tr && tr.mode === 'disabled') {
      try { tr.mode = 'hidden'; } catch (_) {}
    }
  };

  /**
   * Returns list of available tracks from the native HTMLMediaElement.textTracks.
   */
  SC.getHTML5AvailableTracks = function(video) {
    const tracks = [];
    if (!video || !video.textTracks || video.textTracks.length === 0) return tracks;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      tracks.push({
        value: `track:${tr.language || i}`,
        label: `[Видео] ${tr.label || tr.language || 'Трек ' + (i + 1)}`
      });
    }
    return tracks;
  };

  /**
   * Retrieves text from HTML5 track at a given timestamp.
   */
  SC.getHTML5TrackTextAtTime = function(trackId, time, video) {
    if (!video || !video.textTracks || !trackId || !trackId.startsWith('track:')) return null;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      const val = `track:${tr.language || i}`;
      if (val === trackId && tr.cues) {
        for (let j = 0; j < tr.cues.length; j++) {
          const c = tr.cues[j];
          if (time >= c.startTime - 0.05 && time <= c.endTime + 0.05) {
            const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
            return SC.cleanText(raw);
          }
        }
      }
    }
    return null;
  };

  /**
   * Collects upcoming cues from HTML5 textTracks for timeline prefetching.
   */
  SC.getUpcomingHTML5Cues = function(video, t, maxTime, targetTrackId = null) {
    const list = [];
    if (!video || !video.textTracks || video.textTracks.length === 0) return list;

    const seen = new Set();
    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      const val = `track:${tr.language || i}`;
      if (targetTrackId && targetTrackId !== 'auto' && targetTrackId !== val) {
        continue;
      }

      if (tr.cues) {
        for (let j = 0; j < tr.cues.length; j++) {
          const c = tr.cues[j];
          if (c.endTime >= t && c.startTime <= maxTime) {
            const raw = SC.cleanText(c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : ''));
            if (raw && !seen.has(raw)) {
              seen.add(raw);
              list.push({
                start: c.startTime,
                end: c.endTime,
                text: raw
              });
            }
          }
        }
      }
    }
    return list;
  };

  /**
   * Checks for an active HTML5 cue at playback time t.
   */
  SC.getHTML5ActiveCueAtTime = function(video, t, primaryTrackVal = null) {
    if (!video || !video.textTracks || video.textTracks.length === 0) return null;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      SC.ensureHiddenMode(tr);

      const trackVal = `track:${tr.language || i}`;
      if (primaryTrackVal && primaryTrackVal !== 'auto' && primaryTrackVal !== trackVal) {
        continue;
      }

      // Fast path: check native activeCues first
      if (tr.activeCues && tr.activeCues.length > 0) {
        const c = tr.activeCues[0];
        const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
        const clean = SC.cleanText ? SC.cleanText(raw) : (raw || '').trim();
        if (clean) {
          return { text: clean, start: c.startTime };
        }
      }

      // Fallback path: search tr.cues
      if (tr.cues && tr.cues.length > 0) {
        for (let j = 0; j < tr.cues.length; j++) {
          const c = tr.cues[j];
          if (t >= c.startTime && t <= c.endTime) {
            const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
            const clean = SC.cleanText ? SC.cleanText(raw) : (raw || '').trim();
            if (clean) {
              return { text: clean, start: c.startTime };
            }
          }
        }
      }
    }
    return null;
  };

  /**
   * Hooks a single HTML5 TextTrack instance and listens for cue changes.
   */
  SC.hookTrack = function(video, track) {
    if (!track || SC.hookedTracks.has(track)) return;
    SC.hookedTracks.add(track);

    if (video && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(video);
    }

    SC.ensureHiddenMode(track);

    const handleCueChange = () => {
      const primarySelector = SC.state && SC.state.languages
        ? (SC.state.languages.find(l => l.visible && (l.mode === 'track' || l.type === 'source')) || SC.state.languages[0])
        : null;
      const primaryTrackVal = primarySelector ? (primarySelector.trackId || primarySelector.sourceTrack || primarySelector.lang || 'auto') : 'auto';
      const trackVal = `track:${track.language || 0}`;
      if (primaryTrackVal !== 'auto' && primaryTrackVal !== trackVal) {
        return;
      }

      if (track.activeCues && track.activeCues.length > 0) {
        for (let i = 0; i < track.activeCues.length; i++) {
          const cue = track.activeCues[i];
          const raw = cue.text || (cue.getCueAsHTML ? cue.getCueAsHTML().textContent : '');
          if (!raw) continue;
          if (SC.addSubtitleLine) SC.addSubtitleLine(raw, video.currentTime);
        }
      }
    };

    track.addEventListener('cuechange', handleCueChange);
    handleCueChange();

    if (SC.prefetchUpcomingTranslations) {
      SC.prefetchUpcomingTranslations(video.currentTime, 60);
    }
  };

  /**
   * Hooks all current and future textTracks for a given video element.
   */
  SC.hookHTML5Tracks = function(video) {
    if (!video || !video.textTracks) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      SC.ensureHiddenMode(tr);
      SC.hookTrack(video, tr);
    }

    video.textTracks.addEventListener('addtrack', (e) => {
      if (e.track) {
        SC.ensureHiddenMode(e.track);
        SC.hookTrack(video, e.track);
      }
    });

    video.textTracks.addEventListener('change', () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        SC.ensureHiddenMode(tr);
        SC.hookTrack(video, tr);
      }
    });

    // Observe dynamic <track> elements added into <video>
    const trackObserver = new MutationObserver(() => {
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          SC.ensureHiddenMode(tr);
          SC.hookTrack(video, tr);
        }
      }
    });
    trackObserver.observe(video, { childList: true });
  };
})();

;
/**
 * Video Subtitles Capturer - Custom Players Module
 * Captures subtitles from embedded configs and custom web players (Playerjs, JW Player, etc.)
 * Parses external WebVTT and SRT subtitle files and maintains active cues buffer.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.customCaptionTracks = [];
  SC.customActiveCues = [];
  SC.customTrackCues = new Map();

  let lastScriptScanCount = 0;

  /**
   * Helper to convert time strings (00:00:00.000 or 00:00:00,000) to seconds.
   */
  function timeStringToSeconds(str) {
    if (!str) return 0;
    const normalized = str.trim().replace(',', '.');
    const parts = normalized.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return 0;
  }

  /**
   * Parses WebVTT or SRT subtitle text into cue objects { start, end, text }.
   */
  SC.parseVttCues = function(text) {
    if (!text || typeof text !== 'string') return [];
    const cues = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let currentStart = null;
    let currentEnd = null;
    let currentTexts = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const times = line.split('-->');
        currentStart = timeStringToSeconds(times[0]);
        const endStr = times[1].trim().split(/\s+/)[0];
        currentEnd = timeStringToSeconds(endStr);
        currentTexts = [];
      } else if (currentStart !== null && line) {
        if (line.startsWith('NOTE') || line.startsWith('WEBVTT') || /^\d+$/.test(line)) continue;
        currentTexts.push(line);
      } else if (currentStart !== null && !line) {
        if (currentTexts.length > 0) {
          const cueText = SC.cleanText ? SC.cleanText(currentTexts.join(' ')) : currentTexts.join(' ').trim();
          if (cueText) {
            cues.push({ start: currentStart, end: currentEnd, text: cueText });
          }
        }
        currentStart = null;
        currentEnd = null;
        currentTexts = [];
      }
    }

    if (currentStart !== null && currentTexts.length > 0) {
      const cueText = SC.cleanText ? SC.cleanText(currentTexts.join(' ')) : currentTexts.join(' ').trim();
      if (cueText) {
        cues.push({ start: currentStart, end: currentEnd, text: cueText });
      }
    }
    return cues;
  };

  /**
   * Downloads and parses a subtitle file (.vtt or .srt) by URL.
   */
  SC.loadCustomSubtitleUrl = async function(url, trackId, label = 'Субтитры') {
    if (!url || SC.customTrackCues.has(trackId)) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();
      const cues = SC.parseVttCues(text);
      if (cues && cues.length > 0) {
        SC.customTrackCues.set(trackId, cues);
        if (!SC.customActiveCues || SC.customActiveCues.length === 0) {
          SC.customActiveCues = cues;
        }
        const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
        docs.forEach(doc => {
          try {
            const videos = doc.querySelectorAll('video');
            videos.forEach(v => {
              if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(v);
            });
          } catch (_) {}
        });
        if (SC.renderLanguageList) SC.renderLanguageList();
        if (SC.prefetchUpcomingTranslations) {
          const vTime = (SC.getActiveVideo ? SC.getActiveVideo()?.currentTime : null) || 0;
          SC.prefetchUpcomingTranslations(vTime, 60);
        }
      }
    } catch (_) {}
  };

  /**
   * Scans page scripts, config objects, and <track> elements for custom subtitle files.
   */
  /**
   * Scans page scripts, config objects, and <track> elements for custom subtitle files.
   */
  SC.scanPageForSubtitleTracks = function() {
    const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
    let foundNew = false;

    docs.forEach((doc, docIdx) => {
      try {
        const scripts = doc.querySelectorAll('script');
        scripts.forEach((s, idx) => {
          const content = s.textContent || '';
          if (!content || (!content.includes('subtitle') && !content.includes('.vtt') && !content.includes('.srt') && !content.includes('cc:') && !/["']?cc["']?\s*:/i.test(content))) return;

          // 1. Match Playerjs / standard: subtitle[s]: "..."
          const matches = content.matchAll(/subtitle[s]?\s*:\s*['"]([^'"]+)['"]/gi);
          for (const m of matches) {
            const raw = m[1];
            const parts = raw.split(',');
            parts.forEach((p, pIdx) => {
              let label = 'Субтитры';
              let url = p.trim();
              const titleMatch = p.match(/\[(.*?)\](.*)/);
              if (titleMatch) {
                label = titleMatch[1].trim();
                url = titleMatch[2].trim();
              }
              if (url && (url.includes('.vtt') || url.includes('.srt') || url.startsWith('http') || url.startsWith('/'))) {
                const trackId = `custom:${docIdx}_${idx}_${pIdx}`;
                if (!SC.customCaptionTracks.some(t => t.url === url)) {
                  SC.customCaptionTracks.push({ id: trackId, label, url });
                  SC.loadCustomSubtitleUrl(url, trackId, label);
                  foundNew = true;
                }
              }
            });
          }

          // 2. Match source: { cc: [...] } or cc: [ { url: "...", name: "..." } ] (Lordfilm player 1, southpark4u, etc.)
          const ccMatches = content.matchAll(/(?:['"]cc['"]|\bcc)\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/gi);
          for (const m of ccMatches) {
            try {
              const rawArr = m[1];
              let parsed = null;
              try {
                parsed = JSON.parse(rawArr);
              } catch (_) {}

              let cIdx = 0;
              if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach(item => {
                  const url = item.url || item.src;
                  const name = item.name || item.title || item.label || 'Субтитры';
                  if (url && !SC.customCaptionTracks.some(t => t.url === url)) {
                    const trackId = `custom:cc_${docIdx}_${idx}_${cIdx++}`;
                    SC.customCaptionTracks.push({ id: trackId, label: name, url });
                    SC.loadCustomSubtitleUrl(url, trackId, name);
                    foundNew = true;
                  }
                });
              } else {
                const itemRegex = /\{[^{}]*?['"]?url['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?['"]?(?:name|title|label)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?\}|\{[^{}]*?['"]?(?:name|title|label)['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?['"]?url['"]?\s*:\s*['"]([^'"]+)['"][^{}]*?\}/gi;
                let itemMatch;
                while ((itemMatch = itemRegex.exec(rawArr)) !== null) {
                  const url = itemMatch[1] || itemMatch[4];
                  const name = itemMatch[2] || itemMatch[3] || 'Субтитры';
                  if (url && !SC.customCaptionTracks.some(t => t.url === url)) {
                    const trackId = `custom:cc_${docIdx}_${idx}_${cIdx++}`;
                    SC.customCaptionTracks.push({ id: trackId, label: name, url });
                    SC.loadCustomSubtitleUrl(url, trackId, name);
                    foundNew = true;
                  }
                }
              }
            } catch (_) {}
          }

          // 3. Generic VTT / SRT URLs in script configs
          const vttMatches = content.matchAll(/['"](https?:\/\/[^'"]+?\.(?:vtt|srt)(?:\?[^'"]*)?)['"]/gi);
          let vIdx = 0;
          for (const vm of vttMatches) {
            const url = vm[1];
            if (url && !SC.customCaptionTracks.some(t => t.url === url)) {
              const trackId = `custom:vtt_${docIdx}_${idx}_${vIdx++}`;
              SC.customCaptionTracks.push({ id: trackId, label: 'Субтитры', url });
              SC.loadCustomSubtitleUrl(url, trackId, 'Субтитры');
              foundNew = true;
            }
          }
        });

        // 4. Scan <track> elements
        const tracks = doc.querySelectorAll('track');
        tracks.forEach((tr, idx) => {
          const src = tr.src || tr.getAttribute('src');
          if (src) {
            const trackId = `custom:track_${docIdx}_${idx}`;
            const label = tr.label || tr.srclang || `Дорожка ${idx + 1}`;
            if (!SC.customCaptionTracks.some(t => t.url === src)) {
              SC.customCaptionTracks.push({ id: trackId, label, url: src });
              SC.loadCustomSubtitleUrl(src, trackId, label);
              foundNew = true;
            }
          }
        });
      } catch (_) {}
    });

    // If custom subtitle tracks were found, register all video elements immediately
    if (SC.customCaptionTracks.length > 0 && SC.registerVideoWithSubtitles) {
      docs.forEach(doc => {
        try {
          const videos = doc.querySelectorAll('video');
          videos.forEach(v => SC.registerVideoWithSubtitles(v));
        } catch (_) {}
      });
    }
  };

  /**
   * Returns list of detected custom player subtitle tracks.
   */
  SC.getCustomAvailableTracks = function() {
    const tracks = [];
    if (SC.customCaptionTracks && SC.customCaptionTracks.length > 0) {
      SC.customCaptionTracks.forEach((cTr, idx) => {
        tracks.push({
          value: cTr.id || `custom:${idx}`,
          label: `[Плеер] ${cTr.label || 'Субтитры ' + (idx + 1)}`
        });
      });
    }
    return tracks;
  };

  /**
   * Retrieves subtitle text from custom track cues at a specific playback timestamp.
   */
  SC.getCustomTrackTextAtTime = function(trackId, time) {
    if (!trackId || !trackId.startsWith('custom:')) return null;
    const cues = SC.customTrackCues.get(trackId);
    if (cues && cues.length > 0) {
      const match = cues.find(c => time >= c.start - 0.05 && time <= c.end + 0.05);
      if (match) return SC.cleanText ? SC.cleanText(match.text) : match.text;
    }
    return null;
  };

  /**
   * Collects upcoming cues from custom player tracks for timeline translation prefetching.
   */
  SC.getUpcomingCustomCues = function(t, maxTime, targetTrackId = null) {
    const list = [];
    const seen = new Set();

    if (targetTrackId && targetTrackId.startsWith('custom:')) {
      const cues = SC.customTrackCues.get(targetTrackId);
      if (cues && cues.length > 0) {
        for (let i = 0; i < cues.length; i++) {
          const c = cues[i];
          if (c.end >= t && c.start <= maxTime) {
            const raw = SC.cleanText ? SC.cleanText(c.text) : c.text;
            if (raw && !seen.has(raw)) {
              seen.add(raw);
              list.push({ start: c.start, end: c.end, text: raw });
            }
          }
        }
      }
    } else if (SC.customActiveCues && SC.customActiveCues.length > 0 && (!targetTrackId || targetTrackId === 'auto')) {
      for (let i = 0; i < SC.customActiveCues.length; i++) {
        const c = SC.customActiveCues[i];
        if (c.end >= t && c.start <= maxTime) {
          const raw = SC.cleanText ? SC.cleanText(c.text) : c.text;
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            list.push({ start: c.start, end: c.end, text: raw });
          }
        }
      }
    }
    return list;
  };

  /**
   * Returns active cue match at timestamp t from custom tracks.
   */
  SC.getCustomActiveCueAtTime = function(t) {
    if (SC.customActiveCues && SC.customActiveCues.length > 0) {
      const match = SC.customActiveCues.find(c => t >= c.start && t <= c.end);
      if (match && match.text && match.text.trim()) {
        return { text: match.text.trim(), start: match.start };
      }
    }
    return null;
  };
})();

;
/**
 * Video Subtitles Capturer - Capturers Module (Orchestrator)
 * Coordinates specialized subtitle extractors (HTML5, Custom/Playerjs, YouTube)
 * and provides video detection, playback synchronization, deduplication, and DOM fallback.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.hookedVideos = new WeakSet();

  /**
   * Retrieves all available video tracks across HTML5, Custom players, and YouTube.
   */
  SC.getAvailableVideoTracks = function() {
    const activeVideo = SC.getActiveVideo();
    const tracks = [];

    // 1. HTML5 tracks
    if (SC.getHTML5AvailableTracks) {
      tracks.push(...SC.getHTML5AvailableTracks(activeVideo));
    }

    // 2. Custom player tracks
    if (SC.getCustomAvailableTracks) {
      tracks.push(...SC.getCustomAvailableTracks());
    }

    // 3. YouTube caption tracks
    if (SC.fetchYouTubeCaptionTracks) {
      const ytTracks = SC.fetchYouTubeCaptionTracks();
      if (ytTracks && ytTracks.length > 0) {
        ytTracks.forEach((ytTr, idx) => {
          const trName = (ytTr.name && (ytTr.name.simpleText || (ytTr.name.runs && ytTr.name.runs[0] && ytTr.name.runs[0].text)))
            || ytTr.languageCode || `Трек ${idx + 1}`;
          tracks.push({
            value: `yt:${ytTr.languageCode || idx}`,
            label: `[YouTube] ${trName}`
          });
        });
      }
    }

    // 4. Tracks from child iframe if any
    if (SC.state && Array.isArray(SC.state.childTracks) && SC.state.childTracks.length > 0) {
      SC.state.childTracks.forEach(ct => {
        if (!tracks.some(t => t.value === ct.value)) {
          tracks.push(ct);
        }
      });
    }

    return tracks;
  };

  /**
   * Retrieves text for a specific track at a given playback timestamp.
   */
  SC.getTrackTextAtTime = function(trackId, time) {
    if (!trackId || trackId === 'auto') return null;

    if (trackId.startsWith('yt:') && SC.getYouTubeTrackTextAtTime) {
      return SC.getYouTubeTrackTextAtTime(trackId, time);
    }
    if (trackId.startsWith('custom:') && SC.getCustomTrackTextAtTime) {
      return SC.getCustomTrackTextAtTime(trackId, time);
    }
    if (trackId.startsWith('track:') && SC.getHTML5TrackTextAtTime) {
      const activeVideo = SC.getActiveVideo();
      return SC.getHTML5TrackTextAtTime(trackId, time, activeVideo);
    }

    return null;
  };

  /**
   * Collects upcoming cues across all capturer sources for timeline translation prefetching.
   */
  SC.getUpcomingCues = function(currentTime = null, bufferSeconds = 60, targetTrackId = null) {
    const activeVideo = SC.getActiveVideo();
    const t = (currentTime !== null && currentTime !== undefined)
      ? currentTime
      : (activeVideo ? activeVideo.currentTime : 0);
    const maxTime = t + bufferSeconds;
    const list = [];
    const seen = new Set();

    // 1. YouTube cues
    if (SC.getUpcomingYouTubeCues) {
      const ytCues = SC.getUpcomingYouTubeCues(t, bufferSeconds, targetTrackId);
      if (ytCues && ytCues.length > 0) {
        ytCues.forEach(c => {
          if (!seen.has(c.text)) {
            seen.add(c.text);
            list.push(c);
          }
        });
      }
    }

    // 2. Custom & Playerjs cues
    if (SC.getUpcomingCustomCues) {
      const customCues = SC.getUpcomingCustomCues(t, maxTime, targetTrackId);
      if (customCues && customCues.length > 0) {
        customCues.forEach(c => {
          if (!seen.has(c.text)) {
            seen.add(c.text);
            list.push(c);
          }
        });
      }
    }

    // 3. HTML5 textTracks cues
    if (SC.getUpcomingHTML5Cues) {
      const html5Cues = SC.getUpcomingHTML5Cues(activeVideo, t, maxTime, targetTrackId);
      if (html5Cues && html5Cues.length > 0) {
        html5Cues.forEach(c => {
          if (!seen.has(c.text)) {
            seen.add(c.text);
            list.push(c);
          }
        });
      }
    }

    return list;
  };

  /**
   * Universal DOM subtitle extractor for all players including YouTube, Playerjs, Video.js, JW, etc.
   */
  SC.getDOMSubtitleText = function() {
    const selectors = [
      '.ytp-caption-segment',
      '.caption-window',
      '[id*="_subtitle"]',
      'pjsdiv[id*="subtitle"]',
      '[class*="playerjs_subtitle"]',
      '.playerjs_subtitle_word',
      '.vjs-text-track-cue',
      '.jw-text-track-cue',
      '.shaka-text-container',
      '.player-timedtext-text-container',
      '.plyr__caption',
      '.dplayer-subtitle',
      '.art-subtitle',
      '.mejs__captions-text',
      '[class*="subtitle-cue"]',
      '[class*="subtitle-line"]',
      '[class*="subtitle-text"]',
      '[class*="caption-text"]',
      '[class*="caption-window"]'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const sel = selectors[i];
      const els = document.querySelectorAll(sel);
      for (let j = 0; j < els.length; j++) {
        const el = els[j];
        if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length < 2) continue;
        if (text.includes('Скорость') || text.includes('Качество') || text.startsWith('Субтитры\n') || text === 'Вкл.' || text === 'Выкл.') {
          continue;
        }
        return text.replace(/\s+/g, ' ');
      }
    }
    return null;
  };

  /**
   * Processes a newly captured subtitle line, performs streaming and deduplication checks,
   * updates state, and dispatches to overlay and background scripts.
   */
  SC.addSubtitleLine = function(rawText, videoTimestamp = null) {
    const text = SC.cleanText(rawText);
    if (!text) return;

    const activeVideo = SC.getActiveVideo();
    if (activeVideo && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(activeVideo);
    }
    const currentVideoTime = videoTimestamp !== null
      ? videoTimestamp
      : (activeVideo ? activeVideo.currentTime : 0);

    const formattedTime = SC.formatTime(currentVideoTime);
    const now = Date.now();

    const lastLine = SC.state.lines.length > 0 ? SC.state.lines[SC.state.lines.length - 1] : null;

    // Check if identical to the last line
    if (lastLine && lastLine.text === text) {
      if ((now - lastLine.timestamp) < 6000 || Math.abs(currentVideoTime - lastLine.rawTime) < 8) {
        lastLine.timestamp = now;
        SC.state.currentActiveLine = lastLine;
        return;
      }
    }

    // Handle streaming / incremental captions
    if (
      lastLine &&
      text.startsWith(lastLine.text) &&
      (now - lastLine.timestamp) < 3000
    ) {
      lastLine.text = text;
      lastLine.translations = {};
      if (!lastLine.trackTexts) lastLine.trackTexts = {};

      SC.state.languages.forEach(item => {
        const neededTrack = (item.mode === 'track' || item.type === 'source')
          ? (item.trackId || item.lang)
          : ((item.sourceTrack && item.sourceTrack !== 'auto') ? item.sourceTrack : item.sourceFrom);
        if (neededTrack && neededTrack !== 'auto') {
          const txt = SC.getTrackTextAtTime(neededTrack, currentVideoTime);
          if (txt) lastLine.trackTexts[neededTrack] = txt;
        }
      });

      SC.state.lastAddedText = text;
      SC.state.lastAddedTime = now;

      if (SC.translateLine) SC.translateLine(lastLine);
      SC.state.currentActiveLine = lastLine;
      if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      SC.broadcastLineUpdate(lastLine, false);
      return;
    }

    // Skip if incoming text is just a prefix of an already recorded full sentence
    if (
      lastLine &&
      lastLine.text.startsWith(text) &&
      (now - lastLine.timestamp) < 3000
    ) {
      return;
    }

    // Create new line entry with multi-language & track texts support
    const newLine = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      text: text,
      videoTime: formattedTime,
      rawTime: currentVideoTime,
      timestamp: now,
      trackTexts: {},
      translations: {}
    };

    SC.state.languages.forEach(item => {
      const neededTrack = (item.mode === 'track' || item.type === 'source')
        ? (item.trackId || item.lang)
        : ((item.sourceTrack && item.sourceTrack !== 'auto') ? item.sourceTrack : item.sourceFrom);
      if (neededTrack && neededTrack !== 'auto') {
        const txt = SC.getTrackTextAtTime(neededTrack, currentVideoTime);
        if (txt) newLine.trackTexts[neededTrack] = txt;
      }
    });

    SC.state.lines.push(newLine);

    // Cap lines list to MAX_LINES
    const maxLines = SC.MAX_LINES || 250;
    if (SC.state.lines.length > maxLines) {
      const removed = SC.state.lines.splice(0, SC.state.lines.length - maxLines);
      if (SC.removeLinesFromDOM) {
        SC.removeLinesFromDOM(removed);
      }
    }
    SC.state.lastAddedText = text;
    SC.state.lastAddedTime = now;
    SC.state.lastVideoTime = currentVideoTime;
    SC.state.activeStreamingLineId = newLine.id;
    SC.state.currentActiveLine = newLine;

    // Trigger translations
    if (SC.translateLine) SC.translateLine(newLine);

    // Render active subtitle on video overlay
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();

    // Auto-fade active on-video overlay after 5 seconds
    if (SC.state.overlayFadeTimeout) clearTimeout(SC.state.overlayFadeTimeout);
    SC.state.overlayFadeTimeout = setTimeout(() => {
      if (SC.state.currentActiveLine === newLine) {
        SC.state.currentActiveLine = null;
        if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      }
    }, 5000);

    // Notify background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SUBTITLE_ADDED', line: newLine }).catch(() => {});
      }
    } catch (_) {}

    SC.broadcastLineUpdate(newLine, true);
  };

  /**
   * Native subtitles suppression no-op (preserves native video subtitle state)
   */
  SC.suppressNativeSubtitles = function() {};

  /**
   * Comprehensive checker to determine if subtitles are available for a given video.
   */
  SC.checkVideoHasSubtitles = function(video) {
    if (!video) return false;

    // 1. Native HTML5 textTracks or <track> elements
    if (video.textTracks && video.textTracks.length > 0) return true;
    if (video.querySelectorAll && (video.querySelectorAll('track[src]').length > 0 || video.querySelectorAll('track').length > 0)) return true;

    // 2. Custom player tracks already identified
    if (SC.customCaptionTracks && SC.customCaptionTracks.length > 0) return true;

    // 3. YouTube caption tracks or YouTube player CC indicator
    if (SC.isYouTubePage && SC.isYouTubePage()) {
      if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) return true;
      const ytSubBtn = document.querySelector('.ytp-subtitles-button');
      if (ytSubBtn && getComputedStyle(ytSubBtn).display !== 'none') return true;
      if (SC.extractYouTubeTracksFromDOM && SC.extractYouTubeTracksFromDOM().length > 0) return true;
      if (location.pathname.includes('/watch') || location.pathname.includes('/embed') || location.pathname.includes('/shorts')) {
        return true;
      }
    }

    // 4. Any captured lines or active cues already buffered
    if (SC.state && SC.state.lines && SC.state.lines.length > 0) return true;
    if (SC.customActiveCues && SC.customActiveCues.length > 0) return true;
    if (SC.ytActiveCues && SC.ytActiveCues.length > 0) return true;

    // 5. Player container subtitle clues
    const container = video.closest('.html5-video-player, .player, [id*="player"], [class*="player"]') || video.parentElement;
    if (container) {
      if (container.querySelector('.ytp-caption-segment, .ytp-subtitles-button, [class*="subtitle"], [class*="caption"], [id*="subtitle"], [id*="caption"], [class*="pjs_"], track')) {
        return true;
      }
    }

    return false;
  };

  /**
   * Hooks into an HTML5 video element, registers listeners, and connects capturers.
   */
  SC.hookVideo = function(video) {
    if (!video) return;
    const isFirstHook = !SC.hookedVideos.has(video);
    if (isFirstHook) {
      SC.hookedVideos.add(video);
    }

    if (SC.scanPageForSubtitleTracks) {
      SC.scanPageForSubtitleTracks();
    }

    // Initialize YouTube caption tracks when on YouTube
    if (SC.isYouTubePage && SC.isYouTubePage()) {
      if (SC.fetchYouTubeCaptionTracks) {
        const tracks = SC.fetchYouTubeCaptionTracks();
        if (tracks && tracks.length > 0) {
          if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(video);
          if (SC.loadYouTubeTimedText) {
            SC.loadYouTubeTimedText(tracks[0], `yt:${tracks[0].languageCode || 0}`);
            if (SC.renderLanguageList) SC.renderLanguageList();
          }
        }
      }
    }

    // Check if video has detected subtitles from any provider and register immediately
    if (SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(video)) {
      if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(video);
    }

    // Connect native HTML5 textTracks hook
    if (SC.hookHTML5Tracks) {
      SC.hookHTML5Tracks(video);
    }

    if (!isFirstHook) return;

    // Listen to video state changes to re-check subtitles
    video.addEventListener('loadedmetadata', () => {
      if (SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(video)) {
        if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(video);
      }
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
    });
    video.addEventListener('play', () => {
      if (SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(video)) {
        if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(video);
      }
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
    });

    // Timeupdate listener for direct YouTube cues, Custom cues, HTML5 cues, and DOM fallback
    let lastPrefetchTime = -999;
    let lastMatchedCueText = null;
    let lastMatchedCueStart = -1;

    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      let matchedText = null;
      let matchedStart = null;

      // 1. YouTube direct timedtext cues
      if (SC.getYouTubeActiveCueAtTime) {
        const match = SC.getYouTubeActiveCueAtTime(t);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 2. Custom & Playerjs parsed cues
      if (!matchedText && SC.getCustomActiveCueAtTime) {
        const match = SC.getCustomActiveCueAtTime(t);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 3. HTML5 TextTrack cues
      if (!matchedText && SC.getHTML5ActiveCueAtTime) {
        const primarySelector = SC.state && SC.state.languages
          ? (SC.state.languages.find(l => l.visible && (l.mode === 'track' || l.type === 'source')) || SC.state.languages[0])
          : null;
        const primaryTrackVal = primarySelector ? (primarySelector.trackId || primarySelector.sourceTrack || primarySelector.lang || 'auto') : 'auto';
        const match = SC.getHTML5ActiveCueAtTime(video, t, primaryTrackVal);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 4. Live DOM subtitle text fallback (for non-YouTube players)
      if (!matchedText && SC.getDOMSubtitleText) {
        const domText = SC.getDOMSubtitleText();
        if (domText) {
          matchedText = domText;
          matchedStart = t;
        }
      }

      // Only invoke addSubtitleLine when active cue text or start time changes
      if (matchedText) {
        if (matchedText !== lastMatchedCueText || Math.abs(matchedStart - lastMatchedCueStart) > 0.05) {
          lastMatchedCueText = matchedText;
          lastMatchedCueStart = matchedStart;
          SC.addSubtitleLine(matchedText, matchedStart);
        }
      } else {
        lastMatchedCueText = null;
        lastMatchedCueStart = -1;
        if (SC.state.currentActiveLine !== null) {
          SC.state.currentActiveLine = null;
          if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
        }
      }

      // Prefetch upcoming translations periodically (every ~3.5 seconds)
      if (Math.abs(t - lastPrefetchTime) >= 3.5) {
        lastPrefetchTime = t;
        if (SC.prefetchUpcomingTranslations) {
          SC.prefetchUpcomingTranslations(t, 45);
        }
      }
    });

    if (SC.videoResizeObserver) {
      try { SC.videoResizeObserver.observe(video); } catch (_) {}
    }
    video.addEventListener('play', () => {
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      if (SC.prefetchUpcomingTranslations) SC.prefetchUpcomingTranslations(video.currentTime, 45);
    });
    video.addEventListener('seeked', () => {
      lastMatchedCueText = null;
      lastMatchedCueStart = -1;
      if (SC.state.currentActiveLine !== null) {
        SC.state.currentActiveLine = null;
        if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      }
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      if (SC.prefetchUpcomingTranslations) SC.prefetchUpcomingTranslations(video.currentTime, 45);
    });
  };

  /**
   * Scans page for all <video> elements and hooks them.
   */
  SC.scanForVideos = function() {
    if (SC.scanPageForSubtitleTracks) {
      SC.scanPageForSubtitleTracks();
    }
    const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
    docs.forEach(doc => {
      try {
        const videos = doc.querySelectorAll('video');
        videos.forEach(v => {
          SC.hookVideo(v);
          if (SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(v)) {
            if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(v);
          }
        });
      } catch (_) {}
    });
  };

  /**
   * Sets up a MutationObserver for dynamically added videos and DOM captions.
   */
  SC.setupDOMSubtitleObserver = function() {
    const observedDocs = new WeakSet();

    function observeDocument(doc) {
      if (!doc || observedDocs.has(doc)) return;
      observedDocs.add(doc);

      const observer = new MutationObserver((mutations) => {
        let checkVideos = false;
        let checkGeneric = false;

        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.type === 'childList') {
            for (let j = 0; j < m.addedNodes.length; j++) {
              const node = m.addedNodes[j];
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'VIDEO' || node.tagName === 'TRACK' || node.tagName === 'IFRAME' || (node.firstElementChild && node.querySelector('video, track, iframe'))) {
                  checkVideos = true;
                }
                const cls = typeof node.className === 'string' ? node.className : '';
                const id = typeof node.id === 'string' ? node.id : '';
                if (
                  (cls && (cls.includes('caption') || cls.includes('subtitle') || cls.includes('cue') || cls.includes('playerjs') || cls.includes('ytp-subtitles-button'))) ||
                  (id && (id.includes('caption') || id.includes('subtitle') || id.includes('cue') || id.includes('pjs_')))
                ) {
                  checkGeneric = true;
                }
              }
            }
          } else if (m.type === 'characterData') {
            const parent = m.target.parentElement;
            if (parent) {
              const cls = typeof parent.className === 'string' ? parent.className : '';
              const id = typeof parent.id === 'string' ? parent.id : '';
              if (
                (cls && (cls.includes('caption') || cls.includes('subtitle') || cls.includes('cue') || cls.includes('playerjs') || cls.includes('ytp-subtitles-button'))) ||
                (id && (id.includes('caption') || id.includes('subtitle') || id.includes('cue') || id.includes('pjs_')))
              ) {
                checkGeneric = true;
              }
            }
          }
        }

        if (checkVideos) {
          const currentDocs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
          currentDocs.forEach(observeDocument);
          SC.scanForVideos();
        }

        if (checkGeneric) {
          const video = SC.getActiveVideo ? SC.getActiveVideo() : document.querySelector('video');
          if (video && SC.checkVideoHasSubtitles && SC.checkVideoHasSubtitles(video)) {
            if (SC.registerVideoWithSubtitles) SC.registerVideoWithSubtitles(video);
          }
          if (SC.getDOMSubtitleText) {
            const text = SC.getDOMSubtitleText();
            if (text && text.length > 1) {
              SC.addSubtitleLine(text, video ? video.currentTime : null);
            }
          }
        }
      });

      try {
        observer.observe(doc.body || doc.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
      } catch (_) {}
    }

    SC.observeDocument = observeDocument;
    const docs = SC.getAccessibleDocuments ? SC.getAccessibleDocuments() : [document];
    docs.forEach(observeDocument);
  };
})();

;
/**
 * Video Subtitles Capturer - On-Video Overlay Module
 * Manages responsive on-video subtitle rendering, positioning, scaling, and dragging.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.overlayEl = null;
  SC.videoResizeObserver = null;

  // Initialize overlay element inside Shadow DOM
  SC.initOverlay = function(shadowRoot) {
    const overlay = document.createElement('div');
    overlay.className = 'sc-video-overlay sc-hidden';
    overlay.id = 'sc-video-overlay';
    overlay.title = 'Перетащите для перемещения субтитров на видео';
    overlay.innerHTML = '<div class="sc-video-overlay-lines" id="sc-video-overlay-lines"></div>';

    SC.setupVideoOverlayDraggable(overlay);
    shadowRoot.appendChild(overlay);
    SC.overlayEl = overlay;

    if (typeof ResizeObserver !== 'undefined') {
      SC.videoResizeObserver = new ResizeObserver(() => {
        if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
        else SC.updateVideoOverlayPosition();
      });
    }

    return overlay;
  };

  // Adjust overlay position strictly within video boundaries ("в рамках окна видео")
  SC.updateVideoOverlayPosition = function() {
    if (!SC.overlayEl) return;
    const video = SC.getActiveVideo();
    if (!video || !SC.state.currentActiveLine) {
      SC.overlayEl.classList.add('sc-hidden');
      if (SC.updateVideoIconsPosition) SC.updateVideoIconsPosition();
      return;
    }

    const vRect = SC.getVideoBoundingClientRect ? SC.getVideoBoundingClientRect(video) : video.getBoundingClientRect();
    if (vRect.width < 50 || vRect.height < 50 || vRect.bottom < 0 || vRect.top > window.innerHeight) {
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    // Scale font size dynamically with video size
    const scaleFactor = Math.max(0.7, Math.min(1.6, vRect.width / 800));
    const dynamicFontSize = Math.round(SC.state.fontSize * scaleFactor);
    SC.overlayEl.style.fontSize = `${dynamicFontSize}px`;
    SC.overlayEl.style.maxWidth = `${Math.round(vRect.width * 0.92)}px`;

    const oW = SC.overlayEl.offsetWidth || 260;
    const oH = SC.overlayEl.offsetHeight || 50;

    // 0-100% positioning within video window boundaries (ai_instrs/_.md:24)
    const posXPercent = typeof SC.state.overlayPosX === 'number' ? SC.state.overlayPosX : 50;
    const posYPercent = typeof SC.state.overlayPosY === 'number' ? SC.state.overlayPosY : 90;

    const availW = Math.max(0, vRect.width - oW);
    const availH = Math.max(0, vRect.height - oH);

    let posX = vRect.left + (availW * posXPercent) / 100;
    let posY = vRect.top + (availH * posYPercent) / 100;

    // Strict containment within the video boundaries ("в рамках окна видео")
    const minX = vRect.left;
    const maxX = Math.max(minX, vRect.right - oW);
    const minY = vRect.top;
    const maxY = Math.max(minY, vRect.bottom - oH);

    posX = Math.max(minX, Math.min(maxX, posX));
    posY = Math.max(minY, Math.min(maxY, posY));

    SC.overlayEl.style.left = `${Math.round(posX)}px`;
    SC.overlayEl.style.top = `${Math.round(posY)}px`;
    SC.overlayEl.classList.remove('sc-hidden');
    if (SC.updateVideoIconsPosition) SC.updateVideoIconsPosition();
  };

  // Render content of active subtitle line on video overlay
  SC.updateVideoOverlayContent = function() {
    if (!SC.overlayEl || !SC.shadowRoot) return;
    const linesContainer = SC.shadowRoot.getElementById('sc-video-overlay-lines');
    if (!linesContainer) return;

    const activeLine = SC.state.currentActiveLine;
    if (!activeLine) {
      linesContainer.innerHTML = '';
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    const showTags = Boolean(SC.state.showLanguageTags);
    linesContainer.classList.toggle('sc-with-tags', showTags);

    const entries = [];
    const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];

    SC.state.languages.forEach(item => {
      if (!item.visible) return;

      if (item.mode === 'track' || (!item.mode && item.type === 'source')) {
        const trackVal = item.trackId || item.lang || 'auto';
        let trackText = (activeLine.trackTexts && activeLine.trackTexts[trackVal])
          ? activeLine.trackTexts[trackVal]
          : activeLine.text;
        trackText = (trackText || '').trim();
        if (!trackText) return;

        const found = availTracks.find(a => a.value === trackVal);
        let tag = 'ТРЕК';
        if (found) {
          tag = found.label.replace(/^\[.*?\]\s*/, '').slice(0, 4).toUpperCase();
        } else if (item.trackId && item.trackId.startsWith('track:')) {
          tag = item.trackId.replace('track:', '').slice(0, 4).toUpperCase();
        } else if (item.trackId && item.trackId.startsWith('yt:')) {
          tag = item.trackId.replace('yt:', '').slice(0, 4).toUpperCase();
        }
        const tagHTML = showTags ? `<span class="sc-vol-tag">${SC.escapeHtml(tag)}</span>` : '';
        entries.push(`
          <div class="sc-vol-line sc-vol-track">
            ${tagHTML}
            <span class="sc-vol-text">${SC.escapeHtml(trackText)}</span>
          </div>
        `);
      } else {
        const targetLang = item.targetLang || item.lang || 'en';
        const transText = activeLine.translations
          ? (activeLine.translations[item.id] || activeLine.translations[targetLang])
          : null;
        if (transText !== null && !transText.trim()) return;

        const tag = SC.getLangName(targetLang).slice(0, 3).toUpperCase();
        const tagHTML = showTags ? `<span class="sc-vol-tag">${tag}</span>` : '';
        entries.push(`
          <div class="sc-vol-line sc-vol-trans">
            ${tagHTML}
            <span class="sc-vol-text">${transText ? SC.escapeHtml(transText) : '<span class="sc-vol-loading">...</span>'}</span>
          </div>
        `);
      }
    });

    if (entries.length === 0) {
      linesContainer.innerHTML = '';
      SC.overlayEl.classList.add('sc-hidden');
      return;
    }

    linesContainer.innerHTML = entries.join('');
    SC.updateVideoOverlayPosition();
  };

  // Draggable logic for on-video overlay
  SC.setupVideoOverlayDraggable = function(element) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    element.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      element.classList.add('sc-dragging');
      e.preventDefault();
      e.stopPropagation();

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const video = SC.getActiveVideo();
        if (!video) return;

        const vRect = video.getBoundingClientRect();
        const oW = element.offsetWidth || 200;
        const oH = element.offsetHeight || 40;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Clamp to video bounds
        newLeft = Math.max(vRect.left, Math.min(vRect.right - oW, newLeft));
        newTop = Math.max(vRect.top, Math.min(vRect.bottom - oH, newTop));

        element.style.left = `${Math.round(newLeft)}px`;
        element.style.top = `${Math.round(newTop)}px`;

        const availW = Math.max(1, vRect.width - oW);
        const availH = Math.max(1, vRect.height - oH);
        SC.state.overlayPosX = Math.round(Math.max(0, Math.min(100, ((newLeft - vRect.left) / availW) * 100)));
        SC.state.overlayPosY = Math.round(Math.max(0, Math.min(100, ((newTop - vRect.top) / availH) * 100)));
        if (SC.syncPositionSliders) SC.syncPositionSliders();
      };

      const onMouseUp = () => {
        isDragging = false;
        element.classList.remove('sc-dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };
})();

;
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

;
/**
 * Video Subtitles Capturer - Main Entry Point
 * Orchestrates modules (state, translator, capturers, overlay, widget) and handles extension lifecycle.
 */

(() => {
  const SC = window.__SC;
  if (!SC) return;

  // Cross-frame state coordination for embedded video players
  const isTopFrame = window.self === window.top;
  let latestChildFrameData = null;

  function broadcastFrameUpdate() {
    if (!isTopFrame) {
      try {
        const activeVideo = SC.getActiveVideo();
        const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
        window.parent.postMessage({
          type: '__SC_CHILD_FRAME_UPDATE__',
          lines: SC.state.lines,
          tracks: availTracks,
          videoDetected: !!activeVideo,
          videoTime: activeVideo ? SC.formatTime(activeVideo.currentTime) : null,
          widgetVisible: SC.state.widgetVisible
        }, '*');
      } catch (_) {}
    }
  }

  // Hook line additions to notify parent frame
  const originalAddSubtitleLine = SC.addSubtitleLine;
  if (originalAddSubtitleLine) {
    SC.addSubtitleLine = function(rawText, videoTimestamp = null) {
      originalAddSubtitleLine(rawText, videoTimestamp);
      broadcastFrameUpdate();
    };
  }

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === '__SC_CHILD_FRAME_UPDATE__') {
      latestChildFrameData = e.data;
      if (Array.isArray(e.data.tracks) && e.data.tracks.length > 0) {
        SC.state.childTracks = e.data.tracks;
        if (SC.renderLanguageList) SC.renderLanguageList();
      }
      if (Array.isArray(e.data.lines) && e.data.lines.length > 0) {
        if (SC.state.lines.length < e.data.lines.length) {
          SC.state.lines = e.data.lines;
          if (SC.renderAllLines) SC.renderAllLines();
        }
      }
      if (!isTopFrame) {
        // Relay upward if middle frame
        try { window.parent.postMessage(e.data, '*'); } catch (_) {}
      }
    } else if (e.data.type === '__SC_FORWARD_POPUP_CMD__') {
      if (e.data.cmd === 'TOGGLE_WIDGET') {
        if (SC.state.widgetVisible) {
          if (SC.closeWidget) SC.closeWidget();
        } else {
          if (SC.openWidget) SC.openWidget();
        }
      } else if (e.data.cmd === 'CLEAR_SUBTITLES') {
        if (SC.clearAllSubtitles) SC.clearAllSubtitles();
      }
    }
  });

  // Extension runtime message listener for popup interaction
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const activeVideo = SC.getActiveVideo();

      // Prevent non-video iframes from overriding main frame response
      if (!isTopFrame && !activeVideo) {
        return false;
      }

      if (message.type === 'GET_SUBTITLES') {
        if (activeVideo || (SC.state.lines && SC.state.lines.length > 0) || !latestChildFrameData) {
          sendResponse({
            lines: SC.state.lines,
            videoDetected: !!activeVideo,
            videoTime: activeVideo ? SC.formatTime(activeVideo.currentTime) : null,
            widgetVisible: SC.state.widgetVisible
          });
        } else {
          sendResponse({
            lines: latestChildFrameData.lines || [],
            videoDetected: Boolean(latestChildFrameData.videoDetected),
            videoTime: latestChildFrameData.videoTime || null,
            widgetVisible: Boolean(latestChildFrameData.widgetVisible)
          });
        }
        return true;
      }

      if (message.type === 'CLEAR_SUBTITLES') {
        SC.clearAllSubtitles();
        // Forward to iframes
        document.querySelectorAll('iframe').forEach(f => {
          try { f.contentWindow.postMessage({ type: '__SC_FORWARD_POPUP_CMD__', cmd: 'CLEAR_SUBTITLES' }, '*'); } catch (_) {}
        });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'TOGGLE_WIDGET') {
        if (activeVideo || !latestChildFrameData) {
          if (SC.state.widgetVisible) {
            if (SC.closeWidget) SC.closeWidget();
          } else {
            if (SC.openWidget) SC.openWidget();
          }
          sendResponse({ widgetVisible: SC.state.widgetVisible });
        } else {
          // Forward toggle command to iframes
          document.querySelectorAll('iframe').forEach(f => {
            try { f.contentWindow.postMessage({ type: '__SC_FORWARD_POPUP_CMD__', cmd: 'TOGGLE_WIDGET' }, '*'); } catch (_) {}
          });
          sendResponse({ widgetVisible: !latestChildFrameData.widgetVisible });
        }
        return true;
      }
    });
  }

  // App initialization
  function init() {
    if (SC.initYouTubeBridge) SC.initYouTubeBridge();
    SC.initInPageWidget();
    SC.scanForVideos();
    if (SC.scanPageForSubtitleTracks) SC.scanPageForSubtitleTracks();
    SC.setupDOMSubtitleObserver();

    // Keep on-video overlay and video icons strictly aligned with video bounds on resize/scroll/fullscreen
    window.addEventListener('resize', SC.scheduleUpdatePositions, { passive: true });
    window.addEventListener('scroll', SC.scheduleUpdatePositions, { passive: true });

    const handleFsChange = () => {
      let fsElem = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsElem && SC.getAccessibleDocuments) {
        const docs = SC.getAccessibleDocuments();
        for (const doc of docs) {
          if (doc !== document && (doc.fullscreenElement || doc.webkitFullscreenElement)) {
            fsElem = doc.fullscreenElement || doc.webkitFullscreenElement;
            break;
          }
        }
      }
      if (fsElem && SC.hostEl) {
        if (SC.hostEl.parentNode !== fsElem) {
          fsElem.appendChild(SC.hostEl);
        }
      } else if (SC.hostEl && SC.hostEl.parentNode !== document.body && SC.hostEl.parentNode !== document.documentElement) {
        (document.body || document.documentElement).appendChild(SC.hostEl);
      }
      setTimeout(SC.scheduleUpdatePositions, 100);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    // Periodic fallback sweep for dynamically injected video elements, tracks, and position syncing
    setInterval(() => {
      if (SC.getAccessibleDocuments) {
        SC.getAccessibleDocuments().forEach(d => {
          if (SC.observeDocument) SC.observeDocument(d);
          if (d !== document) {
            d.removeEventListener('fullscreenchange', handleFsChange);
            d.removeEventListener('webkitfullscreenchange', handleFsChange);
            d.addEventListener('fullscreenchange', handleFsChange);
            d.addEventListener('webkitfullscreenchange', handleFsChange);
          }
        });
      }
      SC.scanForVideos();
      if (SC.scanPageForSubtitleTracks) SC.scanPageForSubtitleTracks();
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      broadcastFrameUpdate();
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__subtitlesCapturerInjected = true;
})();
