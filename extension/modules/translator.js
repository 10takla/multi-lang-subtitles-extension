/**
 * Video Subtitles Capturer - Translation Module
 * Handles translation via Google Translate (client=gtx) and background service worker.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  const inFlightRequests = new Map();

  // Translate text via background script with fallback to direct Google Translate GTX
  SC.fetchTranslation = async function(text, targetLang, sourceLang = 'auto') {
    if (!text || !targetLang) return null;
    const cleanSourceText = SC.cleanText(text);
    if (!cleanSourceText) return null;

    const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
    const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;

    if (normSourceLang !== 'auto' && normTargetLang !== 'auto' && normSourceLang === normTargetLang) {
      return cleanSourceText;
    }

    const cacheKey = `${normSourceLang}_${normTargetLang}_${cleanSourceText}`;
    if (SC.state.translationCache.has(cacheKey)) {
      return SC.state.translationCache.get(cacheKey);
    }
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const promise = new Promise((resolve) => {
      const doDirectFetch = () => {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(normSourceLang)}&tl=${encodeURIComponent(normTargetLang)}&dt=t&q=${encodeURIComponent(cleanSourceText)}`;
        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then(d => {
            let res = '';
            if (d && Array.isArray(d[0])) {
              res = d[0].map(c => (c && c[0]) ? c[0] : '').join('').trim();
            }
            // CRITICAL: Only cache if valid translation received! Never cache fallback original text!
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
            { type: 'TRANSLATE_TEXT', text: cleanSourceText, targetLang: normTargetLang, sourceLang: normSourceLang },
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
  SC.prefetchUpcomingTranslations = function(currentTime = null, bufferSeconds = 45) {
    if (!SC.getUpcomingCues) return;

    const translationItems = SC.state.languages.filter(l => l.type === 'translation' && (l.mode === 'trans' || !l.mode));
    if (translationItems.length === 0) return;

    const activeVideo = SC.getActiveVideo();
    const t = (currentTime !== null && currentTime !== undefined)
      ? currentTime
      : (activeVideo ? activeVideo.currentTime : 0);

    const sourceItem = SC.state.languages.find(l => l.type === 'source');
    const defaultSourceTrack = sourceItem ? sourceItem.lang : 'auto';

    translationItems.forEach(item => {
      const targetLang = item.lang;
      if (!targetLang) return;

      const sourceTrack = (item.sourceFrom && item.sourceFrom !== 'auto') ? item.sourceFrom : defaultSourceTrack;
      const sourceLang = SC.resolveTrackLang ? SC.resolveTrackLang(sourceTrack) : 'auto';

      if (sourceLang !== 'auto' && targetLang !== 'auto' && sourceLang === targetLang) {
        return;
      }

      const upcomingCues = SC.getUpcomingCues(t, bufferSeconds, sourceTrack);
      if (!upcomingCues || upcomingCues.length === 0) return;

      const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
      const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;

      // Filter cues that need fetching and sort by start time ascending
      const needed = [];
      for (let i = 0; i < upcomingCues.length; i++) {
        const cue = upcomingCues[i];
        const sourceText = SC.cleanText(cue.text);
        if (!sourceText) continue;
        const cacheKey = `${normSourceLang}_${normTargetLang}_${sourceText}`;
        if (!SC.state.translationCache.has(cacheKey) && !inFlightRequests.has(cacheKey)) {
          needed.push({ cue, text: sourceText, key: cacheKey });
        }
      }

      if (needed.length === 0) return;

      // Sort so the immediate upcoming cues are fetched first
      needed.sort((a, b) => a.cue.start - b.cue.start);

      // Fetch up to 30 nearest upcoming cues (covering full 30-60s buffer)
      const batch = needed.slice(0, 30);
      for (let i = 0; i < batch.length; i++) {
        SC.fetchTranslation(batch[i].text, normTargetLang, normSourceLang);
      }
    });
  };

  // Re-translate lines for a specific language configuration item
  SC.retranslateItem = function(item) {
    if (!item || item.mode === 'track') return;
    const sourceItem = SC.state.languages.find(l => l.type === 'source');
    const defaultSourceTrack = sourceItem ? sourceItem.lang : 'auto';
    const sourceTrack = (item.sourceFrom && item.sourceFrom !== 'auto') ? item.sourceFrom : defaultSourceTrack;
    const sourceLang = SC.resolveTrackLang ? SC.resolveTrackLang(sourceTrack) : 'auto';
    const targetLang = item.lang;
    if (!targetLang) return;

    const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
    const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;

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

      const cacheKey = `${normSourceLang}_${normTargetLang}_${sourceText}`;
      if (SC.state.translationCache.has(cacheKey)) {
        const trans = SC.state.translationCache.get(cacheKey);
        l.translations[item.id] = trans;
        l.translations[normTargetLang] = trans;
        if (SC.updateTranslationInDOM) {
          SC.updateTranslationInDOM(l.id, item.id, trans);
        }
      } else {
        SC.fetchTranslation(sourceText, normTargetLang, normSourceLang).then(trans => {
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

    const sourceItem = SC.state.languages.find(l => l.type === 'source');
    const defaultSourceTrack = sourceItem ? sourceItem.lang : 'auto';

    SC.state.languages.forEach(langItem => {
      if (langItem.type === 'translation' && (langItem.mode === 'trans' || !langItem.mode)) {
        const langCode = langItem.lang;
        if (!langCode) return;

        const sourceTrack = (langItem.sourceFrom && langItem.sourceFrom !== 'auto')
          ? langItem.sourceFrom
          : defaultSourceTrack;

        const sourceLang = SC.resolveTrackLang ? SC.resolveTrackLang(sourceTrack) : 'auto';

        let sourceText = line.text;
        if (sourceTrack && sourceTrack !== 'auto' && line.trackTexts && line.trackTexts[sourceTrack]) {
          sourceText = line.trackTexts[sourceTrack];
        }
        sourceText = SC.cleanText(sourceText);
        if (!sourceText) return;

        const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
        const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(langCode) : langCode;

        if (normSourceLang !== 'auto' && normTargetLang !== 'auto' && normSourceLang === normTargetLang) {
          line.translations[langItem.id] = sourceText;
          line.translations[normTargetLang] = sourceText;
          return;
        }

        if (!line.translations[langItem.id]) {
          const cacheKey = `${normSourceLang}_${normTargetLang}_${sourceText}`;
          if (SC.state.translationCache.has(cacheKey)) {
            const cached = SC.state.translationCache.get(cacheKey);
            line.translations[langItem.id] = cached;
            line.translations[normTargetLang] = cached;
          } else {
            SC.fetchTranslation(sourceText, normTargetLang, normSourceLang).then(trans => {
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
