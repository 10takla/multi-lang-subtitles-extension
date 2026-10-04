/**
 * Video Subtitles Capturer - Popup UI Renderer Module
 * Handles subtitle line listing, query filtering, and status display.
 */

(() => {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateStatus(uiElements, { active, message, time = '' }) {
    const { statusDot, statusText, statusTime } = uiElements;
    if (statusDot) {
      statusDot.classList.toggle('active', Boolean(active));
    }
    if (statusText) {
      statusText.textContent = message;
    }
    if (statusTime) {
      statusTime.textContent = time;
    }
  }

  function renderLines(uiElements, { lines, query = '', autoScroll = true }) {
    const { linesContainer, lineCountBadge } = uiElements;
    if (!linesContainer) return;

    const cleanQuery = query.toLowerCase().trim();
    const filtered = cleanQuery
      ? lines.filter((l) => l.text && l.text.toLowerCase().includes(cleanQuery))
      : lines;

    if (lineCountBadge) {
      lineCountBadge.textContent = filtered.length;
    }

    if (!filtered.length) {
      linesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div class="empty-title">${cleanQuery ? 'Ничего не найдено' : 'Субтитры пока не захвачены'}</div>
          <div class="empty-desc">${cleanQuery ? 'Попробуйте изменить поисковый запрос' : 'Включите воспроизведение видео с субтитрами на текущей вкладке'}</div>
        </div>
      `;
      return;
    }

    linesContainer.innerHTML = '';
    filtered.forEach((line, index) => {
      const isLatest = index === filtered.length - 1;
      const lineEl = document.createElement('div');
      lineEl.className = `line-item ${isLatest ? 'latest' : ''}`;
      if (line.id) lineEl.id = line.id;

      lineEl.innerHTML = `
        <span class="timestamp">${escapeHtml(line.videoTime || '00:00')}</span>
        <span class="line-text">${escapeHtml(line.text)}</span>
        <button class="line-copy-btn" title="Копировать строку">📋</button>
      `;

      const copyBtn = lineEl.querySelector('.line-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const copyText = `[${line.videoTime || '00:00'}] ${line.text}`;
          if (window.PopupExporter && window.PopupExporter.copyText) {
            window.PopupExporter.copyText(copyText).then(() => {
              copyBtn.textContent = '✓';
              setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
            });
          }
        });
      }

      linesContainer.appendChild(lineEl);
    });

    if (autoScroll) {
      linesContainer.scrollTop = linesContainer.scrollHeight;
    }
  }

  window.PopupUI = {
    escapeHtml,
    updateStatus,
    renderLines
  };
})();
