/**
 * Video Subtitles Capturer - Background Translation Proxy Service
 * Handles web-based translation requests (Google Translate, Yandex Translate).
 */

(() => {
  const TranslatorService = {
    fetchGoogle(text, targetLang, sourceLang = 'auto', clientName = 'dict-chrome-ex') {
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=${encodeURIComponent(clientName)}&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
      return fetch(gUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          let translated = '';
          if (data && Array.isArray(data[0])) {
            translated = data[0]
              .map((chunk) => (chunk && chunk[0] ? chunk[0] : ''))
              .join('')
              .trim();
          }
          return translated || null;
        });
    },

    translateGoogleWithFallback(text, targetLang, sourceLang) {
      return this.fetchGoogle(text, targetLang, sourceLang, 'dict-chrome-ex')
        .then((result) => {
          if (result) return result;
          return this.fetchGoogle(text, targetLang, sourceLang, 'gtx');
        })
        .catch(() => this.fetchGoogle(text, targetLang, sourceLang, 'gtx'));
    },

    translateYandex(text, targetLang, sourceLang = 'auto') {
      const langParam = sourceLang && sourceLang !== 'auto' ? `${sourceLang}-${targetLang}` : targetLang;
      const url = `https://translate.yandex.net/api/v1/tr.json/translate?srv=android&lang=${encodeURIComponent(langParam)}&text=${encodeURIComponent(text)}`;

      return fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (data && Array.isArray(data.text)) {
            const translated = data.text.join(' ').trim();
            if (translated) return translated;
          }
          throw new Error('Yandex empty result');
        })
        .catch(() => this.translateGoogleWithFallback(text, targetLang, sourceLang));
    },

    handleMessage(message, sendResponse) {
      const { text, targetLang, sourceLang = 'auto', engine = 'google' } = message;

      if (!text || !targetLang) {
        sendResponse({ success: false, error: 'Missing text or targetLang', translated: null });
        return;
      }

      const promise = engine === 'yandex'
        ? this.translateYandex(text, targetLang, sourceLang)
        : this.translateGoogleWithFallback(text, targetLang, sourceLang);

      promise
        .then((translated) => {
          if (translated) {
            sendResponse({ success: true, translated });
          } else {
            sendResponse({ success: false, error: 'No translation produced', translated: null });
          }
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message, translated: null });
        });
    }
  };

  self.TranslatorService = TranslatorService;
})();
