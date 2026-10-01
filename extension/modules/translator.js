/**
 * Video Subtitles Capturer - Translation Module
 * Handles translation via Google Translate (client=gtx) and background service worker.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Translate text via background script with fallback to direct Google Translate GTX
  SC.fetchTranslation = async function(text, targetLang, sourceLang = 'auto') {
    if (!text || !targetLang) return text;
    const cacheKey = `${sourceLang}_${targetLang}_${text}`;
    if (SC.state.translationCache.has(cacheKey)) {
      return SC.state.translationCache.get(cacheKey);
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'TRANSLATE_TEXT', text, targetLang, sourceLang },
          (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              // Direct fetch fallback
              const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
              fetch(url)
                .then(r => r.json())
                .then(d => {
                  const res = d && Array.isArray(d[0]) ? d[0].map(c => c[0] || '').join('') : text;
                  SC.state.translationCache.set(cacheKey, res);
                  resolve(res);
                })
                .catch(() => resolve(text));
            } else {
              const res = response.translated || text;
              SC.state.translationCache.set(cacheKey, res);
              resolve(res);
            }
          }
        );
      } catch (_) {
        resolve(text);
      }
    });
  };

  // Re-translate lines for a specific language configuration item
  SC.retranslateItem = function(item) {
    if (!item || item.mode === 'track') return;
    SC.state.lines.forEach(l => {
      let sourceText = l.text;
      let sourceLang = 'auto';

      if (item.sourceFrom && item.sourceFrom !== 'auto') {
        if (l.trackTexts && l.trackTexts[item.sourceFrom]) {
          sourceText = l.trackTexts[item.sourceFrom];
        }
        if (item.sourceFrom.startsWith('yt:')) {
          sourceLang = item.sourceFrom.replace('yt:', '');
        } else if (item.sourceFrom.startsWith('track:')) {
          sourceLang = item.sourceFrom.replace('track:', '');
        }
      }

      SC.fetchTranslation(sourceText, item.lang, sourceLang).then(trans => {
        if (!l.translations) l.translations = {};
        l.translations[item.id] = trans;
        l.translations[item.lang] = trans;
        if (SC.updateTranslationInDOM) {
          SC.updateTranslationInDOM(l.id, item.id, trans);
        }
      });
    });
  };

  // Translate a single subtitle line for all active translation items
  SC.translateLine = function(line) {
    if (!line || !line.text) return;
    if (!line.translations) line.translations = {};

    SC.state.languages.forEach(langItem => {
      if (langItem.type === 'translation' && (langItem.mode === 'trans' || !langItem.mode)) {
        const langCode = langItem.lang;
        const sourceFrom = langItem.sourceFrom || 'auto';

        let sourceText = line.text;
        let sourceLang = 'auto';

        if (sourceFrom !== 'auto') {
          if (line.trackTexts && line.trackTexts[sourceFrom]) {
            sourceText = line.trackTexts[sourceFrom];
          }
          if (sourceFrom.startsWith('yt:')) {
            sourceLang = sourceFrom.replace('yt:', '');
          } else if (sourceFrom.startsWith('track:')) {
            sourceLang = sourceFrom.replace('track:', '');
          }
        }

        if (!line.translations[langItem.id]) {
          SC.fetchTranslation(sourceText, langCode, sourceLang).then(trans => {
            line.translations[langItem.id] = trans;
            line.translations[langItem.lang] = trans;
            if (SC.updateTranslationInDOM) {
              SC.updateTranslationInDOM(line.id, langItem.id, trans);
            }
          });
        }
      }
    });
  };
})();
