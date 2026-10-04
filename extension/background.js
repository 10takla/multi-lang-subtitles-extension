/**
 * Background Service Worker for Video Subtitles Capturer
 */

const tabSubtitleCounts = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_TEXT') {
    const { text, targetLang, sourceLang = 'auto', engine = 'google' } = message;

    const fetchGoogle = (clientName = 'dict-chrome-ex') => {
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=${encodeURIComponent(clientName)}&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
      return fetch(gUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          let translated = '';
          if (data && Array.isArray(data[0])) {
            translated = data[0].map(chunk => (chunk && chunk[0]) ? chunk[0] : '').join('').trim();
          }
          if (translated) {
            sendResponse({ success: true, translated });
            return true;
          }
          return false;
        });
    };

    if (engine === 'yandex') {
      const langParam = (sourceLang && sourceLang !== 'auto') ? `${sourceLang}-${targetLang}` : targetLang;
      const url = `https://translate.yandex.net/api/v1/tr.json/translate?srv=android&lang=${encodeURIComponent(langParam)}&text=${encodeURIComponent(text)}`;
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          let translated = '';
          if (data && Array.isArray(data.text)) {
            translated = data.text.join(' ').trim();
          }
          if (translated) {
            sendResponse({ success: true, translated });
          } else {
            fetchGoogle('dict-chrome-ex')
              .catch(() => fetchGoogle('gtx'))
              .catch(err => sendResponse({ success: false, error: err.message, translated: null }));
          }
        })
        .catch(() => {
          fetchGoogle('dict-chrome-ex')
            .catch(() => fetchGoogle('gtx'))
            .catch(err => sendResponse({ success: false, error: err.message, translated: null }));
        });
      return true;
    }

    // Default: Google Translate (dict-chrome-ex with fallback to gtx)
    fetchGoogle('dict-chrome-ex')
      .then(ok => {
        if (!ok) {
          fetchGoogle('gtx').catch(err => sendResponse({ success: false, error: err.message, translated: null }));
        }
      })
      .catch(() => {
        fetchGoogle('gtx').catch(err => sendResponse({ success: false, error: err.message, translated: null }));
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SUBTITLE_ADDED') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      const currentCount = (tabSubtitleCounts.get(tabId) || 0) + 1;
      tabSubtitleCounts.set(tabId, currentCount);
      
      chrome.action.setBadgeText({
        text: currentCount > 999 ? '999+' : String(currentCount),
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#1877F2',
        tabId: tabId
      });
    }
  } else if (message.type === 'RESET_COUNT') {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    if (tabId) {
      tabSubtitleCounts.set(tabId, 0);
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
  }
  return true;
});

// Clean up state when tab is closed or updated
chrome.tabs.onRemoved.addListener((tabId) => {
  tabSubtitleCounts.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabSubtitleCounts.set(tabId, 0);
    chrome.action.setBadgeText({
      text: '',
      tabId: tabId
    });
  }
});
