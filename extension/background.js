/**
 * Background Service Worker for Video Subtitles Capturer
 */

const tabSubtitleCounts = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_TEXT') {
    const { text, targetLang, sourceLang = 'auto', engine = 'google' } = message;

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
          if (translated && (translated !== text || sourceLang === targetLang)) {
            sendResponse({ success: true, translated });
          } else {
            sendResponse({ success: false, error: 'Empty or untranslated response', translated: null });
          }
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message, translated: null });
        });
      return true;
    }

    // Default: Google Translate (client=gtx)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        let translated = '';
        if (data && Array.isArray(data[0])) {
          translated = data[0].map(chunk => (chunk && chunk[0]) ? chunk[0] : '').join('').trim();
        }
        if (translated && (translated !== text || sourceLang === targetLang)) {
          sendResponse({ success: true, translated });
        } else {
          sendResponse({ success: false, error: 'Empty or untranslated response', translated: null });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message, translated: null });
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
