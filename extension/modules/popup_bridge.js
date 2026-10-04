/**
 * Video Subtitles Capturer - Popup Message Bridge Module
 * Handles extension runtime messages sent from the extension popup.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.initPopupBridge = function() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage || !chrome.runtime.onMessage.addListener) {
      return;
    }

    if (SC._hasInitializedPopupBridge) return;
    SC._hasInitializedPopupBridge = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const activeVideo = SC.getActiveVideo ? SC.getActiveVideo() : null;

      // Prevent non-video iframes from overriding main frame response
      if (!SC.isTopFrame && !activeVideo) {
        return false;
      }

      if (message.type === 'GET_SUBTITLES') {
        const hasDirectLines = SC.state && SC.state.lines && SC.state.lines.length > 0;
        if (activeVideo || hasDirectLines || !SC.latestChildFrameData) {
          sendResponse({
            lines: (SC.state && SC.state.lines) || [],
            videoDetected: Boolean(activeVideo),
            videoTime: activeVideo ? SC.formatTime(activeVideo.currentTime) : null,
            widgetVisible: Boolean(SC.state && SC.state.widgetVisible)
          });
        } else {
          sendResponse({
            lines: SC.latestChildFrameData.lines || [],
            videoDetected: Boolean(SC.latestChildFrameData.videoDetected),
            videoTime: SC.latestChildFrameData.videoTime || null,
            widgetVisible: Boolean(SC.latestChildFrameData.widgetVisible)
          });
        }
        return true;
      }

      if (message.type === 'CLEAR_SUBTITLES') {
        if (SC.clearAllSubtitles) SC.clearAllSubtitles();
        if (SC.forwardCommandToFrames) SC.forwardCommandToFrames('CLEAR_SUBTITLES');
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'TOGGLE_WIDGET') {
        if (activeVideo || !SC.latestChildFrameData) {
          if (SC.state && SC.state.widgetVisible) {
            if (SC.closeWidget) SC.closeWidget();
          } else {
            if (SC.openWidget) SC.openWidget();
          }
          sendResponse({ widgetVisible: Boolean(SC.state && SC.state.widgetVisible) });
        } else {
          if (SC.forwardCommandToFrames) SC.forwardCommandToFrames('TOGGLE_WIDGET');
          sendResponse({ widgetVisible: !SC.latestChildFrameData.widgetVisible });
        }
        return true;
      }

      return false;
    });
  };
})();
