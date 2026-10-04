/**
 * Video Subtitles Capturer - Coursera Capturer Test Suite
 * Validates lesson/player metadata (__COURSERA_DATA__), coursera.videoPlayer API,
 * VTT/SRT parsing, capture, and SubtitleTrack model normalization.
 */

(function(global) {
  'use strict';

  // Sample WebVTT fixture from Coursera
  const COURSERA_VTT_FIXTURE_EN = `WEBVTT

1
00:00:01.200 --> 00:00:04.500
Welcome to Machine Learning on Coursera.

2
00:00:05.100 --> 00:00:08.350
In this lecture, we will study <b>gradient descent</b> and &amp; optimization.

3
00:00:09.000 --> 00:00:12.800
Let us begin by looking at the cost function.
`;

  // Sample SRT fixture from Coursera
  const COURSERA_SRT_FIXTURE_RU = `1
00:00:01,200 --> 00:00:04,500
Добро пожаловать на курс машинного обучения Coursera.

2
00:00:05,100 --> 00:00:08,350
В этой лекции мы изучим <b>градиентный спуск</b> и &amp; оптимизацию.

3
00:00:09,000 --> 00:00:12,800
Давайте начнем с рассмотрения функции потерь.
`;

  // Mock window.__COURSERA_DATA__ state fixture
  const MOCK_COURSERA_DATA = {
    course: {
      id: 'ml-001',
      name: 'Supervised Machine Learning',
      lesson: {
        id: 'lesson-1',
        name: 'Linear Regression',
        video: {
          id: 'video-abc',
          duration: 12.8,
          subtitles: {
            en: 'https://coursera.org/api/subtitles/en.vtt',
            ru: 'https://coursera.org/api/subtitles/ru.srt'
          },
          subtitleTracks: [
            {
              language: 'en',
              label: 'English [Auto]',
              url: 'https://coursera.org/api/subtitles/en.vtt'
            },
            {
              language: 'ru',
              label: 'Русский',
              url: 'https://coursera.org/api/subtitles/ru.srt'
            }
          ]
        }
      }
    }
  };

  /**
   * Factory for creating a mock Coursera VideoPlayer instance.
   */
  function createMockCourseraPlayer() {
    const tracks = [
      {
        language: 'en',
        label: 'English',
        kind: 'subtitles',
        cues: [
          { id: 'c1', startTime: 1.2, endTime: 4.5, text: 'Welcome to Machine Learning on Coursera.' },
          { id: 'c2', startTime: 5.1, endTime: 8.35, text: 'In this lecture, we will study gradient descent.' }
        ]
      },
      {
        language: 'ru',
        label: 'Русский',
        kind: 'subtitles',
        cues: [
          { id: 'c3', startTime: 1.2, endTime: 4.5, text: 'Добро пожаловать на курс машинного обучения Coursera.' },
          { id: 'c4', startTime: 5.1, endTime: 8.35, text: 'В этой лекции мы изучим градиентный спуск.' }
        ]
      }
    ];

    let currentTrack = tracks[0];

    return {
      getSubtitleTracks: function() {
        return JSON.parse(JSON.stringify(tracks));
      },
      getSubtitles: function() {
        return JSON.parse(JSON.stringify(tracks));
      },
      getCurrentTrack: function() {
        return currentTrack;
      },
      setTrack: function(lang) {
        currentTrack = tracks.find(t => t.language === lang) || currentTrack;
        return currentTrack;
      }
    };
  }

  // Setup globals for test stand
  global.__COURSERA_DATA__ = MOCK_COURSERA_DATA;
  global.coursera = global.coursera || {};
  global.coursera.videoPlayer = createMockCourseraPlayer();

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

    if (track.kind !== 'subtitles' && track.kind !== 'captions' && track.kind !== 'descriptions') {
      errors.push(`Track kind is invalid: ${track.kind}`);
    }

    if (track.format !== 'webvtt' && track.format !== 'srt' && track.format !== 'json' && track.format !== 'ttml') {
      errors.push(`Track format is invalid: ${track.format}`);
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
        errors.push(`Cue[${idx}] text contains uncleaned HTML tags: ${cue.text}`);
      }
    });

    return errors.length === 0;
  }

  /**
   * Main test runner for Coursera capturer.
   */
  async function runCourseraTests() {
    const results = {
      name: 'coursera',
      passed: true,
      errors: [],
      track: null,
      tests: []
    };

    const CourseraCapturer = (global.__SC && global.__SC.capturers && global.__SC.capturers['coursera'])
      || global.SubtitlesCapturers?.coursera
      || (typeof require !== 'undefined' ? require('../index.js') : null);

    if (!CourseraCapturer) {
      const err = 'CourseraCapturer module is not loaded or found';
      console.error('[Failed] ' + err);
      results.passed = false;
      results.errors.push(err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    console.log('--- Starting Coursera Capturer Test Suite ---');

    // Test 1: Lesson Metadata Discovery (__COURSERA_DATA__)
    const test1 = { name: 'Coursera Lesson Metadata Detection (__COURSERA_DATA__)', passed: true, errors: [] };
    try {
      const tracks = CourseraCapturer.detectLessonMetadata(MOCK_COURSERA_DATA);
      if (!Array.isArray(tracks) || tracks.length < 2) {
        throw new Error(`Expected at least 2 tracks from metadata, got: ${tracks?.length}`);
      }
      const hasEn = tracks.some(t => t.language === 'en' && t.url.includes('en.vtt'));
      const hasRu = tracks.some(t => t.language === 'ru' && t.url.includes('ru.srt'));
      if (!hasEn || !hasRu) {
        throw new Error('Metadata tracks missing required en.vtt or ru.srt URLs');
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

    // Test 2: coursera.videoPlayer API Detection
    const test2 = { name: 'coursera.videoPlayer API Detection & Extraction', passed: true, errors: [] };
    try {
      const mockPlayer = createMockCourseraPlayer();
      const playerTracks = CourseraCapturer.detectPlayerApi(mockPlayer);
      if (!Array.isArray(playerTracks) || playerTracks.length !== 2) {
        throw new Error(`Expected 2 player API tracks, got: ${playerTracks?.length}`);
      }
      const firstTrack = playerTracks[0];
      if (firstTrack.language !== 'en' || !Array.isArray(firstTrack.cues) || firstTrack.cues.length !== 2) {
        throw new Error('Player API track missing cues');
      }
      console.log(`[Passed] ${test2.name}`);
    } catch (e) {
      test2.passed = false;
      test2.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test2.name}: ${e.message}`);
      console.error(`[Failed] ${test2.name}: ${e.message}`);
    }
    results.tests.push(test2);

    // Test 3: WebVTT Fixture Parsing & Normalization
    const test3 = { name: 'Coursera WebVTT Parsing and Tag Cleaning', passed: true, errors: [] };
    try {
      const parsedTrack = CourseraCapturer.parse(COURSERA_VTT_FIXTURE_EN, {
        id: 'coursera:en',
        language: 'en',
        label: 'English'
      });
      const errors = [];
      validateSubtitleTrack(parsedTrack, errors);
      if (errors.length > 0) {
        throw new Error(`SubtitleTrack validation errors: ${errors.join('; ')}`);
      }

      if (parsedTrack.cues.length !== 3) {
        throw new Error(`Expected 3 cues, got: ${parsedTrack.cues.length}`);
      }

      const cue2 = parsedTrack.cues[1];
      if (cue2.text !== 'In this lecture, we will study gradient descent and & optimization.') {
        throw new Error(`Cue text tag cleaning failed, got: "${cue2.text}"`);
      }
      if (cue2.startMs !== 5100 || cue2.endMs !== 8350) {
        throw new Error(`Cue timestamps mismatch: startMs=${cue2.startMs}, endMs=${cue2.endMs}`);
      }

      results.track = parsedTrack;
      console.log(`[Passed] ${test3.name}`);
    } catch (e) {
      test3.passed = false;
      test3.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test3.name}: ${e.message}`);
      console.error(`[Failed] ${test3.name}: ${e.message}`);
    }
    results.tests.push(test3);

    // Test 4: SRT Fixture Parsing & Normalization
    const test4 = { name: 'Coursera SRT Parsing and Timing Validation', passed: true, errors: [] };
    try {
      const parsedSrt = CourseraCapturer.parse(COURSERA_SRT_FIXTURE_RU, {
        id: 'coursera:ru',
        language: 'ru',
        label: 'Русский'
      });
      const errors = [];
      validateSubtitleTrack(parsedSrt, errors);
      if (errors.length > 0) {
        throw new Error(`SRT SubtitleTrack validation errors: ${errors.join('; ')}`);
      }

      if (parsedSrt.format !== 'srt') {
        throw new Error(`Expected format 'srt', got: ${parsedSrt.format}`);
      }

      if (parsedSrt.cues[0].startMs !== 1200 || parsedSrt.cues[0].endMs !== 4500) {
        throw new Error(`SRT cue timing mismatch: startMs=${parsedSrt.cues[0].startMs}, endMs=${parsedSrt.cues[0].endMs}`);
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

    // Test 5: End-to-End CourseraCapturer.capture()
    const test5 = { name: 'CourseraCapturer.capture (Async End-to-End Extraction)', passed: true, errors: [] };
    try {
      const mockFetch = async (url) => {
        if (url.includes('en.vtt')) return COURSERA_VTT_FIXTURE_EN;
        if (url.includes('ru.srt')) return COURSERA_SRT_FIXTURE_RU;
        return '';
      };

      const captured = await CourseraCapturer.capture({
        courseraData: MOCK_COURSERA_DATA,
        player: createMockCourseraPlayer(),
        fetchFn: mockFetch
      });

      if (!Array.isArray(captured) || captured.length === 0) {
        throw new Error('capture() did not return any subtitle tracks');
      }

      const enTrack = captured.find(t => t.language === 'en');
      if (!enTrack || enTrack.cues.length === 0) {
        throw new Error('Captured tracks missing English track with cues');
      }

      console.log(`[Passed] ${test5.name}`);
    } catch (e) {
      test5.passed = false;
      test5.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test5.name}: ${e.message}`);
      console.error(`[Failed] ${test5.name}: ${e.message}`);
    }
    results.tests.push(test5);

    // Final summary
    if (results.passed) {
      console.log('Passed: All Coursera Capturer tests passed successfully.');
    } else {
      console.error('Failed: Some Coursera Capturer tests failed. Errors:', results.errors);
    }

    global.__TEST_RESULTS__ = results;

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('COURSERA_TESTS_COMPLETED', { detail: results }));
    }

    return results;
  }

  global.runCourseraTests = runCourseraTests;
  global.createMockCourseraPlayer = createMockCourseraPlayer;
  global.MOCK_COURSERA_DATA = MOCK_COURSERA_DATA;
  global.COURSERA_VTT_FIXTURE_EN = COURSERA_VTT_FIXTURE_EN;
  global.COURSERA_SRT_FIXTURE_RU = COURSERA_SRT_FIXTURE_RU;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => runCourseraTests());
    } else {
      setTimeout(() => runCourseraTests(), 50);
    }
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      runCourseraTests,
      createMockCourseraPlayer,
      validateSubtitleTrack,
      MOCK_COURSERA_DATA,
      COURSERA_VTT_FIXTURE_EN,
      COURSERA_SRT_FIXTURE_RU
    };
    if (require.main === module) {
      runCourseraTests();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
