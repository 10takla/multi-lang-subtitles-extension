/**
 * Video Subtitles Capturer - Main Entry Point
 * Orchestrates modules (state, translator, capturers, overlay, widget, cross-frame, popup-bridge, lifecycle).
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Determine base directory if loaded directly via <script src="...">
  const currentScript = document.currentScript;
  let baseUrl = '';
  if (currentScript && currentScript.src) {
    baseUrl = currentScript.src.substring(0, currentScript.src.lastIndexOf('/') + 1);
    SC.extensionBaseUrl = baseUrl;
  }

  const moduleFiles = [
    'modules/state.js',
    'modules/translator.js',
    'modules/capturers/platform_adapters/southpark4u/index.js',
    'modules/capturers/platform_adapters/multfan/index.js',
    'modules/capturers/platform_adapters/lordfilm/index.js',
    'modules/capturers/platform_adapters/playerjs/index.js',
    'modules/capturers/platform_adapters/custom/index.js',
    'modules/capturers/platform_adapters/drm/index.js',
    'modules/capturers/platform_adapters/vimeo/index.js',
    'modules/capturers/platform_adapters/youtube/index.js',
    'modules/capturers/platform_adapters/coursera/index.js',
    'modules/capturers/platform_adapters/netflix/index.js',
    'modules/capturers/network/file/index.js',
    'modules/capturers/network/hls/index.js',
    'modules/capturers/network/dash/index.js',
    'modules/capturers/network/cea608/index.js',
    'modules/capturers/network/streaming/index.js',
    'modules/capturers/browser/html5/index.js',
    'modules/capturers/render/dom/index.js',
    'modules/capturers/render/hardsub/index.js',
    'modules/capturers.js',
    'modules/overlay.js',
    'modules/video_badge.js',
    'modules/language_bar.js',
    'modules/style_panel.js',
    'modules/settings_storage.js',
    'modules/widget.js',
    'modules/cross_frame.js',
    'modules/popup_bridge.js',
    'modules/lifecycle.js'
  ];

  function startExtension() {
    if (SC.initSettings) SC.initSettings();
    if (SC.initYouTubeBridge) SC.initYouTubeBridge();
    if (SC.initInPageWidget) SC.initInPageWidget();
    if (SC.initCrossFrameSync) SC.initCrossFrameSync();
    if (SC.initPopupBridge) SC.initPopupBridge();
    if (SC.initLifecycle) SC.initLifecycle();

    if (SC.scanForVideos) SC.scanForVideos();
    if (SC.scanPageForSubtitleTracks) SC.scanPageForSubtitleTracks();
    if (SC.setupDOMSubtitleObserver) SC.setupDOMSubtitleObserver();

    window.__subtitlesCapturerInjected = true;
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = (e) => {
        console.warn('[Subtitles] Failed loading module:', src, e);
        resolve();
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function launch() {
    if (!window.__SC?.initInPageWidget) {
      (async () => {
        if (baseUrl && !document.querySelector('link[data-sc-style]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = baseUrl + 'content.css';
          link.setAttribute('data-sc-style', 'true');
          (document.head || document.documentElement).appendChild(link);
        }
        for (const mod of moduleFiles) {
          await loadScript(baseUrl + mod);
        }
        startExtension();
      })();
    } else {
      startExtension();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launch);
  } else {
    launch();
  }
})();
