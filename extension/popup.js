/**
 * Video Subtitles Capturer - Popup Controller
 * Connects UI elements, background/content messaging, and export workflows.
 */

document.addEventListener('DOMContentLoaded', () => {
  const uiElements = {
    lineCountBadge: document.getElementById('line-count'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    statusTime: document.getElementById('status-time'),
    linesContainer: document.getElementById('lines-container')
  };

  const searchInput = document.getElementById('search-input');
  const autoScrollBtn = document.getElementById('btn-autoscroll');
  const toggleWidgetBtn = document.getElementById('btn-toggle-widget');
  const copyAllBtn = document.getElementById('btn-copy-all');
  const exportTxtBtn = document.getElementById('btn-export-txt');
  const exportSrtBtn = document.getElementById('btn-export-srt');
  const clearBtn = document.getElementById('btn-clear');

  let currentTabId = null;
  let allLines = [];
  let autoScroll = true;
  let searchQuery = '';

  function refreshLines() {
    PopupUI.renderLines(uiElements, {
      lines: allLines,
      query: searchQuery,
      autoScroll
    });
  }

  function appendOrUpdateLine(line, isNew) {
    if (isNew) {
      allLines.push(line);
    } else {
      const idx = allLines.findIndex((l) => l.id === line.id);
      if (idx !== -1) {
        allLines[idx] = line;
      } else {
        allLines.push(line);
      }
    }
    refreshLines();
  }

  function fetchSubtitles() {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, { type: 'GET_SUBTITLES' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        PopupUI.updateStatus(uiElements, {
          active: false,
          message: 'Скрипт ожидает видео на странице'
        });
        return;
      }

      allLines = response.lines || [];
      const hasVideo = response.videoDetected;
      const vTime = response.videoTime || '';

      if (hasVideo) {
        PopupUI.updateStatus(uiElements, {
          active: true,
          message: 'Видео отслеживается',
          time: vTime ? `⏱ ${vTime}` : ''
        });
      } else {
        PopupUI.updateStatus(uiElements, {
          active: false,
          message: 'Видео не найдено'
        });
      }

      refreshLines();
    });
  }

  // Get active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      PopupUI.updateStatus(uiElements, { active: false, message: 'Вкладка не найдена' });
      return;
    }
    const tab = tabs[0];
    currentTabId = tab.id;

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      PopupUI.updateStatus(uiElements, { active: false, message: 'Недоступно на системных страницах' });
      return;
    }

    fetchSubtitles();
  });

  // Listen for live updates from content script
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.tab && currentTabId && sender.tab.id !== currentTabId) return;

    if (message.type === 'NEW_SUBTITLE' && message.line) {
      appendOrUpdateLine(message.line, true);
      PopupUI.updateStatus(uiElements, {
        active: true,
        message: 'Захват субтитров...',
        time: `⏱ ${message.line.videoTime || ''}`
      });
    } else if (message.type === 'UPDATE_SUBTITLE' && message.line) {
      appendOrUpdateLine(message.line, false);
    }
  });

  // Search filter
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      refreshLines();
    });
  }

  // Auto-scroll toggle
  if (autoScrollBtn) {
    autoScrollBtn.addEventListener('click', () => {
      autoScroll = !autoScroll;
      autoScrollBtn.classList.toggle('active', autoScroll);
      if (autoScroll && uiElements.linesContainer) {
        uiElements.linesContainer.scrollTop = uiElements.linesContainer.scrollHeight;
      }
    });
  }

  // Toggle widget on page
  if (toggleWidgetBtn) {
    toggleWidgetBtn.addEventListener('click', () => {
      if (!currentTabId) return;
      const cmdId = 'toggle_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_WIDGET', cmdId });
    });
  }

  // Copy all
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', () => {
      if (!allLines.length) return;
      const text = PopupExporter.buildTxtContent(allLines);
      PopupExporter.copyText(text).then(() => {
        const orig = copyAllBtn.textContent;
        copyAllBtn.textContent = '✓ Готово';
        setTimeout(() => { copyAllBtn.textContent = orig; }, 1500);
      });
    });
  }

  // Export TXT
  if (exportTxtBtn) {
    exportTxtBtn.addEventListener('click', () => {
      if (!allLines.length) return;
      const content = PopupExporter.buildTxtContent(allLines);
      PopupExporter.downloadFile(
        content,
        `subtitles_${PopupExporter.formatDateForFile(new Date())}.txt`,
        'text/plain;charset=utf-8'
      );
    });
  }

  // Export SRT
  if (exportSrtBtn) {
    exportSrtBtn.addEventListener('click', () => {
      if (!allLines.length) return;
      const content = PopupExporter.buildSrtContent(allLines);
      PopupExporter.downloadFile(
        content,
        `subtitles_${PopupExporter.formatDateForFile(new Date())}.srt`,
        'text/plain;charset=utf-8'
      );
    });
  }

  // Clear
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!currentTabId) return;
      chrome.tabs.sendMessage(currentTabId, { type: 'CLEAR_SUBTITLES' }, () => {
        allLines = [];
        refreshLines();
      });
    });
  }
});
