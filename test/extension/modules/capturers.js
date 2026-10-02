/**
 * Video Subtitles Capturer - Capturers Module
 * Extracts subtitles from HTML5 video text tracks, YouTube timedtext cues, and DOM caption overlays.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.hookedVideos = new WeakSet();
  SC.hookedTracks = new WeakSet();
  SC.ytCaptionTracks = [];
  SC.ytActiveCues = [];
  SC.ytTrackCues = new Map();
  SC.customCaptionTracks = [];
  SC.customActiveCues = [];
  SC.customTrackCues = new Map();
  let ytCurrentLoadedTrackUrl = null;

  // Retrieve available video tracks from HTML5 video, YouTube, and detected player tracks
  SC.getAvailableVideoTracks = function() {
    const activeVideo = SC.getActiveVideo();
    const tracks = [];

    if (activeVideo && activeVideo.textTracks && activeVideo.textTracks.length > 0) {
      for (let i = 0; i < activeVideo.textTracks.length; i++) {
        const tr = activeVideo.textTracks[i];
        tracks.push({
          value: `track:${tr.language || i}`,
          label: `[Видео] ${tr.label || tr.language || 'Трек ' + (i + 1)}`
        });
      }
    }

    if (SC.customCaptionTracks && SC.customCaptionTracks.length > 0) {
      SC.customCaptionTracks.forEach((cTr, idx) => {
        tracks.push({
          value: cTr.id || `custom:${idx}`,
          label: `[Плеер] ${cTr.label || 'Субтитры ' + (idx + 1)}`
        });
      });
    }

    if (SC.ytCaptionTracks.length === 0) {
      SC.fetchYouTubeCaptionTracks();
    }

    if (SC.ytCaptionTracks && SC.ytCaptionTracks.length > 0) {
      SC.ytCaptionTracks.forEach((ytTr, idx) => {
        const trName = (ytTr.name && (ytTr.name.simpleText || (ytTr.name.runs && ytTr.name.runs[0] && ytTr.name.runs[0].text)))
          || ytTr.languageCode || `Трек ${idx + 1}`;
        tracks.push({
          value: `yt:${ytTr.languageCode || idx}`,
          label: `[YouTube] ${trName}`
        });
      });
    }

    return tracks;
  };

  // Get text for a specific track at a given playback timestamp
  SC.getTrackTextAtTime = function(trackId, time) {
    if (!trackId || trackId === 'auto') return null;

    if (trackId.startsWith('custom:')) {
      const cues = SC.customTrackCues.get(trackId);
      if (cues && cues.length > 0) {
        const match = cues.find(c => time >= c.start - 0.05 && time <= c.end + 0.05);
        if (match) return SC.cleanText(match.text);
      }
    } else if (trackId.startsWith('yt:')) {
      const cues = SC.ytTrackCues.get(trackId);
      if (cues && cues.length > 0) {
        const match = cues.find(c => time >= c.start - 0.05 && time <= c.end + 0.05);
        if (match) return SC.cleanText(match.text);
      }
    } else if (trackId.startsWith('track:')) {
      const activeVideo = SC.getActiveVideo();
      if (activeVideo && activeVideo.textTracks) {
        for (let i = 0; i < activeVideo.textTracks.length; i++) {
          const tr = activeVideo.textTracks[i];
          const val = `track:${tr.language || i}`;
          if (val === trackId && tr.cues) {
            for (let j = 0; j < tr.cues.length; j++) {
              const c = tr.cues[j];
              if (time >= c.startTime - 0.05 && time <= c.endTime + 0.05) {
                const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
                return SC.cleanText(raw);
              }
            }
          }
        }
      }
    }
    return null;
  };

  // Get upcoming cues for prefetching translations (ahead of current playback)
  SC.getUpcomingCues = function(currentTime = null, bufferSeconds = 60, targetTrackId = null) {
    const activeVideo = SC.getActiveVideo();
    const t = (currentTime !== null && currentTime !== undefined)
      ? currentTime
      : (activeVideo ? activeVideo.currentTime : 0);
    const maxTime = t + bufferSeconds;
    const list = [];
    const seen = new Set();

    // 1. YouTube cues
    if (targetTrackId && targetTrackId.startsWith('yt:')) {
      const cues = SC.ytTrackCues.get(targetTrackId);
      if (cues && cues.length > 0) {
        for (let i = 0; i < cues.length; i++) {
          const c = cues[i];
          if (c.end >= t && c.start <= maxTime) {
            const raw = SC.cleanText(c.text);
            if (raw && !seen.has(raw)) {
              seen.add(raw);
              list.push({ start: c.start, end: c.end, text: raw });
            }
          }
        }
      }
    } else if (SC.ytActiveCues && SC.ytActiveCues.length > 0 && (!targetTrackId || targetTrackId === 'auto')) {
      for (let i = 0; i < SC.ytActiveCues.length; i++) {
        const c = SC.ytActiveCues[i];
        if (c.end >= t && c.start <= maxTime) {
          const raw = SC.cleanText(c.text);
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            list.push({ start: c.start, end: c.end, text: raw });
          }
        }
      }
    }

    // 2. Custom & Playerjs cues
    if (targetTrackId && targetTrackId.startsWith('custom:')) {
      const cues = SC.customTrackCues.get(targetTrackId);
      if (cues && cues.length > 0) {
        for (let i = 0; i < cues.length; i++) {
          const c = cues[i];
          if (c.end >= t && c.start <= maxTime) {
            const raw = SC.cleanText(c.text);
            if (raw && !seen.has(raw)) {
              seen.add(raw);
              list.push({ start: c.start, end: c.end, text: raw });
            }
          }
        }
      }
    } else if (SC.customActiveCues && SC.customActiveCues.length > 0 && (!targetTrackId || targetTrackId === 'auto')) {
      for (let i = 0; i < SC.customActiveCues.length; i++) {
        const c = SC.customActiveCues[i];
        if (c.end >= t && c.start <= maxTime) {
          const raw = SC.cleanText(c.text);
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            list.push({ start: c.start, end: c.end, text: raw });
          }
        }
      }
    }

    // 3. HTML5 textTracks cues
    if (activeVideo && activeVideo.textTracks && activeVideo.textTracks.length > 0) {
      for (let i = 0; i < activeVideo.textTracks.length; i++) {
        const tr = activeVideo.textTracks[i];
        const val = `track:${tr.language || i}`;
        // If a specific track is requested, only collect cues from that track
        if (targetTrackId && targetTrackId !== 'auto' && targetTrackId !== val) {
          continue;
        }

        if (tr.cues) {
          for (let j = 0; j < tr.cues.length; j++) {
            const c = tr.cues[j];
            if (c.endTime >= t && c.startTime <= maxTime) {
              const raw = SC.cleanText(c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : ''));
              if (raw && !seen.has(raw)) {
                seen.add(raw);
                list.push({
                  start: c.startTime,
                  end: c.endTime,
                  text: raw
                });
              }
            }
          }
        }
      }
    }

    return list;
  };

  // Bridge between YouTube page context (MAIN world) and extension (ISOLATED world)
  let ytBridgeInjected = false;
  SC.initYouTubeBridge = function() {
    if (!location.hostname.includes('youtube.com') || ytBridgeInjected) return;
    ytBridgeInjected = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.type !== '__SC_YT_TRACKS__') return;
      const tracks = event.data.tracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        SC.ytCaptionTracks = tracks;
        const activeVideo = SC.getActiveVideo();
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }
        if (SC.renderLanguageList) SC.renderLanguageList();

        // Auto-load primary track timedtext if not loaded yet
        const primaryTrack = tracks[0];
        const primaryTrackId = `yt:${primaryTrack.languageCode || 0}`;
        if (!SC.ytTrackCues.has(primaryTrackId)) {
          SC.loadYouTubeTimedText(primaryTrack, primaryTrackId);
        }
      }
    });

    try {
      const script = document.createElement('script');
      script.textContent = `
        (() => {
          function getTracks() {
            try {
              const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (player && typeof player.getPlayerResponse === 'function') {
                const resp = player.getPlayerResponse();
                const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(tracks) && tracks.length > 0) return tracks;
              }
              const initTracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
              if (Array.isArray(initTracks) && initTracks.length > 0) return initTracks;
            } catch (_) {}
            return null;
          }

          function broadcast() {
            const tracks = getTracks();
            if (tracks && tracks.length > 0) {
              window.postMessage({ type: '__SC_YT_TRACKS__', tracks: JSON.parse(JSON.stringify(tracks)) }, '*');
            }
          }

          window.addEventListener('message', (e) => {
            if (e.data && e.data.type === '__SC_REQ_YT_TRACKS__') broadcast();
          });
          document.addEventListener('yt-navigate-finish', () => setTimeout(broadcast, 500));
          document.addEventListener('yt-page-data-updated', () => setTimeout(broadcast, 500));

          let attempts = 0;
          const timer = setInterval(() => {
            attempts++;
            const t = getTracks();
            if (t && t.length > 0) {
              broadcast();
              clearInterval(timer);
            } else if (attempts > 30) {
              clearInterval(timer);
            }
          }, 500);
          broadcast();
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (_) {}
  };

  // Extract YouTube caption tracks from player APIs or bridge
  let lastYtFetchTime = 0;
  SC.fetchYouTubeCaptionTracks = function() {
    if (!location.hostname.includes('youtube.com')) return [];
    SC.initYouTubeBridge();
    if (SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    const now = Date.now();
    if (now - lastYtFetchTime >= 1000) {
      lastYtFetchTime = now;
      try {
        window.postMessage({ type: '__SC_REQ_YT_TRACKS__' }, '*');
      } catch (_) {}
    }

    return SC.ytCaptionTracks || [];
  };

  // Load YouTube timed text cues via JSON3 format
  SC.loadYouTubeTimedText = async function(track, trackId = null) {
    if (!track || !track.baseUrl) return;
    const tId = trackId || `yt:${track.languageCode || ''}`;

    try {
      const url = track.baseUrl.includes('fmt=') ? track.baseUrl : track.baseUrl + '&fmt=json3';
      const res = await fetch(url);
      const data = await res.json();

      if (data && Array.isArray(data.events)) {
        const cues = data.events
          .filter(e => e.segs && e.segs.length > 0)
          .map(e => ({
            start: (e.tStartMs || 0) / 1000,
            end: ((e.tStartMs || 0) + (e.dDurationMs || 0)) / 1000,
            text: e.segs.map(s => s.utf8 || '').join('').trim()
          }))
          .filter(c => c.text);

        SC.ytTrackCues.set(tId, cues);

        const firstTrack = SC.state.languages.find(l => (l.mode === 'track' || l.type === 'source') && (l.trackId || l.lang));
        const firstTrackId = (firstTrack && (firstTrack.trackId || firstTrack.lang)) || 'auto';
        if (firstTrackId === tId || firstTrackId === 'auto') {
          SC.ytActiveCues = cues;
        }

        const activeVideo = SC.getActiveVideo();
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }

        SC.state.lines.forEach(l => {
          if (!l.trackTexts) l.trackTexts = {};
          if (!l.trackTexts[tId]) {
            const match = cues.find(c => l.rawTime >= c.start && l.rawTime <= c.end);
            if (match) l.trackTexts[tId] = match.text;
          }
        });

        SC.state.languages.forEach(item => {
          if (item.sourceFrom === tId && SC.retranslateItem) {
            SC.retranslateItem(item);
          }
        });

        if (SC.renderAllLines) {
          SC.renderAllLines();
        }

        if (SC.prefetchUpcomingTranslations) {
          const v = SC.getActiveVideo();
          SC.prefetchUpcomingTranslations(v ? v.currentTime : 0, 60);
        }
      }
    } catch (err) {
      console.warn('Timed text load error:', err);
    }
  };

  // Parse WebVTT subtitle text into cue objects
  SC.parseVttCues = function(vttText) {
    if (!vttText || typeof vttText !== 'string') return [];
    const cues = [];
    const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let currentStart = null;
    let currentEnd = null;
    let currentTexts = [];

    const timeToSecs = (str) => {
      const parts = str.trim().split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      }
      return 0;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const times = line.split('-->');
        currentStart = timeToSecs(times[0]);
        const endStr = times[1].trim().split(/\s+/)[0];
        currentEnd = timeToSecs(endStr);
        currentTexts = [];
      } else if (currentStart !== null && line) {
        if (line.startsWith('NOTE') || line.startsWith('WEBVTT') || /^\d+$/.test(line)) continue;
        currentTexts.push(line);
      } else if (currentStart !== null && !line) {
        if (currentTexts.length > 0) {
          const cueText = SC.cleanText(currentTexts.join(' '));
          if (cueText) {
            cues.push({ start: currentStart, end: currentEnd, text: cueText });
          }
        }
        currentStart = null;
        currentEnd = null;
        currentTexts = [];
      }
    }
    if (currentStart !== null && currentTexts.length > 0) {
      const cueText = SC.cleanText(currentTexts.join(' '));
      if (cueText) {
        cues.push({ start: currentStart, end: currentEnd, text: cueText });
      }
    }
    return cues;
  };

  // Fetch and parse WebVTT track from external or inline URL
  SC.loadCustomSubtitleUrl = async function(url, trackId, label = 'Субтитры') {
    if (!url || SC.customTrackCues.has(trackId)) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();
      const cues = SC.parseVttCues(text);
      if (cues && cues.length > 0) {
        SC.customTrackCues.set(trackId, cues);
        if (!SC.customActiveCues || SC.customActiveCues.length === 0) {
          SC.customActiveCues = cues;
        }
        const activeVideo = SC.getActiveVideo();
        if (activeVideo && SC.registerVideoWithSubtitles) {
          SC.registerVideoWithSubtitles(activeVideo);
        }
        if (SC.renderLanguageList) SC.renderLanguageList();
        if (SC.prefetchUpcomingTranslations) {
          SC.prefetchUpcomingTranslations(activeVideo ? activeVideo.currentTime : 0, 60);
        }
      }
    } catch (_) {}
  };

  // Scan page scripts and elements for embedded or configured subtitle files (Playerjs, etc.)
  let lastScriptScanCount = 0;
  SC.scanPageForSubtitleTracks = function() {
    const scripts = document.querySelectorAll('script');
    if (scripts.length === lastScriptScanCount && SC.customCaptionTracks.length > 0) return;
    lastScriptScanCount = scripts.length;

    scripts.forEach((s, idx) => {
      const content = s.textContent || '';
      if (!content || (!content.includes('subtitle') && !content.includes('.vtt') && !content.includes('.srt'))) return;

      const matches = content.matchAll(/subtitle[s]?\s*:\s*['"]([^'"]+)['"]/gi);
      for (const m of matches) {
        const raw = m[1];
        const parts = raw.split(',');
        parts.forEach((p, pIdx) => {
          let label = 'Субтитры';
          let url = p.trim();
          const titleMatch = p.match(/\[(.*?)\](.*)/);
          if (titleMatch) {
            label = titleMatch[1].trim();
            url = titleMatch[2].trim();
          }
          if (url && (url.includes('.vtt') || url.includes('.srt') || url.startsWith('http') || url.startsWith('/'))) {
            const trackId = `custom:${idx}_${pIdx}`;
            if (!SC.customCaptionTracks.some(t => t.url === url)) {
              SC.customCaptionTracks.push({ id: trackId, label, url });
              SC.loadCustomSubtitleUrl(url, trackId, label);
            }
          }
        });
      }
    });

    const tracks = document.querySelectorAll('track[src]');
    tracks.forEach((tr, idx) => {
      const src = tr.src || tr.getAttribute('src');
      if (src) {
        const trackId = `custom:track_${idx}`;
        const label = tr.label || tr.srclang || `Дорожка ${idx + 1}`;
        if (!SC.customCaptionTracks.some(t => t.url === src)) {
          SC.customCaptionTracks.push({ id: trackId, label, url: src });
          SC.loadCustomSubtitleUrl(src, trackId, label);
        }
      }
    });
  };

  // Universal DOM subtitle extractor (Playerjs, Video.js, JW, Netflix, etc.)
  SC.getDOMSubtitleText = function() {
    if (location.hostname.includes('youtube.com')) {
      const visualLines = document.querySelectorAll('.caption-visual-line');
      if (visualLines.length > 0) {
        const texts = Array.from(visualLines).map(l => (l.textContent || '').trim()).filter(Boolean);
        if (texts.length > 0) return texts.join(' ');
      }
      const segments = document.querySelectorAll('.ytp-caption-segment');
      if (segments.length > 0) {
        const fullText = Array.from(segments).map(s => s.textContent || '').join(' ').trim();
        if (fullText) return fullText;
      }
    }

    const selectors = [
      '[id*="_subtitle"]',
      'pjsdiv[id*="subtitle"]',
      '[class*="playerjs_subtitle"]',
      '.playerjs_subtitle_word',
      '.vjs-text-track-cue',
      '.jw-text-track-cue',
      '.shaka-text-container',
      '.player-timedtext-text-container',
      '.plyr__caption',
      '.dplayer-subtitle',
      '.art-subtitle',
      '.mejs__captions-text',
      '[class*="subtitle-cue"]',
      '[class*="subtitle-line"]',
      '[class*="subtitle-text"]',
      '[class*="caption-text"]',
      '[class*="caption-window"]'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const sel = selectors[i];
      const els = document.querySelectorAll(sel);
      for (let j = 0; j < els.length; j++) {
        const el = els[j];
        if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length < 2) continue;
        if (text.includes('Скорость') || text.includes('Качество') || text.startsWith('Субтитры\n') || text === 'Вкл.' || text === 'Выкл.') {
          continue;
        }
        return text.replace(/\s+/g, ' ');
      }
    }
    return null;
  };

  // Add a newly captured subtitle line into state and triggers rendering/translations
  SC.addSubtitleLine = function(rawText, videoTimestamp = null) {
    const text = SC.cleanText(rawText);
    if (!text) return;

    const activeVideo = SC.getActiveVideo();
    if (activeVideo && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(activeVideo);
    }
    const currentVideoTime = videoTimestamp !== null
      ? videoTimestamp
      : (activeVideo ? activeVideo.currentTime : 0);

    const formattedTime = SC.formatTime(currentVideoTime);
    const now = Date.now();

    const lastLine = SC.state.lines.length > 0 ? SC.state.lines[SC.state.lines.length - 1] : null;

    // Check if identical to the last line
    if (lastLine && lastLine.text === text) {
      if ((now - lastLine.timestamp) < 6000 || Math.abs(currentVideoTime - lastLine.rawTime) < 8) {
        lastLine.timestamp = now;
        SC.state.currentActiveLine = lastLine;
        return;
      }
    }

    // Handle streaming / incremental captions
    if (
      lastLine &&
      text.startsWith(lastLine.text) &&
      (now - lastLine.timestamp) < 3000
    ) {
      lastLine.text = text;
      lastLine.translations = {};
      if (!lastLine.trackTexts) lastLine.trackTexts = {};

      SC.state.languages.forEach(item => {
        const neededTrack = (item.mode === 'track' || item.type === 'source')
          ? (item.trackId || item.lang)
          : ((item.sourceTrack && item.sourceTrack !== 'auto') ? item.sourceTrack : item.sourceFrom);
        if (neededTrack && neededTrack !== 'auto') {
          const txt = SC.getTrackTextAtTime(neededTrack, currentVideoTime);
          if (txt) lastLine.trackTexts[neededTrack] = txt;
        }
      });

      SC.state.lastAddedText = text;
      SC.state.lastAddedTime = now;

      if (SC.translateLine) SC.translateLine(lastLine);
      SC.state.currentActiveLine = lastLine;
      if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      SC.broadcastLineUpdate(lastLine, false);
      return;
    }

    // Skip if incoming text is just a prefix of an already recorded full sentence
    if (
      lastLine &&
      lastLine.text.startsWith(text) &&
      (now - lastLine.timestamp) < 3000
    ) {
      return;
    }

    // Create new line entry with multi-language & track texts support
    const newLine = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      text: text,
      videoTime: formattedTime,
      rawTime: currentVideoTime,
      timestamp: now,
      trackTexts: {},
      translations: {}
    };

    SC.state.languages.forEach(item => {
      const neededTrack = (item.mode === 'track' || item.type === 'source')
        ? (item.trackId || item.lang)
        : ((item.sourceTrack && item.sourceTrack !== 'auto') ? item.sourceTrack : item.sourceFrom);
      if (neededTrack && neededTrack !== 'auto') {
        const txt = SC.getTrackTextAtTime(neededTrack, currentVideoTime);
        if (txt) newLine.trackTexts[neededTrack] = txt;
      }
    });

    SC.state.lines.push(newLine);

    // Cap lines list to MAX_LINES to avoid memory and DOM bloat
    const maxLines = SC.MAX_LINES || 250;
    if (SC.state.lines.length > maxLines) {
      const removed = SC.state.lines.splice(0, SC.state.lines.length - maxLines);
      if (SC.removeLinesFromDOM) {
        SC.removeLinesFromDOM(removed);
      }
    }
    SC.state.lastAddedText = text;
    SC.state.lastAddedTime = now;
    SC.state.lastVideoTime = currentVideoTime;
    SC.state.activeStreamingLineId = newLine.id;
    SC.state.currentActiveLine = newLine;

    // Trigger translations
    if (SC.translateLine) SC.translateLine(newLine);

    // Render active subtitle on video overlay
    if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();

    // Auto-fade active on-video overlay after 5 seconds
    if (SC.state.overlayFadeTimeout) clearTimeout(SC.state.overlayFadeTimeout);
    SC.state.overlayFadeTimeout = setTimeout(() => {
      if (SC.state.currentActiveLine === newLine) {
        SC.state.currentActiveLine = null;
        if (SC.updateVideoOverlayContent) SC.updateVideoOverlayContent();
      }
    }, 5000);

    // Notify background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SUBTITLE_ADDED', line: newLine }).catch(() => {});
      }
    } catch (_) {}

    SC.broadcastLineUpdate(newLine, true);
  };

  // Native subtitles suppression no-op (Rule 24: extension does not alter native subtitle state)
  SC.suppressNativeSubtitles = function() {};

  // Hook into HTML5 TextTrack
  SC.hookTrack = function(video, track) {
    if (!track || SC.hookedTracks.has(track)) return;
    SC.hookedTracks.add(track);

    if (video && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(video);
    }

    // Keep track in 'hidden' mode if disabled so cues are active without showing native subtitles,
    // but DO NOT alter 'showing' mode (Rule 24: independence from native subtitles).
    if (track.mode === 'disabled') {
      try { track.mode = 'hidden'; } catch (_) {}
    }

    const handleCueChange = () => {
      const primarySelector = SC.state.languages.find(l => l.visible && (l.mode === 'track' || l.type === 'source'))
        || SC.state.languages[0];
      const primaryTrackVal = primarySelector ? (primarySelector.trackId || primarySelector.sourceTrack || primarySelector.lang || 'auto') : 'auto';
      const trackVal = `track:${track.language || 0}`;
      if (primaryTrackVal !== 'auto' && primaryTrackVal !== trackVal) {
        return;
      }

      if (track.activeCues && track.activeCues.length > 0) {
        for (let i = 0; i < track.activeCues.length; i++) {
          const cue = track.activeCues[i];
          const raw = cue.text || (cue.getCueAsHTML ? cue.getCueAsHTML().textContent : '');
          if (!raw) continue;
          SC.addSubtitleLine(raw, video.currentTime);
        }
      }
    };

    track.addEventListener('cuechange', handleCueChange);
    handleCueChange();

    if (SC.prefetchUpcomingTranslations) {
      SC.prefetchUpcomingTranslations(video.currentTime, 60);
    }
  };

  // Hook into HTML5 video element
  SC.hookVideo = function(video) {
    if (!video || SC.hookedVideos.has(video)) return;
    SC.hookedVideos.add(video);

    if (video.textTracks && video.textTracks.length > 0 && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(video);
    }

    if (SC.scanPageForSubtitleTracks) {
      SC.scanPageForSubtitleTracks();
    }

    if (location.hostname.includes('youtube.com')) {
      const tracks = SC.fetchYouTubeCaptionTracks();
      if (tracks.length > 0) {
        SC.loadYouTubeTimedText(tracks[0], `yt:${tracks[0].languageCode || 0}`);
        if (SC.renderLanguageList) SC.renderLanguageList();
      }
    }

    const ensureHiddenMode = (tr) => {
      if (tr && tr.mode === 'disabled') {
        try { tr.mode = 'hidden'; } catch (_) {}
      }
    };

    // Timeupdate listener for direct YouTube timedtext cues, HTML5 textTracks, and prefetching
    let lastPrefetchTime = -999;
    let lastMatchedCueText = null;
    let lastMatchedCueStart = -1;

    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      let matchedText = null;
      let matchedStart = null;

      // 1. YouTube direct timedtext cues
      if (SC.ytActiveCues.length > 0) {
        const match = SC.ytActiveCues.find(c => t >= c.start && t <= c.end);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 2. Custom & Playerjs parsed cues
      if (!matchedText && SC.customActiveCues && SC.customActiveCues.length > 0) {
        const match = SC.customActiveCues.find(c => t >= c.start && t <= c.end);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 3. HTML5 TextTrack cues (ensures capture even when video subtitles are toggled off in player)
      if (!matchedText && video.textTracks && video.textTracks.length > 0) {
        const primarySelector = SC.state.languages.find(l => l.visible && (l.mode === 'track' || l.type === 'source'))
          || SC.state.languages[0];
        const primaryTrackVal = primarySelector ? (primarySelector.trackId || primarySelector.sourceTrack || primarySelector.lang || 'auto') : 'auto';

        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          ensureHiddenMode(tr);

          const trackVal = `track:${tr.language || i}`;
          if (primaryTrackVal !== 'auto' && primaryTrackVal !== trackVal) {
            continue;
          }

          // Fast path: check native activeCues first
          if (tr.activeCues && tr.activeCues.length > 0) {
            const c = tr.activeCues[0];
            matchedText = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
            matchedStart = c.startTime;
            break;
          }

          // Fallback: search tr.cues
          if (tr.cues && tr.cues.length > 0) {
            for (let j = 0; j < tr.cues.length; j++) {
              const c = tr.cues[j];
              if (t >= c.startTime && t <= c.endTime) {
                matchedText = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
                matchedStart = c.startTime;
                break;
              }
            }
          }
          if (matchedText) break;
        }
      }

      // 4. Live DOM subtitle text fallback (Playerjs, Video.js, JW Player, etc.)
      if (!matchedText && SC.getDOMSubtitleText) {
        const domText = SC.getDOMSubtitleText();
        if (domText) {
          matchedText = domText;
          matchedStart = t;
        }
      }

      // Only invoke addSubtitleLine when active cue text or start time actually changes
      if (matchedText) {
        if (matchedText !== lastMatchedCueText || Math.abs(matchedStart - lastMatchedCueStart) > 0.05) {
          lastMatchedCueText = matchedText;
          lastMatchedCueStart = matchedStart;
          SC.addSubtitleLine(matchedText, matchedStart);
        }
      } else {
        if (lastMatchedCueText !== null) {
          lastMatchedCueText = null;
          lastMatchedCueStart = -1;
        }
      }

      // Prefetch upcoming translations periodically (every ~3.5 seconds)
      if (Math.abs(t - lastPrefetchTime) >= 3.5) {
        lastPrefetchTime = t;
        if (SC.prefetchUpcomingTranslations) {
          SC.prefetchUpcomingTranslations(t, 45);
        }
      }
    });

    if (SC.videoResizeObserver) {
      try { SC.videoResizeObserver.observe(video); } catch (_) {}
    }
    video.addEventListener('play', () => {
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      if (SC.prefetchUpcomingTranslations) SC.prefetchUpcomingTranslations(video.currentTime, 45);
    });
    video.addEventListener('seeked', () => {
      lastMatchedCueText = null;
      lastMatchedCueStart = -1;
      if (SC.scheduleUpdatePositions) SC.scheduleUpdatePositions();
      if (SC.prefetchUpcomingTranslations) SC.prefetchUpcomingTranslations(video.currentTime, 45);
    });

    // Hook existing textTracks
    if (video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        ensureHiddenMode(tr);
        SC.hookTrack(video, tr);
      }
      video.textTracks.addEventListener('addtrack', (e) => {
        if (e.track) {
          ensureHiddenMode(e.track);
          SC.hookTrack(video, e.track);
        }
      });
      video.textTracks.addEventListener('change', () => {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          ensureHiddenMode(tr);
          SC.hookTrack(video, tr);
        }
      });
    }

    // Observe <track> child elements
    const trackObserver = new MutationObserver(() => {
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          ensureHiddenMode(tr);
          SC.hookTrack(video, tr);
        }
      }
    });
    trackObserver.observe(video, { childList: true });
  };

  // Scan page for video elements and subtitle tracks
  SC.scanForVideos = function() {
    if (SC.scanPageForSubtitleTracks) {
      SC.scanPageForSubtitleTracks();
    }
    const videos = document.querySelectorAll('video');
    videos.forEach(SC.hookVideo);
  };

  // DOM-Based Subtitle Detection (YouTube, Netflix, player caption windows, Playerjs)
  SC.setupDOMSubtitleObserver = function() {
    let ytDebounceTimer = null;

    function checkYouTubeCaptions() {
      if (SC.ytActiveCues && SC.ytActiveCues.length > 0) return;
      const visualLines = document.querySelectorAll('.caption-visual-line');
      const video = document.querySelector('video') || SC.getActiveVideo();
      const videoTime = video ? video.currentTime : null;

      if (visualLines.length > 0) {
        visualLines.forEach(lineEl => {
          const lineText = (lineEl.textContent || '').trim();
          if (lineText) {
            SC.addSubtitleLine(lineText, videoTime);
          }
        });
      } else {
        const segments = document.querySelectorAll('.ytp-caption-segment');
        if (segments.length > 0) {
          const fullText = Array.from(segments).map(s => s.textContent || '').join(' ').trim();
          if (fullText) {
            SC.addSubtitleLine(fullText, videoTime);
          }
        }
      }
    }

    const observer = new MutationObserver((mutations) => {
      let checkYT = false;
      let checkVideos = false;
      let checkGeneric = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'VIDEO' || (node.firstElementChild && node.querySelector('video'))) {
                checkVideos = true;
              }
              const cls = typeof node.className === 'string' ? node.className : '';
              const id = typeof node.id === 'string' ? node.id : '';
              if (
                (cls && (cls.includes('caption') || cls.includes('subtitle') || cls.includes('cue') || cls.includes('timedtext') || cls.includes('playerjs'))) ||
                (id && (id.includes('caption') || id.includes('subtitle') || id.includes('cue') || id.includes('timedtext') || id.includes('pjs_')))
              ) {
                checkYT = true;
                checkGeneric = true;
              }
            }
          }
        } else if (m.type === 'characterData') {
          const parent = m.target.parentElement;
          if (parent) {
            const cls = typeof parent.className === 'string' ? parent.className : '';
            const id = typeof parent.id === 'string' ? parent.id : '';
            if (
              (cls && (cls.includes('caption') || cls.includes('subtitle') || cls.includes('cue') || cls.includes('timedtext') || cls.includes('playerjs'))) ||
              (id && (id.includes('caption') || id.includes('subtitle') || id.includes('cue') || id.includes('timedtext') || id.includes('pjs_')))
            ) {
              checkYT = true;
              checkGeneric = true;
            }
          }
        }
      }

      if (checkVideos) {
        SC.scanForVideos();
      }

      if (checkYT) {
        if (!ytDebounceTimer) {
          ytDebounceTimer = setTimeout(() => {
            ytDebounceTimer = null;
            checkYouTubeCaptions();
          }, 150);
        }
      }

      if (checkGeneric && SC.getDOMSubtitleText) {
        const text = SC.getDOMSubtitleText();
        if (text && text.length > 1) {
          const video = SC.getActiveVideo();
          SC.addSubtitleLine(text, video ? video.currentTime : null);
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };
})();
