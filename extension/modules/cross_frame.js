/**
 * Video Subtitles Capturer - Cross-Frame Coordination Module
 * Handles inter-frame state synchronization and command forwarding for embedded video players.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.isTopFrame = window.self === window.top;
  SC.latestChildFrameData = null;

  SC.broadcastFrameUpdate = function() {
    if (!SC.isTopFrame) {
      try {
        const localVideo = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
        const availTracks = SC.getAvailableVideoTracks ? SC.getAvailableVideoTracks() : [];
        window.parent.postMessage({
          type: '__SC_CHILD_FRAME_UPDATE__',
          lines: (SC.state && SC.state.lines) || [],
          tracks: availTracks,
          videoDetected: !!localVideo,
          videoTime: localVideo ? SC.formatTime(localVideo.currentTime) : null,
          widgetVisible: Boolean(SC.state && SC.state.widgetVisible)
        }, '*');
      } catch (_) {}
    }
  };

  SC.forwardCommandToFrames = function(cmd, extra = {}) {
    document.querySelectorAll('iframe').forEach((f) => {
      try {
        f.contentWindow.postMessage({ type: '__SC_FORWARD_POPUP_CMD__', cmd, ...extra }, '*');
      } catch (_) {}
    });
  };

  SC.initCrossFrameSync = function() {
    // Hook line additions to notify parent frame
    const originalAddSubtitleLine = SC.addSubtitleLine;
    if (originalAddSubtitleLine && !SC._hasHookedCrossFrameAdd) {
      SC._hasHookedCrossFrameAdd = true;
      SC.addSubtitleLine = function(rawText, videoTimestamp = null) {
        originalAddSubtitleLine(rawText, videoTimestamp);
        SC.broadcastFrameUpdate();
      };
    }

    window.addEventListener('message', (e) => {
      if (!e.data) return;

      if (e.data.type === '__SC_CHILD_FRAME_UPDATE__') {
        SC.latestChildFrameData = e.data;
        if (Array.isArray(e.data.tracks) && e.data.tracks.length > 0) {
          if (SC.state) SC.state.childTracks = e.data.tracks;
          if (SC.renderLanguageList) SC.renderLanguageList();
        }
        if (Array.isArray(e.data.lines) && e.data.lines.length > 0) {
          if (SC.state && SC.state.lines.length < e.data.lines.length) {
            SC.state.lines = e.data.lines;
            if (SC.getLocalVideo && SC.getLocalVideo() && SC.renderAllLines) {
              SC.renderAllLines();
            }
          }
        }
        // Relay upward if middle frame
        if (!SC.isTopFrame) {
          try { window.parent.postMessage(e.data, '*'); } catch (_) {}
        }
      } else if (e.data.type === '__SC_FORWARD_POPUP_CMD__') {
        if (e.data.cmd === 'TOGGLE_WIDGET') {
          const cmdId = e.data.cmdId;
          if (cmdId && SC._lastHandledToggleCmdId === cmdId) {
            return;
          }
          if (cmdId) SC._lastHandledToggleCmdId = cmdId;

          const localVideo = SC.getLocalVideo ? SC.getLocalVideo() : document.querySelector('video');
          if (!localVideo) {
            if (SC.forwardCommandToFrames) {
              SC.forwardCommandToFrames('TOGGLE_WIDGET', { cmdId });
            }
            return;
          }

          if (SC.state && SC.state.widgetVisible) {
            if (SC.closeWidget) SC.closeWidget();
          } else {
            if (SC.openWidget) SC.openWidget();
          }
        } else if (e.data.cmd === 'CLEAR_SUBTITLES') {
          if (SC.clearAllSubtitles) SC.clearAllSubtitles();
        }
      }
    });
  };
})();
