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
  let ytCurrentLoadedTrackUrl = null;

  // Retrieve available video tracks from HTML5 video and YouTube
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

    if (trackId.startsWith('yt:')) {
      const cues = SC.ytTrackCues.get(trackId);
      if (cues && cues.length > 0) {
        const match = cues.find(c => time >= c.start && time <= c.end);
        if (match) return match.text;
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
              if (time >= c.startTime && time <= c.endTime) {
                return c.text;
              }
            }
          }
        }
      }
    }
    return null;
  };

  // Auto-enable YouTube subtitles without requiring manual UI click
  SC.tryEnableYouTubeSubtitles = function(video) {
    if (!location.hostname.includes('youtube.com')) return;
    const ccButtons = [
      document.querySelector('.ytp-subtitles-button'),
      video?.closest('.html5-video-player')?.querySelector('.ytp-subtitles-button'),
      document.querySelector('ytd-player .ytp-subtitles-button'),
      document.querySelector('ytd-shorts .ytp-subtitles-button'),
      document.querySelector('button[aria-label*="субтитр" i], button[aria-label*="subtitles" i], button[aria-label*="captions" i]')
    ];
    for (const btn of ccButtons) {
      if (btn && btn.getAttribute('aria-pressed') === 'false') {
        try {
          btn.click();
          break;
        } catch (_) {}
      }
    }
  };

  // Extract YouTube caption tracks from ytInitialPlayerResponse in page scripts
  SC.fetchYouTubeCaptionTracks = function() {
    if (!location.hostname.includes('youtube.com')) return [];
    if (SC.ytCaptionTracks.length > 0) return SC.ytCaptionTracks;

    try {
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const txt = scripts[i].textContent;
        if (txt && txt.includes('"captionTracks"')) {
          const match = txt.match(/"captionTracks":\s*(\[[^\]]+\])/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              SC.ytCaptionTracks = parsed;
              return SC.ytCaptionTracks;
            }
          }
        }
      }
    } catch (_) {}
    return [];
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

        const sourceItem = SC.state.languages.find(l => l.type === 'source');
        if (!sourceItem || sourceItem.lang === tId || sourceItem.lang === 'auto') {
          SC.ytActiveCues = cues;
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
      }
    } catch (err) {
      SC.tryEnableYouTubeSubtitles();
    }
  };

  // Add a newly captured subtitle line into state and triggers rendering/translations
  SC.addSubtitleLine = function(rawText, videoTimestamp = null) {
    const text = SC.cleanText(rawText);
    if (!text) return;

    const activeVideo = SC.getActiveVideo();
    const currentVideoTime = videoTimestamp !== null
      ? videoTimestamp
      : (activeVideo ? activeVideo.currentTime : 0);

    const formattedTime = SC.formatTime(currentVideoTime);
    const now = Date.now();

    const lastLine = SC.state.lines.length > 0 ? SC.state.lines[SC.state.lines.length - 1] : null;

    // Check if identical to the last line
    if (lastLine && lastLine.text === text && (now - lastLine.timestamp) < 4000) {
      return;
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
        const neededTrack = (item.mode === 'track' ? item.lang : (item.sourceFrom && item.sourceFrom !== 'auto' ? item.sourceFrom : null));
        if (neededTrack) {
          const txt = SC.getTrackTextAtTime(neededTrack, currentVideoTime);
          if (txt) lastLine.trackTexts[neededTrack] = txt;
        }
      });

      SC.state.lastAddedText = text;
      SC.state.lastAddedTime = now;

      if (SC.translateLine) SC.translateLine(lastLine);
      if (SC.updateLineInDOM) SC.updateLineInDOM(lastLine);
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
      const neededTrack = (item.mode === 'track' ? item.lang : (item.sourceFrom && item.sourceFrom !== 'auto' ? item.sourceFrom : null));
      if (neededTrack) {
        const txt = SC.getTrackTextAtTime(neededTrack, currentVideoTime);
        if (txt) newLine.trackTexts[neededTrack] = txt;
      }
    });

    SC.state.lines.push(newLine);
    SC.state.lastAddedText = text;
    SC.state.lastAddedTime = now;
    SC.state.lastVideoTime = currentVideoTime;
    SC.state.activeStreamingLineId = newLine.id;
    SC.state.currentActiveLine = newLine;

    // Trigger translations
    if (SC.translateLine) SC.translateLine(newLine);

    // Render into widget and overlay
    if (SC.appendLineToDOM) SC.appendLineToDOM(newLine);
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
      chrome.runtime.sendMessage({ type: 'SUBTITLE_ADDED', line: newLine }).catch(() => {});
    } catch (_) {}

    SC.broadcastLineUpdate(newLine, true);
  };

  // Hook into HTML5 TextTrack
  SC.hookTrack = function(video, track) {
    if (!track || SC.hookedTracks.has(track)) return;
    SC.hookedTracks.add(track);

    if (track.mode === 'disabled') {
      try { track.mode = 'hidden'; } catch (_) {}
    }

    const handleCueChange = () => {
      if (track.activeCues && track.activeCues.length > 0) {
        for (let i = 0; i < track.activeCues.length; i++) {
          const cue = track.activeCues[i];
          const raw = cue.text || (cue.getCueAsHTML ? cue.getCueAsHTML().textContent : '');
          if (!raw) continue;

          const lines = raw.split(/\r\n|\r|\n/);
          lines.forEach(l => {
            if (l.trim()) {
              SC.addSubtitleLine(l, video.currentTime);
            }
          });
        }
      }
    };

    track.addEventListener('cuechange', handleCueChange);
    handleCueChange();
  };

  // Hook into HTML5 video element
  SC.hookVideo = function(video) {
    if (!video || SC.hookedVideos.has(video)) return;
    SC.hookedVideos.add(video);

    if (location.hostname.includes('youtube.com')) {
      SC.tryEnableYouTubeSubtitles(video);
      const tracks = SC.fetchYouTubeCaptionTracks();
      if (tracks.length > 0) {
        SC.loadYouTubeTimedText(tracks[0], `yt:${tracks[0].languageCode || 0}`);
        if (SC.renderLanguageList) SC.renderLanguageList();
      }
    }

    // Timeupdate listener for direct YouTube timedtext cues
    video.addEventListener('timeupdate', () => {
      if (SC.ytActiveCues.length > 0) {
        const t = video.currentTime;
        const match = SC.ytActiveCues.find(c => t >= c.start && t <= c.end);
        if (match) {
          SC.addSubtitleLine(match.text, match.start);
        }
      }
    });

    if (SC.videoResizeObserver) {
      try { SC.videoResizeObserver.observe(video); } catch (_) {}
    }
    video.addEventListener('play', () => { if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition(); });
    video.addEventListener('seeked', () => { if (SC.updateVideoOverlayPosition) SC.updateVideoOverlayPosition(); });

    // Hook existing textTracks
    if (video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        if (tr.mode === 'disabled') {
          try { tr.mode = 'hidden'; } catch (_) {}
        }
        SC.hookTrack(video, tr);
      }
      video.textTracks.addEventListener('addtrack', (e) => {
        if (e.track && e.track.mode === 'disabled') {
          try { e.track.mode = 'hidden'; } catch (_) {}
        }
        SC.hookTrack(video, e.track);
      });
    }

    // Observe <track> child elements
    const trackObserver = new MutationObserver(() => {
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          if (tr.mode === 'disabled') {
            try { tr.mode = 'hidden'; } catch (_) {}
          }
          SC.hookTrack(video, tr);
        }
      }
    });
    trackObserver.observe(video, { childList: true });
  };

  // Scan page for video elements
  SC.scanForVideos = function() {
    const videos = document.querySelectorAll('video');
    videos.forEach(SC.hookVideo);
    if (location.hostname.includes('youtube.com')) {
      SC.tryEnableYouTubeSubtitles();
    }
  };

  // DOM-Based Subtitle Detection (YouTube, Netflix, player caption windows)
  SC.setupDOMSubtitleObserver = function() {
    const captionSelectors = [
      '.vjs-text-track-cue',
      '.jw-text-track-cue',
      '.shaka-text-container',
      '.player-timedtext-text-container',
      '[class*="subtitle-cue"]',
      '[class*="subtitle-line"]'
    ];

    let ytDebounceTimer = null;

    function checkYouTubeCaptions() {
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
      // Check for newly added video elements
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'VIDEO') {
                SC.hookVideo(node);
              } else if (node.querySelectorAll) {
                node.querySelectorAll('video').forEach(SC.hookVideo);
              }
            }
          }
        }
      }

      // Check YouTube visual captions with debounce
      if (document.querySelector('.ytp-caption-window-bottom, .caption-window, .ytp-caption-segment')) {
        clearTimeout(ytDebounceTimer);
        ytDebounceTimer = setTimeout(checkYouTubeCaptions, 120);
      }

      // Check generic caption selectors
      for (const m of mutations) {
        const target = m.target;
        if (target && target.nodeType === Node.ELEMENT_NODE) {
          for (const sel of captionSelectors) {
            if (target.matches && (target.matches(sel) || target.closest(sel))) {
              const text = (target.textContent || '').trim();
              if (text && text.length > 1) {
                const video = SC.getActiveVideo();
                SC.addSubtitleLine(text, video ? video.currentTime : null);
              }
              break;
            }
          }
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
