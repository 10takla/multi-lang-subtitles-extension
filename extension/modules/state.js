/**
 * Video Subtitles Capturer - State & Utilities Module
 */

(() => {
  // Prevent duplicate injection in the same frame
  if (window.__subtitlesCapturerInjected) return;
  window.__subtitlesCapturerInjected = true;

  window.__SC = window.__SC || {};
  const SC = window.__SC;

  // Available languages for translation (Google Translate)
  SC.AVAILABLE_LANGUAGES = [
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'zh-CN', name: '中文' },
    { code: 'ja', name: '日本語' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'uk', name: 'Українська' },
    { code: 'ar', name: 'العربية' }
  ];

  SC.getLangName = function(code) {
    const found = SC.AVAILABLE_LANGUAGES.find(l => l.code === code);
    return found ? found.name : code;
  };

  // State container
  SC.state = {
    lines: [],
    autoScroll: true,
    fontSize: 13,
    widgetVisible: true,
    minimized: false,
    lastAddedText: '',
    lastAddedTime: 0,
    lastVideoTime: -1,
    activeStreamingLineId: null,
    // Multi-subtitles: 1 source and multiple translations/tracks
    languages: [
      { id: 'source', type: 'source', lang: 'auto', label: 'Оригинал', visible: true }
    ],
    translationCache: new Map(),
    videoOverlayPosition: 'bottom', // 'bottom' | 'center' | 'top' | 'custom'
    customOverlayPos: null,
    currentActiveLine: null,
    overlayFadeTimeout: null
  };

  // Helper: Format seconds to MM:SS or HH:MM:SS
  SC.formatTime = function(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  // Find currently active or playing video element
  SC.getActiveVideo = function() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const playing = videos.find((v) => !v.paused && !v.ended && v.readyState > 2);
    return playing || videos[0];
  };

  // Sanitize text
  SC.cleanText = function(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '') // strip any HTML tags
      .replace(/\r\n|\r|\n/g, ' ') // convert inner line breaks to spaces
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Escape HTML characters
  SC.escapeHtml = function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Get full formatted text for a subtitle line across all visible languages
  SC.getLineFullText = function(line) {
    if (!line) return '';
    return SC.state.languages
      .filter(l => l.visible)
      .map(l => {
        if (l.type === 'source') return line.text;
        if (l.mode === 'track') return (line.trackTexts && line.trackTexts[l.lang]) ? line.trackTexts[l.lang] : line.text;
        return (line.translations && (line.translations[l.id] || line.translations[l.lang])) || '';
      })
      .filter(Boolean)
      .join(' | ');
  };

  // Broadcast line update to open popup if any
  SC.broadcastLineUpdate = function(line, isNew = false) {
    try {
      chrome.runtime.sendMessage({
        type: isNew ? 'NEW_LINE' : 'UPDATE_LINE',
        line: line
      }).catch(() => {});
    } catch (_) {}
  };
})();
