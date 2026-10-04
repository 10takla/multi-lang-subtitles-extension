/**
 * Video Subtitles Capturer - Vimeo Capturer Test Suite
 * Automated and manual validation of VimeoCapturer module and Vimeo Player SDK mock.
 */

(function(global) {
  'use strict';

  // 1. Mock Vimeo Player SDK data
  const MOCK_VIMEO_TRACKS = [
    {
      id: 1,
      label: 'English',
      language: 'en',
      kind: 'subtitles',
      mode: 'showing',
      cues: [
        { id: 'v1_c1', startTime: 0.5, endTime: 3.0, text: 'Hello, welcome to the Vimeo test stand.' },
        { id: 'v1_c2', startTime: 3.5, endTime: 6.2, text: 'Vimeo Player SDK captures subtitles seamlessly.' },
        { id: 'v1_c3', startTime: 7.0, endTime: 9.8, text: 'Cleaning <em>HTML tags</em> and &amp; entities.' }
      ]
    },
    {
      id: 2,
      label: 'Русский',
      language: 'ru',
      kind: 'subtitles',
      mode: 'disabled',
      cues: [
        { id: 'v2_c1', startTime: 0.5, endTime: 3.0, text: 'Привет, добро пожаловать на тестовый стенд Vimeo.' },
        { id: 'v2_c2', startTime: 3.5, endTime: 6.2, text: 'Vimeo Player SDK захватывает субтитры без задержек.' },
        { id: 'v2_c3', startTime: 7.0, endTime: 9.8, text: 'Очистка <em>HTML тегов</em> и &amp; мнемоник.' }
      ]
    }
  ];

  /**
   * Factory for creating a mock Vimeo Player instance conforming to Vimeo Player SDK.
   */
  function createMockVimeoPlayer(tracks = MOCK_VIMEO_TRACKS) {
    let currentTracks = JSON.parse(JSON.stringify(tracks));
    let activeTrack = currentTracks.find(t => t.mode === 'showing') || currentTracks[0];
    const eventListeners = {};

    return {
      getTextTracks: async function() {
        return JSON.parse(JSON.stringify(currentTracks));
      },

      enableTextTrack: async function(language, kind = 'subtitles') {
        const found = currentTracks.find(t => t.language === language && (!kind || t.kind === kind));
        if (!found) {
          throw new Error(`Track with language "${language}" not found`);
        }
        currentTracks.forEach(t => { t.mode = 'disabled'; });
        found.mode = 'showing';
        activeTrack = found;
        return JSON.parse(JSON.stringify(found));
      },

      disableTextTrack: async function() {
        currentTracks.forEach(t => { t.mode = 'disabled'; });
        activeTrack = null;
      },

      on: function(event, callback) {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(callback);
      },

      off: function(event, callback) {
        if (!eventListeners[event]) return;
        eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
      },

      trigger: function(event, data) {
        if (eventListeners[event]) {
          eventListeners[event].forEach(cb => {
            try { cb(data); } catch (e) { console.error('Error in mock event callback:', e); }
          });
        }
      },

      getCurrentTime: async function() {
        const v = typeof document !== 'undefined' ? document.querySelector('video') : null;
        return v ? v.currentTime : 0;
      },

      getDuration: async function() {
        const v = typeof document !== 'undefined' ? document.querySelector('video') : null;
        return v ? (v.duration || 10) : 10;
      },

      play: async function() {
        const v = typeof document !== 'undefined' ? document.querySelector('video') : null;
        if (v) return v.play();
      },

      pause: async function() {
        const v = typeof document !== 'undefined' ? document.querySelector('video') : null;
        if (v) v.pause();
      },

      getActiveTrack: function() {
        return activeTrack;
      }
    };
  }

  // Setup global mock player for standalone testing
  const mockPlayerInstance = createMockVimeoPlayer();
  global.vimeoPlayer = mockPlayerInstance;
  global.Vimeo = global.Vimeo || {
    Player: function() { return mockPlayerInstance; }
  };

  /**
   * Validates a SubtitleTrack against the unified subtitle model.
   */
  function validateSubtitleTrack(track, errors = []) {
    if (!track || typeof track !== 'object') {
      errors.push('Track must be a non-null object');
      return false;
    }

    if (!track.id || typeof track.id !== 'string') {
      errors.push(`Track must have string id, got: ${track.id}`);
    }

    if (track.kind !== 'subtitles' && track.kind !== 'captions' && track.kind !== 'descriptions' && track.kind !== 'unknown') {
      errors.push(`Track kind is invalid: ${track.kind}`);
    }

    if (track.format !== 'webvtt' && track.format !== 'json' && track.format !== 'unknown') {
      errors.push(`Track format is invalid: ${track.format}`);
    }

    if (track.source !== 'player-api') {
      errors.push(`Vimeo track source should be 'player-api', got: ${track.source}`);
    }

    if (typeof track.live !== 'boolean') {
      errors.push(`Track.live must be boolean, got: ${typeof track.live}`);
    }

    if (!Array.isArray(track.cues)) {
      errors.push('Track.cues must be an array');
      return false;
    }

    if (track.cues.length === 0) {
      errors.push('Track.cues is empty');
    }

    track.cues.forEach((cue, idx) => {
      if (typeof cue.startMs !== 'number' || isNaN(cue.startMs) || cue.startMs < 0) {
        errors.push(`Cue[${idx}] startMs must be a non-negative number, got: ${cue.startMs}`);
      }
      if (typeof cue.endMs !== 'number' || isNaN(cue.endMs) || cue.endMs <= cue.startMs) {
        errors.push(`Cue[${idx}] endMs must be a number greater than startMs, got: startMs=${cue.startMs}, endMs=${cue.endMs}`);
      }
      if (typeof cue.text !== 'string' || cue.text.trim().length === 0) {
        errors.push(`Cue[${idx}] text must be non-empty string, got: ${cue.text}`);
      }
      if (/<[^>]+>/.test(cue.text)) {
        errors.push(`Cue[${idx}] text should not contain uncleaned HTML tags: ${cue.text}`);
      }
    });

    return errors.length === 0;
  }

  /**
   * Main test runner.
   */
  async function runVimeoTests() {
    const results = {
      name: 'vimeo',
      passed: true,
      errors: [],
      track: null,
      tests: []
    };

    const VimeoCapturer = (global.__SC && global.__SC.capturers && global.__SC.capturers['vimeo'])
      || global.SubtitlesCapturers?.vimeo
      || (typeof require !== 'undefined' ? require('../index.js') : null);

    if (!VimeoCapturer) {
      const err = 'VimeoCapturer module is not loaded or found';
      console.error('[Failed] ' + err);
      results.passed = false;
      results.errors.push(err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    console.log('--- Starting Vimeo Capturer Test Suite ---');

    // Test 1: Vimeo Player SDK Mock Methods
    const test1 = { name: 'Vimeo Player SDK Mock (getTextTracks, enableTextTrack, on cuechange)', passed: true, errors: [] };
    try {
      const player = createMockVimeoPlayer();
      const tracks = await player.getTextTracks();
      if (!Array.isArray(tracks) || tracks.length !== 2) {
        throw new Error(`getTextTracks() expected 2 tracks, got: ${tracks?.length}`);
      }

      const enabled = await player.enableTextTrack('ru', 'subtitles');
      if (enabled.language !== 'ru' || enabled.mode !== 'showing') {
        throw new Error(`enableTextTrack('ru') failed to set active track: mode=${enabled.mode}`);
      }

      let cueChangedFired = false;
      let receivedCue = null;
      player.on('cuechange', (cue) => {
        cueChangedFired = true;
        receivedCue = cue;
      });

      player.trigger('cuechange', { id: 'c1', startTime: 1.0, endTime: 3.5, text: 'Mock Cue Changed' });
      if (!cueChangedFired || !receivedCue || receivedCue.text !== 'Mock Cue Changed') {
        throw new Error('player.on("cuechange") did not receive triggered event data');
      }

      console.log(`[Passed] ${test1.name}`);
    } catch (e) {
      test1.passed = false;
      test1.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test1.name}: ${e.message}`);
      console.error(`[Failed] ${test1.name}: ${e.message}`);
    }
    results.tests.push(test1);

    // Test 2: VimeoCapturer.parseVimeoTracks Model Validation
    const test2 = { name: 'VimeoCapturer.parseVimeoTracks (Model & Cues Validation)', passed: true, errors: [] };
    try {
      const parsedTracks = VimeoCapturer.parseVimeoTracks(MOCK_VIMEO_TRACKS);
      if (!Array.isArray(parsedTracks) || parsedTracks.length !== 2) {
        throw new Error(`Expected 2 parsed tracks, got: ${parsedTracks?.length}`);
      }

      const trackEn = parsedTracks[0];
      const trackErrors = [];
      validateSubtitleTrack(trackEn, trackErrors);
      if (trackErrors.length > 0) {
        throw new Error(`SubtitleTrack validation errors: ${trackErrors.join('; ')}`);
      }

      if (trackEn.id !== 'vimeo:en') {
        throw new Error(`Expected track.id 'vimeo:en', got: ${trackEn.id}`);
      }
      if (trackEn.language !== 'en') {
        throw new Error(`Expected track.language 'en', got: ${trackEn.language}`);
      }
      if (trackEn.source !== 'player-api') {
        throw new Error(`Expected track.source 'player-api', got: ${trackEn.source}`);
      }

      // Check cue cleaning: 'Cleaning <em>HTML tags</em> and &amp; entities.' -> 'Cleaning HTML tags and & entities.'
      const cueWithTags = trackEn.cues[2];
      if (cueWithTags.text !== 'Cleaning HTML tags and & entities.') {
        throw new Error(`HTML entities cleaning failed. Expected 'Cleaning HTML tags and & entities.', got: '${cueWithTags.text}'`);
      }

      if (cueWithTags.startMs !== 7000 || cueWithTags.endMs !== 9800) {
        throw new Error(`Cue timestamps mismatch: startMs=${cueWithTags.startMs}, endMs=${cueWithTags.endMs}`);
      }

      results.track = trackEn;
      console.log(`[Passed] ${test2.name}`);
    } catch (e) {
      test2.passed = false;
      test2.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test2.name}: ${e.message}`);
      console.error(`[Failed] ${test2.name}: ${e.message}`);
    }
    results.tests.push(test2);

    // Test 3: VimeoCapturer.capture with Mock Player
    const test3 = { name: 'VimeoCapturer.capture (Async extraction from mock player)', passed: true, errors: [] };
    try {
      const testPlayer = createMockVimeoPlayer();
      const capturedTracks = await VimeoCapturer.capture({ player: testPlayer });

      if (!Array.isArray(capturedTracks) || capturedTracks.length !== 2) {
        throw new Error(`capture() expected 2 tracks, got: ${capturedTracks?.length}`);
      }

      const trackRu = capturedTracks.find(t => t.language === 'ru');
      if (!trackRu) {
        throw new Error('capture() did not return Russian track');
      }

      const ruErrors = [];
      validateSubtitleTrack(trackRu, ruErrors);
      if (ruErrors.length > 0) {
        throw new Error(`Russian track validation failed: ${ruErrors.join('; ')}`);
      }

      console.log(`[Passed] ${test3.name}`);
    } catch (e) {
      test3.passed = false;
      test3.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test3.name}: ${e.message}`);
      console.error(`[Failed] ${test3.name}: ${e.message}`);
    }
    results.tests.push(test3);

    // Test 4: VimeoCapturer.parse single object fallback
    const test4 = { name: 'VimeoCapturer.parse (Single track object fallback)', passed: true, errors: [] };
    try {
      const singleTrack = VimeoCapturer.parse(MOCK_VIMEO_TRACKS[0]);
      if (!singleTrack || singleTrack.id !== 'vimeo:en') {
        throw new Error(`Single parse failed to produce valid track: ${JSON.stringify(singleTrack)}`);
      }
      const singleErrors = [];
      validateSubtitleTrack(singleTrack, singleErrors);
      if (singleErrors.length > 0) {
        throw new Error(`Single track parse validation failed: ${singleErrors.join('; ')}`);
      }
      console.log(`[Passed] ${test4.name}`);
    } catch (e) {
      test4.passed = false;
      test4.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test4.name}: ${e.message}`);
      console.error(`[Failed] ${test4.name}: ${e.message}`);
    }
    results.tests.push(test4);

    // Final summary
    if (results.passed) {
      console.log('Passed: All Vimeo Capturer tests passed successfully.');
    } else {
      console.error('Failed: Some Vimeo Capturer tests failed. Errors:', results.errors);
    }

    global.__TEST_RESULTS__ = results;

    // Dispatch custom event for UI updates if DOM is available
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('VIMEO_TESTS_COMPLETED', { detail: results }));
    }

    return results;
  }

  // Export or run immediately
  global.runVimeoTests = runVimeoTests;
  global.createMockVimeoPlayer = createMockVimeoPlayer;
  global.MOCK_VIMEO_TRACKS = MOCK_VIMEO_TRACKS;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => runVimeoTests());
    } else {
      setTimeout(() => runVimeoTests(), 50);
    }
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      runVimeoTests,
      createMockVimeoPlayer,
      validateSubtitleTrack,
      MOCK_VIMEO_TRACKS
    };
    // Auto-run if executed directly in Node
    if (require.main === module) {
      runVimeoTests();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
