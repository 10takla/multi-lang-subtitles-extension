/**
 * Video Subtitles Capturer - Vimeo Capturer Module
 * Captures subtitles via Vimeo Player SDK / Player API (`getTextTracks`, `enableTextTrack`, `cuechange`).
 * Strictly normalizes output to the unified SubtitleTrack / SubtitleCue model.
 */

(function(global) {
  'use strict';

  global.__SC = global.__SC || {};
  global.__SC.capturers = global.__SC.capturers || {};
  global.SubtitlesCapturers = global.SubtitlesCapturers || {};

  /**
   * Cleans text from HTML formatting tags and entities.
   */
  function cleanSubtitleText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  const VimeoCapturer = {
    name: 'vimeo',

    /**
     * Converts Vimeo Player SDK text track objects into SubtitleTrack array.
     */
    parseVimeoTracks: function(vimeoTracksData) {
      if (!Array.isArray(vimeoTracksData)) return [];
      const tracks = [];

      vimeoTracksData.forEach((vTr, idx) => {
        const cues = [];
        if (Array.isArray(vTr.cues)) {
          vTr.cues.forEach((c, cIdx) => {
            const cleaned = cleanSubtitleText(c.text);
            if (cleaned) {
              cues.push({
                id: c.id || `vimeo_${idx}_${cIdx}`,
                startMs: Math.round((c.startTime || c.start || 0) * 1000),
                endMs: Math.round((c.endTime || c.end || 0) * 1000),
                text: cleaned
              });
            }
          });
        }

        tracks.push({
          id: `vimeo:${vTr.language || idx}`,
          language: vTr.language || 'en',
          label: vTr.label || `Vimeo Track ${idx + 1}`,
          kind: vTr.kind || 'subtitles',
          format: 'webvtt',
          source: 'player-api',
          live: false,
          completeness: cues.length > 0 ? 'full' : 'loaded-window',
          cues: cues
        });
      });

      return tracks;
    },

    /**
     * Parses raw Vimeo SDK response or track object directly into SubtitleTrack.
     */
    parse: function(rawTextOrData, options = {}) {
      if (Array.isArray(rawTextOrData)) {
        const parsed = this.parseVimeoTracks(rawTextOrData);
        return parsed[0] || null;
      }

      if (typeof rawTextOrData === 'object' && rawTextOrData !== null) {
        const cues = [];
        if (Array.isArray(rawTextOrData.cues)) {
          rawTextOrData.cues.forEach((c, idx) => {
            const cleaned = cleanSubtitleText(c.text);
            if (cleaned) {
              cues.push({
                id: c.id || `vimeo_${idx + 1}`,
                startMs: Math.round((c.startTime || c.start || 0) * 1000),
                endMs: Math.round((c.endTime || c.end || 0) * 1000),
                text: cleaned
              });
            }
          });
        }

        return {
          id: options.id || `vimeo:${rawTextOrData.language || '0'}`,
          language: rawTextOrData.language || 'en',
          label: rawTextOrData.label || 'Vimeo Subtitles',
          kind: rawTextOrData.kind || 'subtitles',
          format: 'webvtt',
          source: 'player-api',
          live: false,
          completeness: cues.length > 0 ? 'full' : 'loaded-window',
          cues: cues
        };
      }

      return null;
    },

    /**
     * Captures tracks via window.Vimeo or Vimeo Player instances.
     */
    capture: async function(options = {}) {
      const tracks = [];
      const player = options.player || (typeof window !== 'undefined' ? window.vimeoPlayer : null);

      if (player && typeof player.getTextTracks === 'function') {
        try {
          const vimeoTracks = await player.getTextTracks();
          return this.parseVimeoTracks(vimeoTracks);
        } catch (_) {}
      }

      return tracks;
    }
  };

  global.__SC.capturers['vimeo'] = VimeoCapturer;
  global.SubtitlesCapturers['vimeo'] = VimeoCapturer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VimeoCapturer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
