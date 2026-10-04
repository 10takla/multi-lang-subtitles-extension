/**
 * Video Subtitles Capturer - Netflix Capturer Test Suite
 * Validates Netflix Player API mock (`netflix.appContext.state.playerApp.getAPI().videoPlayer`),
 * TTML / IMSC timed-text parsing, sidecar WebVTT parsing, capture, and SubtitleTrack normalization.
 */

(function(global) {
  'use strict';

  // Sample TTML / IMSC fixture from Netflix
  const NETFLIX_TTML_FIXTURE_EN = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling" xml:lang="en">
  <head>
    <styling>
      <style xml:id="s1" tts:color="white" tts:fontFamily="proportionalSansSerif" tts:fontSize="100%"/>
    </styling>
    <layout>
      <region xml:id="r1" tts:origin="10% 80%" tts:extent="80% 10%"/>
    </layout>
  </head>
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.800" region="r1" style="s1">Welcome to Netflix Original series.</p>
      <p begin="00:00:04.200" end="00:00:07.500" region="r1" style="s1">Capturing <i>IMSC1 / TTML</i> &amp; timed-text subtitles.</p>
      <p begin="00:00:08.000" dur="00:00:03.200" region="r1" style="s1"><span>All cues are strictly</span> <br/> normalized to SubtitleTrack.</p>
    </div>
  </body>
</tt>`;

  // Sample sidecar WebVTT fixture from Netflix
  const NETFLIX_VTT_FIXTURE_RU = `WEBVTT - Netflix Russian Subtitles

1
00:00:01.000 --> 00:00:03.800
Добро пожаловать в сериал Netflix.

2
00:00:04.200 --> 00:00:07.500
Захват <i>IMSC1 / TTML</i> и &amp; timed-text субтитров.

3
00:00:08.000 --> 00:00:11.200
Все реплики нормализуются в модель SubtitleTrack.
`;

  // Mock Netflix Player API Tracks
  const MOCK_NETFLIX_TRACK_LIST = [
    {
      id: 'en_sdh',
      bcp47: 'en',
      displayName: 'English [CC]',
      isNone: false,
      isForcedNarrative: false,
      trackType: 'ASSISTIVE',
      timedTextType: 'simplesdh',
      ttDownloadables: {
        'xml': {
          urls: [{ url: 'https://netflix.com/api/timedtext/ttml_en.xml' }]
        },
        'webvtt-lssdh-ios8': {
          urls: [{ url: 'https://netflix.com/api/timedtext/vtt_en.vtt' }]
        }
      }
    },
    {
      id: 'ru_sub',
      bcp47: 'ru',
      displayName: 'Русский',
      isNone: false,
      isForcedNarrative: false,
      trackType: 'PRIMARY',
      timedTextType: 'subtitles',
      cdnUrls: ['https://netflix.com/api/timedtext/vtt_ru.vtt']
    },
    {
      id: 'none',
      bcp47: '',
      displayName: 'Off',
      isNone: true,
      isForcedNarrative: false,
      trackType: 'PRIMARY',
      timedTextType: 'none'
    }
  ];

  /**
   * Factory for creating a mock Netflix videoPlayer instance conforming to playerApp API.
   */
  function createMockNetflixVideoPlayer() {
    let activeTrack = MOCK_NETFLIX_TRACK_LIST[0];

    const mockPlayer = {
      getTimedTextTrackList: function() {
        return JSON.parse(JSON.stringify(MOCK_NETFLIX_TRACK_LIST));
      },
      getTimedTextTrack: function() {
        return JSON.parse(JSON.stringify(activeTrack));
      },
      setTimedTextTrack: function(track) {
        activeTrack = track;
        return activeTrack;
      },
      getCurrentTime: function() {
        return 0;
      }
    };

    return {
      getAllPlayerSessionIds: function() {
        return ['mock_session_101'];
      },
      getVideoPlayerBySessionId: function(sessionId) {
        if (sessionId === 'mock_session_101') return mockPlayer;
        return null;
      },
      getVideoPlayer: function() {
        return mockPlayer;
      }
    };
  }

  // Setup global mock for standalone testing
  const mockVideoPlayer = createMockNetflixVideoPlayer();
  global.netflix = global.netflix || {
    appContext: {
      state: {
        playerApp: {
          getAPI: function() {
            return {
              videoPlayer: mockVideoPlayer
            };
          }
        }
      }
    }
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

    if (track.kind !== 'subtitles' && track.kind !== 'captions' && track.kind !== 'descriptions') {
      errors.push(`Track kind is invalid: ${track.kind}`);
    }

    if (track.format !== 'ttml' && track.format !== 'webvtt' && track.format !== 'srt' && track.format !== 'json') {
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
        errors.push(`Cue[${idx}] text contains uncleaned tags: ${cue.text}`);
      }
    });

    return errors.length === 0;
  }

  /**
   * Main test runner for Netflix capturer.
   */
  async function runNetflixTests() {
    const results = {
      name: 'netflix',
      passed: true,
      errors: [],
      track: null,
      tests: []
    };

    const NetflixCapturer = (global.__SC && global.__SC.capturers && global.__SC.capturers['netflix'])
      || global.SubtitlesCapturers?.netflix
      || (typeof require !== 'undefined' ? require('../index.js') : null);

    if (!NetflixCapturer) {
      const err = 'NetflixCapturer module is not loaded or found';
      console.error('[Failed] ' + err);
      results.passed = false;
      results.errors.push(err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    console.log('--- Starting Netflix Capturer Test Suite ---');

    // Test 1: Netflix Player API Mock Validation
    const test1 = { name: 'Netflix Player API Mock Hierarchy Resolution', passed: true, errors: [] };
    try {
      const resolvedApi = NetflixCapturer.getVideoPlayerApi(global);
      if (!resolvedApi || typeof resolvedApi.getAllPlayerSessionIds !== 'function') {
        throw new Error('Failed to resolve videoPlayer API from window.netflix hierarchy');
      }
      const sessionIds = resolvedApi.getAllPlayerSessionIds();
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        throw new Error('getAllPlayerSessionIds() returned empty list');
      }
      const player = resolvedApi.getVideoPlayerBySessionId(sessionIds[0]);
      if (!player || typeof player.getTimedTextTrackList !== 'function') {
        throw new Error('getVideoPlayerBySessionId() failed to return player with getTimedTextTrackList');
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

    // Test 2: detectPlayerApi Filtering & URL Resolution
    const test2 = { name: 'NetflixCapturer.detectPlayerApi (Exclusion of isNone, URL Resolution)', passed: true, errors: [] };
    try {
      const detected = NetflixCapturer.detectPlayerApi(global);
      // MOCK_NETFLIX_TRACK_LIST has 3 items, 1 of which is isNone: true. So 2 tracks should be detected.
      if (!Array.isArray(detected) || detected.length !== 2) {
        throw new Error(`Expected 2 valid tracks (excluding isNone), got: ${detected?.length}`);
      }

      const enTrack = detected.find(t => t.language === 'en');
      if (!enTrack || enTrack.kind !== 'captions' || !enTrack.url.includes('ttml_en.xml')) {
        throw new Error(`English SDH track resolution failed: ${JSON.stringify(enTrack)}`);
      }

      const ruTrack = detected.find(t => t.language === 'ru');
      if (!ruTrack || ruTrack.kind !== 'subtitles' || !ruTrack.url.includes('vtt_ru.vtt')) {
        throw new Error(`Russian track resolution failed: ${JSON.stringify(ruTrack)}`);
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

    // Test 3: TTML / IMSC Timed-Text Parsing & Tag Cleaning
    const test3 = { name: 'Netflix TTML / IMSC XML Parsing & Model Normalization', passed: true, errors: [] };
    try {
      const parsedTrack = NetflixCapturer.parse(NETFLIX_TTML_FIXTURE_EN, {
        id: 'netflix:en',
        language: 'en',
        displayName: 'English [CC]',
        kind: 'captions'
      });

      const errors = [];
      validateSubtitleTrack(parsedTrack, errors);
      if (errors.length > 0) {
        throw new Error(`SubtitleTrack validation errors: ${errors.join('; ')}`);
      }

      if (parsedTrack.format !== 'ttml') {
        throw new Error(`Expected format 'ttml', got: ${parsedTrack.format}`);
      }
      if (parsedTrack.cues.length !== 3) {
        throw new Error(`Expected 3 cues, got: ${parsedTrack.cues.length}`);
      }

      const cue2 = parsedTrack.cues[1];
      if (cue2.text !== 'Capturing IMSC1 / TTML & timed-text subtitles.') {
        throw new Error(`Cue 2 cleaning failed. Expected 'Capturing IMSC1 / TTML & timed-text subtitles.', got: "${cue2.text}"`);
      }
      if (cue2.startMs !== 4200 || cue2.endMs !== 7500) {
        throw new Error(`Cue 2 timings mismatch: startMs=${cue2.startMs}, endMs=${cue2.endMs}`);
      }

      // Check cue with dur attribute
      const cue3 = parsedTrack.cues[2];
      if (cue3.startMs !== 8000 || cue3.endMs !== 11200) {
        throw new Error(`Cue 3 dur timing mismatch: startMs=${cue3.startMs}, endMs=${cue3.endMs}`);
      }
      if (cue3.text !== 'All cues are strictly normalized to SubtitleTrack.') {
        throw new Error(`Cue 3 break cleaning failed, got: "${cue3.text}"`);
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

    // Test 4: WebVTT Sidecar Parsing
    const test4 = { name: 'Netflix Unencrypted Sidecar WebVTT Parsing', passed: true, errors: [] };
    try {
      const parsedVtt = NetflixCapturer.parse(NETFLIX_VTT_FIXTURE_RU, {
        id: 'netflix:ru',
        language: 'ru',
        displayName: 'Русский',
        kind: 'subtitles'
      });

      const errors = [];
      validateSubtitleTrack(parsedVtt, errors);
      if (errors.length > 0) {
        throw new Error(`SubtitleTrack validation errors: ${errors.join('; ')}`);
      }

      if (parsedVtt.format !== 'webvtt') {
        throw new Error(`Expected format 'webvtt', got: ${parsedVtt.format}`);
      }
      if (parsedVtt.cues.length !== 3) {
        throw new Error(`Expected 3 cues, got: ${parsedVtt.cues.length}`);
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

    // Test 5: End-to-End NetflixCapturer.capture()
    const test5 = { name: 'NetflixCapturer.capture (Async End-to-End Extraction)', passed: true, errors: [] };
    try {
      const mockFetch = async (url) => {
        if (url.includes('ttml_en.xml')) return NETFLIX_TTML_FIXTURE_EN;
        if (url.includes('vtt_ru.vtt')) return NETFLIX_VTT_FIXTURE_RU;
        return '';
      };

      const captured = await NetflixCapturer.capture({
        global: global,
        fetchFn: mockFetch
      });

      if (!Array.isArray(captured) || captured.length !== 2) {
        throw new Error(`Expected 2 captured tracks, got: ${captured?.length}`);
      }

      const enTrack = captured.find(t => t.language === 'en');
      if (!enTrack || enTrack.cues.length !== 3) {
        throw new Error('Captured English track invalid');
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
      console.log('Passed: All Netflix Capturer tests passed successfully.');
    } else {
      console.error('Failed: Some Netflix Capturer tests failed. Errors:', results.errors);
    }

    global.__TEST_RESULTS__ = results;

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('NETFLIX_TESTS_COMPLETED', { detail: results }));
    }

    return results;
  }

  global.runNetflixTests = runNetflixTests;
  global.createMockNetflixVideoPlayer = createMockNetflixVideoPlayer;
  global.MOCK_NETFLIX_TRACK_LIST = MOCK_NETFLIX_TRACK_LIST;
  global.NETFLIX_TTML_FIXTURE_EN = NETFLIX_TTML_FIXTURE_EN;
  global.NETFLIX_VTT_FIXTURE_RU = NETFLIX_VTT_FIXTURE_RU;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => runNetflixTests());
    } else {
      setTimeout(() => runNetflixTests(), 50);
    }
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      runNetflixTests,
      createMockNetflixVideoPlayer,
      validateSubtitleTrack,
      MOCK_NETFLIX_TRACK_LIST,
      NETFLIX_TTML_FIXTURE_EN,
      NETFLIX_VTT_FIXTURE_RU
    };
    if (require.main === module) {
      runNetflixTests();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
