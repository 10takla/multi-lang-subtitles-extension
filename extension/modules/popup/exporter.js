/**
 * Video Subtitles Capturer - Popup Exporter Module
 * Handles file downloads, clipboard copying, and TXT/SRT formatting.
 */

(() => {
  function pad(n, z = 2) {
    return String(n).padStart(z, '0');
  }

  function formatDateForFile(d = new Date()) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function formatSrtTime(sec) {
    const total = Math.max(0, sec);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    const ms = Math.floor((total % 1) * 1000);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildTxtContent(lines) {
    return lines.map((l) => `[${l.videoTime}] ${l.text}`).join('\r\n');
  }

  function buildSrtContent(lines) {
    let srtContent = '';
    lines.forEach((item, index) => {
      const seq = index + 1;
      const startSec = item.rawTime || 0;
      const nextLine = lines[index + 1];
      const endSec = nextLine && nextLine.rawTime > startSec
        ? Math.min(nextLine.rawTime, startSec + 4)
        : startSec + 3;

      srtContent += `${seq}\r\n`;
      srtContent += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\r\n`;
      srtContent += `${item.text}\r\n\r\n`;
    });
    return srtContent;
  }

  function copyText(text) {
    return navigator.clipboard.writeText(text);
  }

  window.PopupExporter = {
    formatDateForFile,
    formatSrtTime,
    downloadFile,
    buildTxtContent,
    buildSrtContent,
    copyText
  };
})();
