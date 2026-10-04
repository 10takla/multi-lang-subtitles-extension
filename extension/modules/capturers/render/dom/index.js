/**
 * Video Subtitles Capturer - DOM Captions Fallback Capturer Module
 * Captures subtitles rendered directly into the Document Object Model (DOM).
 * Observes player subtitle containers via MutationObserver and produces normalized live SubtitleTrack objects.
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Universal list of player subtitle container selectors.
   */
  const DEFAULT_SELECTORS = [
    '.ytp-caption-segment',
    '.caption-window',
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
    '.subtitles-overlay'
  ];

  /**
   * Cleans text from extra whitespace and HTML formatting.
   */
  function cleanSubtitleText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const DOMCapturer = {
    name: 'dom',
    selectors: DEFAULT_SELECTORS,

    /**
     * Extracts active visible subtitle text from DOM.
     */
    extractActiveText: function(rootDocOrElement) {
      const root = rootDocOrElement || (typeof document !== 'undefined' ? document : null);
      if (!root || !root.querySelectorAll) return '';

      for (let i = 0; i < this.selectors.length; i++) {
        const sel = this.selectors[i];
        try {
          const els = root.querySelectorAll(sel);
          if (els && els.length > 0) {
            const lines = [];
            for (let j = 0; j < els.length; j++) {
              const el = els[j];
              // Verify element is not hidden
              if (el.offsetParent !== null || el.textContent) {
                const txt = cleanSubtitleText(el.textContent);
                if (txt && !lines.includes(txt)) {
                  lines.push(txt);
                }
              }
            }
            if (lines.length > 0) {
              return lines.join('\n');
            }
          }
        } catch (_) {}
      }

      return '';
    },

    /**
     * Starts watching target element/document for live caption mutations.
     */
    startObserving: function(targetElement, onCueCallback) {
      const target = targetElement || (typeof document !== 'undefined' ? (document.body || document.documentElement) : null);
      if (!target || typeof MutationObserver === 'undefined') return () => {};

      let lastText = '';
      const observer = new MutationObserver(() => {
        const active = this.extractActiveText(target);
        if (active && active !== lastText) {
          lastText = active;
          if (typeof onCueCallback === 'function') {
            const video = document.querySelector('video');
            const nowMs = video ? Math.round(video.currentTime * 1000) : Date.now();
            onCueCallback({
              id: `dom_${Date.now()}`,
              startMs: nowMs,
              endMs: null,
              text: active
            });
          }
        }
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true
      });

      return () => observer.disconnect();
    },

    /**
     * Alias for startObserving to observe live subtitle mutations.
     */
    observe: function(targetElement, onCueCallback) {
      return this.startObserving(targetElement, onCueCallback);
    },

    /**
     * Parses DOM snippet or raw text into normalized SubtitleTrack.
     */
    parse: function(domSnippetOrText, options = {}) {
      let text = '';
      if (typeof domSnippetOrText === 'string') {
        text = cleanSubtitleText(domSnippetOrText);
      } else if (domSnippetOrText && domSnippetOrText.textContent) {
        text = cleanSubtitleText(domSnippetOrText.textContent);
      }

      const cues = [];
      if (text) {
        cues.push({
          id: options.id || `dom_cue_${Date.now()}`,
          startMs: options.startMs || 0,
          endMs: options.endMs || null,
          text: text
        });
      }

      return {
        id: options.trackId || 'dom_captions_track',
        language: options.language || 'unknown',
        label: options.label || 'DOM Live Captions',
        kind: 'captions',
        format: 'unknown',
        source: 'dom',
        live: true,
        completeness: 'active-only',
        cues: cues
      };
    },

    /**
     * Captures current active caption state from document.
     */
    capture: async function(options = {}) {
      const doc = options.document || (typeof document !== 'undefined' ? document : null);
      const text = this.extractActiveText(doc);
      const video = doc ? doc.querySelector('video') : null;
      const startMs = video ? Math.round(video.currentTime * 1000) : 0;

      const track = this.parse(text, {
        startMs: startMs,
        endMs: startMs + 2000
      });

      return track.cues.length > 0 ? [track] : [];
    }
  };

  global.__SC.capturers['dom'] = DOMCapturer;
  global.SubtitlesCapturers['dom'] = DOMCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
