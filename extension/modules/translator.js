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

  // Prefetch translations for upcoming subtitle cues ahead of time (packing whole cues up to engine maxChars)
  SC.prefetchUpcomingTranslations = function(currentTime = null, bufferChars = null) {
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

      const engine = item.engine || 'google';
      const engineMax = SC.getEngineMaxChars
        ? SC.getEngineMaxChars(engine)
        : (engine === 'yandex' ? 10000 : (engine === 'chrome' ? 4000 : 1800));

      const configuredLimit = (bufferChars !== null && bufferChars !== undefined)
        ? Number(bufferChars)
        : ((item.bufferChars !== undefined && item.bufferChars !== null) ? Number(item.bufferChars) : Math.min(1000, engineMax));

      // Strictly bounded by engine maximum
      const maxChars = Math.max(1, Math.min(configuredLimit, engineMax));

      // Lookahead candidates (up to 30 minutes from current playback time)
      const upcomingCues = SC.getUpcomingCues(t, 1800, sourceTrack);
      if (!upcomingCues || upcomingCues.length === 0) return;

      const normSourceLang = SC.normalizeLangCode ? SC.normalizeLangCode(sourceLang) : sourceLang;
      const normTargetLang = SC.normalizeLangCode ? SC.normalizeLangCode(targetLang) : targetLang;

      // Sort candidate cues by start time ascending
      const sortedCues = [...upcomingCues].sort((a, b) => a.start - b.start);

      // Pack whole cues into buffer up to maxChars
      const batch = [];
      let totalChars = 0;

      for (let i = 0; i < sortedCues.length; i++) {
        const cue = sortedCues[i];
        const sourceText = SC.cleanText(cue.text);
        if (!sourceText) continue;

        const textLen = sourceText.length;
        // Stop if adding the next whole cue would exceed character limit
        if (totalChars + textLen > maxChars && batch.length > 0) {
          break;
        }

        const cacheKey = `${engine}_${normSourceLang}_${normTargetLang}_${sourceText}`;
        if (!SC.state.translationCache.has(cacheKey) && !inFlightRequests.has(cacheKey)) {
          batch.push({ cue, text: sourceText, key: cacheKey });
        }
        totalChars += textLen;
        if (totalChars >= maxChars) break;
      }

      if (batch.length === 0) return;

      // Dispatch translation for the packed batch
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
