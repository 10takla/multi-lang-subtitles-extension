/**
 * Video Subtitles Capturer - Capturers Module (Orchestrator)
 * Coordinates specialized subtitle extractors (HTML5, Custom/Playerjs, YouTube)
 * and provides video detection, playback synchronization, deduplication, and DOM fallback.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.hookedVideos = new WeakSet();

  /**
   * Retrieves all available video tracks across HTML5, Custom players, and YouTube.
   */
  SC.getAvailableVideoTracks = function() {
    const activeVideo = SC.getActiveVideo();
    const tracks = [];

    // 1. HTML5 tracks
    if (SC.getHTML5AvailableTracks) {
      tracks.push(...SC.getHTML5AvailableTracks(activeVideo));
    }

    // 2. Custom player tracks
    if (SC.getCustomAvailableTracks) {
      tracks.push(...SC.getCustomAvailableTracks());
    }

    // 3. YouTube caption tracks
    if (SC.fetchYouTubeCaptionTracks) {
      const ytTracks = SC.fetchYouTubeCaptionTracks();
      if (ytTracks && ytTracks.length > 0) {
        ytTracks.forEach((ytTr, idx) => {
          const trName = (ytTr.name && (ytTr.name.simpleText || (ytTr.name.runs && ytTr.name.runs[0] && ytTr.name.runs[0].text)))
            || ytTr.languageCode || `Трек ${idx + 1}`;
          tracks.push({
            value: `yt:${ytTr.languageCode || idx}`,
            label: `[YouTube] ${trName}`
          });
        });
      }
    }

    return tracks;
  };

  /**
   * Retrieves text for a specific track at a given playback timestamp.
   */
  SC.getTrackTextAtTime = function(trackId, time) {
    if (!trackId || trackId === 'auto') return null;

    if (trackId.startsWith('yt:') && SC.getYouTubeTrackTextAtTime) {
      return SC.getYouTubeTrackTextAtTime(trackId, time);
    }
    if (trackId.startsWith('custom:') && SC.getCustomTrackTextAtTime) {
      return SC.getCustomTrackTextAtTime(trackId, time);
    }
    if (trackId.startsWith('track:') && SC.getHTML5TrackTextAtTime) {
      const activeVideo = SC.getActiveVideo();
      return SC.getHTML5TrackTextAtTime(trackId, time, activeVideo);
    }

    return null;
  };

  /**
   * Collects upcoming cues across all capturer sources for timeline translation prefetching.
   */
  SC.getUpcomingCues = function(currentTime = null, bufferSeconds = 60, targetTrackId = null) {
    const activeVideo = SC.getActiveVideo();
    const t = (currentTime !== null && currentTime !== undefined)
      ? currentTime
      : (activeVideo ? activeVideo.currentTime : 0);
    const maxTime = t + bufferSeconds;
    const list = [];
    const seen = new Set();

    // 1. YouTube cues
    if (SC.getUpcomingYouTubeCues) {
      const ytCues = SC.getUpcomingYouTubeCues(t, bufferSeconds, targetTrackId);
      if (ytCues && ytCues.length > 0) {
        ytCues.forEach(c => {
          if (!seen.has(c.text)) {
            seen.add(c.text);
            list.push(c);
          }
        });
      }
    }

    // 2. Custom & Playerjs cues
    if (SC.getUpcomingCustomCues) {
      const customCues = SC.getUpcomingCustomCues(t, maxTime, targetTrackId);
      if (customCues && customCues.length > 0) {
        customCues.forEach(c => {
          if (!seen.has(c.text)) {
            seen.add(c.text);
            list.push(c);
          }
        });
      }
    }

    // 3. HTML5 textTracks cues
    if (SC.getUpcomingHTML5Cues) {
      const html5Cues = SC.getUpcomingHTML5Cues(activeVideo, t, maxTime, targetTrackId);
      if (html5Cues && html5Cues.length > 0) {
        html5Cues.forEach(c => {
          if (!seen.has(c.text)) {
            seen.add(c.text);
            list.push(c);
          }
        });
      }
    }

    return list;
  };

  /**
   * Universal DOM subtitle extractor for non-YouTube players (Playerjs, Video.js, JW, Netflix, etc.)
   */
  SC.getDOMSubtitleText = function() {
    if (SC.isYouTubePage && SC.isYouTubePage()) {
      return null;
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

  /**
   * Processes a newly captured subtitle line, performs streaming and deduplication checks,
   * updates state, and dispatches to overlay and background scripts.
   */
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

    // Cap lines list to MAX_LINES
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

  /**
   * Native subtitles suppression no-op (preserves native video subtitle state)
   */
  SC.suppressNativeSubtitles = function() {};

  /**
   * Hooks into an HTML5 video element, registers listeners, and connects capturers.
   */
  SC.hookVideo = function(video) {
    if (!video || SC.hookedVideos.has(video)) return;
    SC.hookedVideos.add(video);

    if (video.textTracks && video.textTracks.length > 0 && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(video);
    }

    if (SC.scanPageForSubtitleTracks) {
      SC.scanPageForSubtitleTracks();
    }

    // Initialize YouTube caption tracks when on YouTube
    if (SC.isYouTubePage && SC.isYouTubePage()) {
      if (SC.fetchYouTubeCaptionTracks) {
        const tracks = SC.fetchYouTubeCaptionTracks();
        if (tracks.length > 0 && SC.loadYouTubeTimedText) {
          SC.loadYouTubeTimedText(tracks[0], `yt:${tracks[0].languageCode || 0}`);
          if (SC.renderLanguageList) SC.renderLanguageList();
        }
      }
    }

    // Connect native HTML5 textTracks hook
    if (SC.hookHTML5Tracks) {
      SC.hookHTML5Tracks(video);
    }

    // Timeupdate listener for direct YouTube cues, Custom cues, HTML5 cues, and DOM fallback
    let lastPrefetchTime = -999;
    let lastMatchedCueText = null;
    let lastMatchedCueStart = -1;

    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      let matchedText = null;
      let matchedStart = null;

      // 1. YouTube direct timedtext cues
      if (SC.getYouTubeActiveCueAtTime) {
        const match = SC.getYouTubeActiveCueAtTime(t);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 2. Custom & Playerjs parsed cues
      if (!matchedText && SC.getCustomActiveCueAtTime) {
        const match = SC.getCustomActiveCueAtTime(t);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 3. HTML5 TextTrack cues
      if (!matchedText && SC.getHTML5ActiveCueAtTime) {
        const primarySelector = SC.state && SC.state.languages
          ? (SC.state.languages.find(l => l.visible && (l.mode === 'track' || l.type === 'source')) || SC.state.languages[0])
          : null;
        const primaryTrackVal = primarySelector ? (primarySelector.trackId || primarySelector.sourceTrack || primarySelector.lang || 'auto') : 'auto';
        const match = SC.getHTML5ActiveCueAtTime(video, t, primaryTrackVal);
        if (match) {
          matchedText = match.text;
          matchedStart = match.start;
        }
      }

      // 4. Live DOM subtitle text fallback (for non-YouTube players)
      if (!matchedText && SC.getDOMSubtitleText) {
        const domText = SC.getDOMSubtitleText();
        if (domText) {
          matchedText = domText;
          matchedStart = t;
        }
      }

      // Only invoke addSubtitleLine when active cue text or start time changes
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
  };

  /**
   * Scans page for all <video> elements and hooks them.
   */
  SC.scanForVideos = function() {
    if (SC.scanPageForSubtitleTracks) {
      SC.scanPageForSubtitleTracks();
    }
    const videos = document.querySelectorAll('video');
    videos.forEach(SC.hookVideo);
  };

  /**
   * Sets up a MutationObserver for dynamically added videos and DOM captions.
   */
  SC.setupDOMSubtitleObserver = function() {
    if (SC.isYouTubePage && SC.isYouTubePage()) return;

    const observer = new MutationObserver((mutations) => {
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
                (cls && (cls.includes('caption') || cls.includes('subtitle') || cls.includes('cue') || cls.includes('playerjs'))) ||
                (id && (id.includes('caption') || id.includes('subtitle') || id.includes('cue') || id.includes('pjs_')))
              ) {
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
              (cls && (cls.includes('caption') || cls.includes('subtitle') || cls.includes('cue') || cls.includes('playerjs'))) ||
              (id && (id.includes('caption') || id.includes('subtitle') || id.includes('cue') || id.includes('pjs_')))
            ) {
              checkGeneric = true;
            }
          }
        }
      }

      if (checkVideos) {
        SC.scanForVideos();
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
