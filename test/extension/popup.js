/**
 * Video Subtitles Capturer - Popup Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const lineCountBadge = document.getElementById('line-count');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusTime = document.getElementById('status-time');
  const searchInput = document.getElementById('search-input');
  const autoScrollBtn = document.getElementById('btn-autoscroll');
  const toggleWidgetBtn = document.getElementById('btn-toggle-widget');
  const linesContainer = document.getElementById('lines-container');
  const copyAllBtn = document.getElementById('btn-copy-all');
  const exportTxtBtn = document.getElementById('btn-export-txt');
  const exportSrtBtn = document.getElementById('btn-export-srt');
  const clearBtn = document.getElementById('btn-clear');

  // State
  let currentTabId = null;
  let allLines = [];
  let autoScroll = true;
  let searchQuery = '';

  // Get active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      updateStatus(false, 'Вкладка не найдена');
      return;
    }
    const tab = tabs[0];
    currentTabId = tab.id;

    // Check if URL is inspectable
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      updateStatus(false, 'Недоступно на системных страницах');
      return;
    }

    fetchSubtitles();
  });

  function updateStatus(active, message, time = '') {
    if (active) {
      statusDot.classList.add('active');
    } else {
      statusDot.classList.remove('active');
    }
    statusText.textContent = message;
    statusTime.textContent = time;
  }

  function fetchSubtitles() {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, { type: 'GET_SUBTITLES' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        updateStatus(false, 'Скрипт ожидает видео на странице');
        return;
      }

      allLines = response.lines || [];
      const hasVideo = response.videoDetected;
      const vTime = response.videoTime || '';

      if (hasVideo) {
        updateStatus(true, 'Видео отслеживается', vTime ? `⏱ ${vTime}` : '');
      } else {
        updateStatus(false, 'Видео не найдено');
      }

      renderLines();
    });
  }

  function renderLines() {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? allLines.filter(l => l.text.toLowerCase().includes(query))
      : allLines;

    lineCountBadge.textContent = filtered.length;

    if (!filtered.length) {
      linesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div class="empty-title">${query ? 'Ничего не найдено' : 'Субтитры пока не захвачены'}</div>
          <div class="empty-desc">${query ? 'Попробуйте изменить поисковый запрос' : 'Включите воспроизведение видео с субтитрами на текущей вкладке'}</div>
        </div>
      `;
      return;
    }

    linesContainer.innerHTML = '';
    filtered.forEach((line, index) => {
      const isLatest = index === filtered.length - 1;
      const lineEl = document.createElement('div');
      lineEl.className = `line-item ${isLatest ? 'latest' : ''}`;
      lineEl.id = line.id;

      lineEl.innerHTML = `
        <span class="timestamp">${line.videoTime}</span>
        <span class="line-text">${escapeHtml(line.text)}</span>
        <button class="line-copy-btn" title="Копировать строку">📋</button>
      `;

      // Copy single line
      lineEl.querySelector('.line-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`[${line.videoTime}] ${line.text}`).then(() => {
          const btn = lineEl.querySelector('.line-copy-btn');
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });

      linesContainer.appendChild(lineEl);
    });

    if (autoScroll) {
      linesContainer.scrollTop = linesContainer.scrollHeight;
    }
  }

  function appendOrUpdateLine(line, isNew) {
    if (isNew) {
      allLines.push(line);
    } else {
      const idx = allLines.findIndex(l => l.id === line.id);
      if (idx !== -1) {
        allLines[idx] = line;
      } else {
        allLines.push(line);
      }
    }
    renderLines();
  }

  // Listen for live updates from content script
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.tab && currentTabId && sender.tab.id !== currentTabId) return;

    if (message.type === 'NEW_SUBTITLE' && message.line) {
      appendOrUpdateLine(message.line, true);
      updateStatus(true, 'Захват субтитров...', `⏱ ${message.line.videoTime}`);
    } else if (message.type === 'UPDATE_SUBTITLE' && message.line) {
      appendOrUpdateLine(message.line, false);
    }
  });

  // Search filter
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderLines();
  });

  // Auto-scroll toggle
  autoScrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll;
    autoScrollBtn.classList.toggle('active', autoScroll);
    if (autoScroll) {
      linesContainer.scrollTop = linesContainer.scrollHeight;
    }
  });

  // Toggle widget on page
  toggleWidgetBtn.addEventListener('click', () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_WIDGET' });
  });

  // Copy all
  copyAllBtn.addEventListener('click', () => {
    if (!allLines.length) return;
    const textToCopy = allLines.map(l => `[${l.videoTime}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      const orig = copyAllBtn.textContent;
      copyAllBtn.textContent = '✓ Готово';
      setTimeout(() => { copyAllBtn.textContent = orig; }, 1500);
    });
  });

  // Download Helper
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export TXT
  exportTxtBtn.addEventListener('click', () => {
    if (!allLines.length) return;
    const content = allLines.map(l => `[${l.videoTime}] ${l.text}`).join('\r\n');
    downloadFile(content, `subtitles_${formatDateForFile(new Date())}.txt`, 'text/plain;charset=utf-8');
  });

  // Export SRT
  exportSrtBtn.addEventListener('click', () => {
    if (!allLines.length) return;
    let srtContent = '';
    allLines.forEach((item, index) => {
      const seq = index + 1;
      const startSec = item.rawTime || 0;
      // Default cue duration 3 seconds if not known
      const nextLine = allLines[index + 1];
      const endSec = (nextLine && nextLine.rawTime > startSec)
        ? Math.min(nextLine.rawTime, startSec + 4)
        : startSec + 3;

      const formatSrtTime = (sec) => {
        const total = Math.max(0, sec);
        const hrs = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        const secs = Math.floor(total % 60);
        const ms = Math.floor((total % 1) * 1000);
        const pad = (n, z = 2) => String(n).padStart(z, '0');
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
      };

      srtContent += `${seq}\r\n`;
      srtContent += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\r\n`;
      srtContent += `${item.text}\r\n\r\n`;
    });

    downloadFile(srtContent, `subtitles_${formatDateForFile(new Date())}.srt`, 'text/plain;charset=utf-8');
  });

  // Clear
  clearBtn.addEventListener('click', () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'CLEAR_SUBTITLES' }, () => {
      allLines = [];
      renderLines();
    });
  });

  function formatDateForFile(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
