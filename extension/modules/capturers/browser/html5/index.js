/**
 * Video Subtitles Capturer - HTML5 Capturer Module
 * Captures subtitles from native HTML5 <video> textTracks and <track> elements (WebVTT).
 * Operates in 'hidden' mode without altering native player display or user settings.
 */

(() => {
  window.__SC = window.__SC || {};
  const SC = window.__SC;

  SC.hookedTracks = new WeakSet();

  /**
   * Ensures the text track is in 'hidden' mode rather than 'disabled'
   * so cue events fire and cues remain accessible without native rendering.
   */
  SC.ensureHiddenMode = function(tr) {
    if (tr && tr.mode === 'disabled') {
      try { tr.mode = 'hidden'; } catch (_) {}
    }
  };

  /**
   * Returns list of available tracks from the native HTMLMediaElement.textTracks.
   */
  SC.getHTML5AvailableTracks = function(video) {
    const tracks = [];
    if (!video || !video.textTracks || video.textTracks.length === 0) return tracks;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      tracks.push({
        value: `track:${tr.language || i}`,
        label: `[Видео] ${tr.label || tr.language || 'Трек ' + (i + 1)}`
      });
    }
    return tracks;
  };

  /**
   * Retrieves text from HTML5 track at a given timestamp.
   */
  SC.getHTML5TrackTextAtTime = function(trackId, time, video) {
    if (!video || !video.textTracks || !trackId || !trackId.startsWith('track:')) return null;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
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
    return null;
  };

  /**
   * Collects upcoming cues from HTML5 textTracks for timeline prefetching.
   */
  SC.getUpcomingHTML5Cues = function(video, t, maxTime, targetTrackId = null) {
    const list = [];
    if (!video || !video.textTracks || video.textTracks.length === 0) return list;

    const seen = new Set();
    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      const val = `track:${tr.language || i}`;
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
    return list;
  };

  /**
   * Checks for an active HTML5 cue at playback time t.
   */
  SC.getHTML5ActiveCueAtTime = function(video, t, primaryTrackVal = null) {
    if (!video || !video.textTracks || video.textTracks.length === 0) return null;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      SC.ensureHiddenMode(tr);

      const trackVal = `track:${tr.language || i}`;
      if (primaryTrackVal && primaryTrackVal !== 'auto' && primaryTrackVal !== trackVal) {
        continue;
      }

      // Fast path: check native activeCues first
      if (tr.activeCues && tr.activeCues.length > 0) {
        const c = tr.activeCues[0];
        const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
        const clean = SC.cleanText ? SC.cleanText(raw) : (raw || '').trim();
        if (clean) {
          return { text: clean, start: c.startTime };
        }
      }

      // Fallback path: search tr.cues
      if (tr.cues && tr.cues.length > 0) {
        for (let j = 0; j < tr.cues.length; j++) {
          const c = tr.cues[j];
          if (t >= c.startTime && t <= c.endTime) {
            const raw = c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : '');
            const clean = SC.cleanText ? SC.cleanText(raw) : (raw || '').trim();
            if (clean) {
              return { text: clean, start: c.startTime };
            }
          }
        }
      }
    }
    return null;
  };

  /**
   * Hooks a single HTML5 TextTrack instance and listens for cue changes.
   */
  SC.hookTrack = function(video, track) {
    if (!track || SC.hookedTracks.has(track)) return;
    SC.hookedTracks.add(track);

    if (video && SC.registerVideoWithSubtitles) {
      SC.registerVideoWithSubtitles(video);
    }

    SC.ensureHiddenMode(track);

    const handleCueChange = () => {
      const primarySelector = SC.state && SC.state.languages
        ? (SC.state.languages.find(l => l.visible && (l.mode === 'track' || l.type === 'source')) || SC.state.languages[0])
        : null;
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
          if (SC.addSubtitleLine) SC.addSubtitleLine(raw, video.currentTime);
        }
      }
    };

    track.addEventListener('cuechange', handleCueChange);
    handleCueChange();

    if (SC.prefetchUpcomingTranslations) {
      SC.prefetchUpcomingTranslations(video.currentTime, 60);
    }
  };

  /**
   * Hooks all current and future textTracks for a given video element.
   */
  SC.hookHTML5Tracks = function(video) {
    if (!video || !video.textTracks) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const tr = video.textTracks[i];
      SC.ensureHiddenMode(tr);
      SC.hookTrack(video, tr);
    }

    video.textTracks.addEventListener('addtrack', (e) => {
      if (e.track) {
        SC.ensureHiddenMode(e.track);
        SC.hookTrack(video, e.track);
      }
    });

    video.textTracks.addEventListener('change', () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        SC.ensureHiddenMode(tr);
        SC.hookTrack(video, tr);
      }
    });

    // Observe dynamic <track> elements added into <video>
    const trackObserver = new MutationObserver(() => {
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          SC.ensureHiddenMode(tr);
          SC.hookTrack(video, tr);
        }
      }
    });
    trackObserver.observe(video, { childList: true });
  };

  const HTML5Capturer = {
    name: 'html5',
    capture: async function(options = {}) {
      const video = options.video || (SC.getActiveVideo ? SC.getActiveVideo() : (typeof document !== 'undefined' ? document.querySelector('video') : null));
      const tracks = [];
      if (!video || !video.textTracks) return tracks;
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        SC.ensureHiddenMode(tr);
        const cues = [];
        if (tr.cues) {
          for (let j = 0; j < tr.cues.length; j++) {
            const c = tr.cues[j];
            const raw = SC.cleanText ? SC.cleanText(c.text || '') : (c.text || (c.getCueAsHTML ? c.getCueAsHTML().textContent : ''));
            if (raw) {
              cues.push({
                id: c.id || `cue_${j + 1}`,
                startMs: Math.round(c.startTime * 1000),
                endMs: Math.round(c.endTime * 1000),
                text: raw.trim()
              });
            }
          }
        }
        tracks.push({
          id: `track:${tr.language || i}`,
          language: tr.language || 'en',
          label: tr.label || tr.language || `Track ${i + 1}`,
          kind: tr.kind || 'subtitles',
          format: 'webvtt',
          source: 'texttrack',
          live: false,
          completeness: cues.length > 0 ? 'full' : 'loaded-window',
          cues: cues
        });
      }
      return tracks;
    },
    parse: function(rawCuesOrData, options = {}) {
      const cues = [];
      if (Array.isArray(rawCuesOrData)) {
        rawCuesOrData.forEach((c, idx) => {
          cues.push({
            id: c.id || `cue_${idx + 1}`,
            startMs: Math.round(c.startTime !== undefined ? c.startTime * 1000 : (c.startMs || 0)),
            endMs: Math.round(c.endTime !== undefined ? c.endTime * 1000 : (c.endMs || 0)),
            text: (c.text || '').trim()
          });
        });
      }
      return {
        id: options.id || 'html5_track',
        language: options.language || 'en',
        label: options.label || 'HTML5 Subtitles',
        kind: 'subtitles',
        format: 'webvtt',
        source: 'texttrack',
        live: false,
        completeness: 'full',
        cues: cues
      };
    }
  };

  SC.capturers = SC.capturers || {};
  SC.capturers['html5'] = HTML5Capturer;
  window.SubtitlesCapturers = window.SubtitlesCapturers || {};
  window.SubtitlesCapturers['html5'] = HTML5Capturer;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HTML5Capturer;
  }
})();

