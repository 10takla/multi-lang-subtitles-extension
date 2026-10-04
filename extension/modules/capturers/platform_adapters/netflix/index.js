/**
 * Video Subtitles Capturer - Netflix Capturer Module
 * Captures subtitles via Netflix Player API:
 * `netflix.appContext.state.playerApp.getAPI().videoPlayer`
 * Supports:
 * - TTML / IMSC timed-text XML parsing
 * - Unencrypted sidecar WebVTT parsing
 * - Direct timedTextTrackList / player cues extraction
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML/XML tags and unescapes entities.
   */
  function cleanSubtitleText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Converts timestamp string to milliseconds.
   * Handles:
   * 00:00:01.200 (TTML / VTT)
   * 00:00:01,200 (SRT)
   * 1.2s, 1200ms (TTML metric times)
   * seconds numeric
   */
  function timeStringToMs(timeStr) {
    if (typeof timeStr === 'number') {
      return timeStr < 1000 ? Math.round(timeStr * 1000) : Math.round(timeStr);
    }
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const str = timeStr.trim();

    if (str.endsWith('ms')) {
      return Math.round(parseFloat(str));
    }
    if (str.endsWith('s')) {
      return Math.round(parseFloat(str) * 1000);
    }

    const normalized = str.replace(',', '.');
    const parts = normalized.split(':');

    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return Math.round((h * 3600 + m * 60 + s) * 1000);
    } else if (parts.length === 2) {
      const m = parseFloat(parts[0]) || 0;
      const s = parseFloat(parts[1]) || 0;
      return Math.round((m * 60 + s) * 1000);
    }

    const sec = parseFloat(normalized) || 0;
    return Math.round(sec * 1000);
  }

  /**
   * Parses TTML / IMSC timed-text XML into SubtitleCue objects.
   */
  function parseTtmlCues(xmlText) {
    if (!xmlText || typeof xmlText !== 'string') return [];
    const cues = [];

    // Match each <p ...>...</p> block
    const pBlockRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    let idx = 1;

    while ((match = pBlockRegex.exec(xmlText)) !== null) {
      const attrString = match[1];
      const rawText = match[2];

      const beginMatch = attrString.match(/\bbegin=["']([^"']+)["']/i);
      const endMatch = attrString.match(/\bend=["']([^"']+)["']/i);
      const durMatch = attrString.match(/\bdur=["']([^"']+)["']/i);

      if (!beginMatch) continue;

      const startMs = timeStringToMs(beginMatch[1]);
      let endMs = endMatch ? timeStringToMs(endMatch[1]) : null;
      if (endMs === null && durMatch) {
        endMs = startMs + timeStringToMs(durMatch[1]);
      }
      if (endMs === null || endMs <= startMs) {
        endMs = startMs + 3000;
      }

      const cleaned = cleanSubtitleText(rawText);
      if (cleaned) {
        cues.push({
          id: `netflix_ttml_${idx++}`,
          startMs: startMs,
          endMs: endMs,
          text: cleaned
        });
      }
    }

    return cues;
  }

  /**
   * Parses WebVTT timed text into SubtitleCue objects.
   */
  function parseWebVttCues(vttText) {
    if (!vttText || typeof vttText !== 'string') return [];
    const cues = [];
    const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let currentStartMs = null;
    let currentEndMs = null;
    let currentId = null;
    let textBuffer = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('-->')) {
        const parts = line.split('-->');
        currentStartMs = timeStringToMs(parts[0]);
        const endPart = parts[1].trim().split(/\s+/)[0];
        currentEndMs = timeStringToMs(endPart);
        textBuffer = [];
      } else if (currentStartMs !== null && line) {
        if (line.startsWith('NOTE') || line.startsWith('WEBVTT') || line.startsWith('STYLE')) {
          continue;
        }
        textBuffer.push(line);
      } else if (currentStartMs !== null && !line) {
        const raw = textBuffer.join(' ');
        const cleaned = cleanSubtitleText(raw);
        if (cleaned) {
          cues.push({
            id: currentId || `netflix_vtt_${cues.length + 1}`,
            startMs: currentStartMs,
            endMs: currentEndMs,
            text: cleaned
          });
        }
        currentStartMs = null;
        currentEndMs = null;
        currentId = null;
        textBuffer = [];
      } else if (line && !line.includes('-->') && currentStartMs === null) {
        if (!line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !line.startsWith('STYLE')) {
          currentId = line;
        }
      }
    }

    if (currentStartMs !== null && textBuffer.length > 0) {
      const cleaned = cleanSubtitleText(textBuffer.join(' '));
      if (cleaned) {
        cues.push({
          id: currentId || `netflix_vtt_${cues.length + 1}`,
          startMs: currentStartMs,
          endMs: currentEndMs,
          text: cleaned
        });
      }
    }

    return cues;
  }

  const NetflixCapturer = {
    name: 'netflix',

    /**
     * Resolves the Netflix video player API instance from window.netflix hierarchy.
     */
    getVideoPlayerApi: function(customGlobal) {
      const root = customGlobal || (typeof window !== 'undefined' ? window : null);
      if (!root || !root.netflix) return null;

      try {
        const appContext = root.netflix.appContext;
        const playerApp = appContext?.state?.playerApp;
        if (playerApp && typeof playerApp.getAPI === 'function') {
          const api = playerApp.getAPI();
          return api?.videoPlayer || null;
        }
      } catch (_) {}

      return null;
    },

    /**
     * Inspects Netflix Player API for active and available timed-text tracks.
     */
    detectPlayerApi: function(videoPlayerInstanceOrGlobal) {
      const videoPlayer = (videoPlayerInstanceOrGlobal && typeof videoPlayerInstanceOrGlobal.getAllPlayerSessionIds === 'function')
        ? videoPlayerInstanceOrGlobal
        : this.getVideoPlayerApi(videoPlayerInstanceOrGlobal);

      if (!videoPlayer) return [];

      const tracks = [];
      try {
        let player = null;
        if (typeof videoPlayer.getAllPlayerSessionIds === 'function') {
          const sessionIds = videoPlayer.getAllPlayerSessionIds();
          if (Array.isArray(sessionIds) && sessionIds.length > 0) {
            player = videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
          }
        }
        if (!player && typeof videoPlayer.getVideoPlayer === 'function') {
          player = videoPlayer.getVideoPlayer();
        }

        if (player && typeof player.getTimedTextTrackList === 'function') {
          const rawTracks = player.getTimedTextTrackList();
          if (Array.isArray(rawTracks)) {
            rawTracks.forEach((tr, idx) => {
              // Ignore "None" / disabled track option
              if (tr.isNone) return;

              const lang = tr.bcp47 || tr.language || 'en';
              const label = tr.displayName || tr.label || `Netflix Track ${idx + 1}`;
              const kind = tr.timedTextType === 'simplesdh' ? 'captions' : 'subtitles';

              // Extract downloadable URLs (TTML XML or WebVTT sidecar)
              let downloadUrl = null;
              let format = 'ttml';

              if (tr.ttDownloadables) {
                if (tr.ttDownloadables['xml'] && tr.ttDownloadables['xml'].urls && tr.ttDownloadables['xml'].urls[0]) {
                  downloadUrl = tr.ttDownloadables['xml'].urls[0].url;
                  format = 'ttml';
                } else if (tr.ttDownloadables['webvtt-lssdh-ios8'] && tr.ttDownloadables['webvtt-lssdh-ios8'].urls && tr.ttDownloadables['webvtt-lssdh-ios8'].urls[0]) {
                  downloadUrl = tr.ttDownloadables['webvtt-lssdh-ios8'].urls[0].url;
                  format = 'webvtt';
                } else {
                  // Fallback to first available downloadable format
                  const firstKey = Object.keys(tr.ttDownloadables)[0];
                  if (firstKey && tr.ttDownloadables[firstKey]?.urls?.[0]?.url) {
                    downloadUrl = tr.ttDownloadables[firstKey].urls[0].url;
                    format = firstKey.includes('vtt') ? 'webvtt' : 'ttml';
                  }
                }
              } else if (Array.isArray(tr.cdnUrls) && tr.cdnUrls.length > 0) {
                downloadUrl = tr.cdnUrls[0];
                format = downloadUrl.includes('.vtt') ? 'webvtt' : 'ttml';
              }

              tracks.push({
                id: `netflix:${tr.id || lang}_${idx}`,
                language: lang,
                label: label,
                kind: kind,
                format: format,
                url: downloadUrl,
                cues: tr.cues || null,
                trackRef: tr,
                source: 'player-api'
              });
            });
          }
        }
      } catch (_) {}

      return tracks;
    },

    /**
     * Parses TTML XML or WebVTT sidecar text into a SubtitleTrack.
     */
    parse: function(rawTextOrData, options = {}) {
      if (!rawTextOrData) return null;

      // 1. Raw string payload (TTML XML or WebVTT sidecar)
      if (typeof rawTextOrData === 'string') {
        const trimmed = rawTextOrData.trim();
        const isTtml = trimmed.includes('<tt') || trimmed.includes('<p begin=') || trimmed.includes('xmlns="http://www.w3.org/ns/ttml"');
        const isVtt = trimmed.startsWith('WEBVTT') || (trimmed.includes('-->') && !isTtml);

        let cues = [];
        let format = 'ttml';

        if (isTtml) {
          cues = parseTtmlCues(trimmed);
          format = 'ttml';
        } else if (isVtt) {
          cues = parseWebVttCues(trimmed);
          format = 'webvtt';
        }

        const lang = options.language || options.bcp47 || 'en';
        return {
          id: options.id || `netflix:${lang}`,
          language: lang,
          label: options.label || options.displayName || 'Netflix Subtitles',
          kind: options.kind || 'subtitles',
          format: format,
          source: 'player-api',
          live: false,
          completeness: 'full',
          cues: cues
        };
      }

      // 2. Structured track object with cues array
      if (typeof rawTextOrData === 'object') {
        const rawCues = rawTextOrData.cues || [];
        const cues = [];

        rawCues.forEach((c, idx) => {
          const startMs = typeof c.startMs === 'number'
            ? c.startMs
            : timeStringToMs(c.startTime !== undefined ? c.startTime : (c.begin || c.start || 0));
          const endMs = typeof c.endMs === 'number'
            ? c.endMs
            : timeStringToMs(c.endTime !== undefined ? c.endTime : (c.end || 0));
          const cleaned = cleanSubtitleText(c.text || c.content || '');

          if (cleaned) {
            cues.push({
              id: c.id || `netflix_cue_${idx + 1}`,
              startMs: startMs,
              endMs: endMs,
              text: cleaned
            });
          }
        });

        const lang = rawTextOrData.bcp47 || rawTextOrData.language || options.language || 'en';
        return {
          id: options.id || rawTextOrData.id || `netflix:${lang}`,
          language: lang,
          label: options.label || rawTextOrData.displayName || rawTextOrData.label || 'Netflix Subtitles',
          kind: rawTextOrData.timedTextType === 'simplesdh' ? 'captions' : (options.kind || 'subtitles'),
          format: options.format || rawTextOrData.format || 'ttml',
          source: 'player-api',
          live: false,
          completeness: cues.length > 0 ? 'full' : 'loaded-window',
          cues: cues
        };
      }

      return null;
    },

    /**
     * Captures subtitle tracks via Netflix Player API and sidecar timed-text files.
     */
    capture: async function(options = {}) {
      const tracks = [];
      const seenIds = new Set();

      const playerTracks = options.tracks || this.detectPlayerApi(options.videoPlayer || options.global);

      for (const pt of playerTracks) {
        if (pt.cues && Array.isArray(pt.cues) && pt.cues.length > 0) {
          const parsed = this.parse(pt, options);
          if (parsed && !seenIds.has(parsed.id)) {
            seenIds.add(parsed.id);
            tracks.push(parsed);
          }
        } else if (pt.url) {
          try {
            const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
            if (fetchFn) {
              const res = await fetchFn(pt.url);
              const text = typeof res === 'string' ? res : (res.text ? await res.text() : '');
              const parsed = this.parse(text, {
                id: pt.id,
                language: pt.language,
                label: pt.label,
                kind: pt.kind
              });
              if (parsed && !seenIds.has(parsed.id)) {
                seenIds.add(parsed.id);
                tracks.push(parsed);
              }
            }
          } catch (_) {}
        }
      }

      return tracks;
    }
  };

  global.__SC.capturers['netflix'] = NetflixCapturer;
  global.SubtitlesCapturers['netflix'] = NetflixCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NetflixCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
