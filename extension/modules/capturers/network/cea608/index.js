/**
 * Video Subtitles Capturer - CEA-608 / CEA-708 Capturer Module
 * Captures Closed Captions (EIA-608 / CEA-708) embedded in media streams or decoded by players.
 * Decodes caption bytes / TextTrack CC cues into normalized SubtitleTrack objects.
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from control characters, trailing spaces, and formatting artifacts.
   */
  function cleanSubtitleText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const CEA608Capturer = {
    name: 'cea608',

    /**
     * Decodes raw CEA-608 byte packets into clean text string.
     */
    decodeBytePacket: function(byte1, byte2) {
      const b1 = byte1 & 0x7F;
      const b2 = byte2 & 0x7F;

      // Filter out non-printable control commands (preamble, color, roll-up commands)
      if (b1 < 0x20) {
        return '';
      }

      const char1 = String.fromCharCode(b1);
      const char2 = b2 >= 0x20 ? String.fromCharCode(b2) : '';
      return char1 + char2;
    },

    /**
     * Parses byte data or TextTrack cue array carrying CEA-608 payloads.
     */
    parse: function(inputData, options = {}) {
      const cues = [];

      if (Array.isArray(inputData)) {
        // Input is TextTrack cue array or byte packet list
        inputData.forEach((item, idx) => {
          let text = '';
          let startMs = 0;
          let endMs = null;

          if (item.startTime !== undefined) {
            // HTML5 TextTrackCue
            text = cleanSubtitleText(item.text || (item.getCueAsHTML ? item.getCueAsHTML().textContent : ''));
            startMs = Math.round(item.startTime * 1000);
            endMs = item.endTime !== undefined ? Math.round(item.endTime * 1000) : null;
          } else if (item.byte1 !== undefined) {
            text = cleanSubtitleText(this.decodeBytePacket(item.byte1, item.byte2));
            startMs = Math.round((item.pts || 0) * 1000);
            endMs = item.durationMs ? startMs + item.durationMs : startMs + 2000;
          } else if (item.text) {
            text = cleanSubtitleText(item.text);
            startMs = Math.round(item.startMs || 0);
            endMs = item.endMs || null;
          }

          if (text) {
            cues.push({
              id: item.id || `cc_${idx + 1}`,
              startMs: startMs,
              endMs: endMs,
              text: text
            });
          }
        });
      } else if (typeof inputData === 'string') {
        const cleaned = cleanSubtitleText(inputData);
        if (cleaned) {
          cues.push({
            id: 'cc_1',
            startMs: options.startMs || 0,
            endMs: options.endMs || null,
            text: cleaned
          });
        }
      }

      return {
        id: options.id || 'cea608_track',
        language: options.language || 'en',
        label: options.label || 'CEA-608 Closed Captions (CC1)',
        kind: 'captions',
        format: 'cea608',
        source: 'texttrack',
        live: Boolean(options.live),
        completeness: options.live ? 'active-only' : 'full',
        cues: cues
      };
    },

    /**
     * Captures CEA-608 tracks from media element.
     */
    capture: async function(options = {}) {
      const video = options.video || (typeof document !== 'undefined' ? document.querySelector('video') : null);
      const tracks = [];

      if (video && video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          const label = tr.label || '';
          if (label.includes('CC') || label.includes('CEA') || tr.kind === 'captions') {
            const parsed = this.parse(Array.from(tr.cues || []), {
              id: `cea608_${i}`,
              label: label || `CEA-608 (Track ${i + 1})`,
              language: tr.language || 'en'
            });
            tracks.push(parsed);
          }
        }
      }

      return tracks;
    }
  };

  global.__SC.capturers['cea608'] = CEA608Capturer;
  global.SubtitlesCapturers['cea608'] = CEA608Capturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CEA608Capturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
