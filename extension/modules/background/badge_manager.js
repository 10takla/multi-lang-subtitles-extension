/**
 * Video Subtitles Capturer - Background Badge Manager
 * Handles tab-specific subtitle counts and extension badge updates.
 */

(() => {
  const tabSubtitleCounts = new Map();

  const BadgeManager = {
    init() {
      // Clear tab state on tab removal
      chrome.tabs.onRemoved.addListener((tabId) => {
        tabSubtitleCounts.delete(tabId);
      });

      // Reset badge on tab navigation/reload
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
          BadgeManager.resetTab(tabId);
        }
      });
    },

    incrementTab(tabId) {
      if (!tabId) return;
      const count = (tabSubtitleCounts.get(tabId) || 0) + 1;
      tabSubtitleCounts.set(tabId, count);

      chrome.action.setBadgeText({
        text: count > 999 ? '999+' : String(count),
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#1877F2',
        tabId: tabId
      });
    },

    resetTab(tabId) {
      if (!tabId) return;
      tabSubtitleCounts.set(tabId, 0);
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    },

    handleMessage(message, sender) {
      if (message.type === 'SUBTITLE_ADDED') {
        const tabId = sender.tab ? sender.tab.id : null;
        BadgeManager.incrementTab(tabId);
        return true;
      }
      if (message.type === 'RESET_COUNT') {
        const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
        BadgeManager.resetTab(tabId);
        return true;
      }
      return false;
    }
  };

  self.BadgeManager = BadgeManager;
})();
