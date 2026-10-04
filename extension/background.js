/**
 * Background Service Worker for Video Subtitles Capturer
 * Orchestrates background modules: badge management and translation service.
 */

try {
  importScripts(
    'modules/background/badge_manager.js',
    'modules/background/translator_service.js'
  );
} catch (e) {
  console.error('[Subtitles Background] Error loading modules:', e);
}

if (self.BadgeManager) {
  self.BadgeManager.init();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_TEXT') {
    if (self.TranslatorService) {
      self.TranslatorService.handleMessage(message, sendResponse);
    } else {
      sendResponse({ success: false, error: 'TranslatorService not initialized' });
    }
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SUBTITLE_ADDED' || message.type === 'RESET_COUNT') {
    if (self.BadgeManager) {
      self.BadgeManager.handleMessage(message, sender);
    }
    sendResponse({ success: true });
    return true;
  }

  return true;
});
