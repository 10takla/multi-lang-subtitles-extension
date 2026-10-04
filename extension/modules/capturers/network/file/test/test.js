/**
 * Video Subtitles Capturer - Direct File Module Test Suite
 * Validates WebVTT (.vtt), SubRip (.srt), and TTML (.ttml) file parsing,
 * network file capture flow, and SubtitleTrack / SubtitleCue model conformance.
 */

(function (global) {
  'use strict';

  // 1. Validation Helper for SubtitleTrack & SubtitleCue model
  function validateSubtitleTrack(track) {
    const errors = [];
    if (!track || typeof track !== 'object') {
      return { valid: false, errors: ['SubtitleTrack must be a valid object'] };
    }
    if (!track.id || typeof track.id !== 'string') {
      errors.push(`track.id must be a non-empty string, received: ${JSON.stringify(track.id)}`);
    }
    if (!Array.isArray(track.cues)) {
      errors.push('track.cues must be an array');
      return { valid: false, errors };
    }
    if (track.cues.length === 0) {
      errors.push('track.cues must contain at least one cue');
    }

    track.cues.forEach((cue, index) => {
      if (typeof cue.startMs !== 'number' || isNaN(cue.startMs) || cue.startMs < 0) {
        errors.push(`Cue[${index}].startMs must be a number >= 0, received: ${cue.startMs}`);
      }
      if (cue.endMs !== null && (typeof cue.endMs !== 'number' || isNaN(cue.endMs) || cue.endMs < cue.startMs)) {
        errors.push(`Cue[${index}].endMs must be a number >= startMs or null, received: ${cue.endMs}`);
      }
      if (typeof cue.text !== 'string' || cue.text.trim().length === 0) {
        errors.push(`Cue[${index}].text must be a non-empty string, received: ${JSON.stringify(cue.text)}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // 2. Local Fixtures (No external network requests)
  const FIXTURES = {
    webvtt: `WEBVTT - Direct Subtitle File

1
00:00:01.000 --> 00:00:03.500
Direct WebVTT subtitle track loaded

2
00:00:04.000 --> 00:00:06.800
Second WebVTT subtitle line verified

3
00:00:07.200 --> 00:00:09.500
Third WebVTT subtitle cue active`,

    srt: `1
00:00:01,200 --> 00:00:03,800
SubRip (.srt) subtitle track parsed

2
00:00:04,500 --> 00:00:07,100
Comma millisecond delimiter converted to ms

3
00:00:07,800 --> 00:00:09,800
Third SRT line synchronized`,

    ttml: `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.500" end="00:00:04.000">TTML timed text subtitle file parsed</p>
      <p begin="00:00:04.500" end="00:00:07.500">XML tags removed and entities decoded</p>
    </div>
  </body>
</tt>`
  };

  // 3. Test Runner
  async function runFileTests() {
    const capturer = global.__SC?.capturers?.['file'] || global.SubtitlesCapturers?.['file'];
    const results = {
      name: 'file',
      passed: true,
      errors: [],
      track: null,
      tests: []
    };

    function recordTest(testName, passed, errorMsg = null, track = null) {
      if (!passed) {
        results.passed = false;
        if (errorMsg) results.errors.push(`[${testName}] ${errorMsg}`);
        console.error(`Failed: ${testName} - ${errorMsg}`);
      } else {
        console.log(`Passed: ${testName}`);
      }
      results.tests.push({
        name: testName,
        passed,
        error: errorMsg,
        track
      });
    }

    if (!capturer) {
      const err = 'FileCapturer module is not loaded or registered in global.__SC.capturers.file';
      recordTest('Module Availability', false, err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    recordTest('Module Availability', true);

    // Test 1: Parse WebVTT file content
    try {
      const vttTrack = capturer.parseVtt(FIXTURES.webvtt, {
        id: 'file_vtt_track',
        language: 'en',
        label: 'WebVTT File'
      });

      const validation = validateSubtitleTrack(vttTrack);
      if (!validation.valid) {
        recordTest('parseVtt(webvtt)', false, validation.errors.join('; '), vttTrack);
      } else {
        recordTest('parseVtt(webvtt)', true, null, vttTrack);
        results.track = vttTrack;
      }
    } catch (e) {
      recordTest('parseVtt(webvtt)', false, e.message);
    }

    // Test 2: Parse SubRip (.srt) file content
    try {
      const srtTrack = capturer.parseSrt(FIXTURES.srt, {
        id: 'file_srt_track',
        language: 'en',
        label: 'SRT File'
      });

      const validation = validateSubtitleTrack(srtTrack);
      if (!validation.valid) {
        recordTest('parseSrt(srt)', false, validation.errors.join('; '), srtTrack);
      } else {
        recordTest('parseSrt(srt)', true, null, srtTrack);
      }
    } catch (e) {
      recordTest('parseSrt(srt)', false, e.message);
    }

    // Test 3: Parse TTML XML file content
    try {
      const ttmlTrack = capturer.parseTtml(FIXTURES.ttml, {
        id: 'file_ttml_track',
        language: 'en',
        label: 'TTML File'
      });

      const validation = validateSubtitleTrack(ttmlTrack);
      if (!validation.valid) {
        recordTest('parseTtml(ttml)', false, validation.errors.join('; '), ttmlTrack);
      } else {
        recordTest('parseTtml(ttml)', true, null, ttmlTrack);
      }
    } catch (e) {
      recordTest('parseTtml(ttml)', false, e.message);
    }

    // Test 4: Auto-detect parse format via parse()
    try {
      const autoTrack = capturer.parse(FIXTURES.srt, { id: 'file_auto_srt' });
      const validation = validateSubtitleTrack(autoTrack);
      if (!validation.valid) {
        recordTest('parse(auto-detect srt)', false, validation.errors.join('; '), autoTrack);
      } else if (autoTrack.format !== 'srt') {
        recordTest('parse(auto-detect srt)', false, `Expected format srt, got ${autoTrack.format}`, autoTrack);
      } else {
        recordTest('parse(auto-detect srt)', true, null, autoTrack);
      }
    } catch (e) {
      recordTest('parse(auto-detect srt)', false, e.message);
    }

    // Test 5: Capture from file URL with local fetch mock
    try {
      const mockFetchFn = async (url) => {
        if (url.endsWith('.vtt')) return FIXTURES.webvtt;
        if (url.endsWith('.srt')) return FIXTURES.srt;
        return FIXTURES.ttml;
      };

      const capturedTracks = await capturer.capture({
        url: 'https://mock.example.com/subs.vtt',
        fetchFn: mockFetchFn
      });

      if (!Array.isArray(capturedTracks) || capturedTracks.length === 0) {
        recordTest('capture({ url, fetchFn })', false, 'No tracks returned from file capture');
      } else {
        const validation = validateSubtitleTrack(capturedTracks[0]);
        if (!validation.valid) {
          recordTest('capture({ url, fetchFn })', false, validation.errors.join('; '), capturedTracks[0]);
        } else {
          recordTest('capture({ url, fetchFn })', true, null, capturedTracks[0]);
        }
      }
    } catch (e) {
      recordTest('capture({ url, fetchFn })', false, e.message);
    }

    // Store in global __TEST_RESULTS__
    global.__TEST_RESULTS__ = {
      name: results.name,
      passed: results.passed,
      errors: results.errors,
      track: results.track,
      tests: results.tests
    };

    if (results.passed) {
      console.log('Passed: All File capturer tests passed successfully.');
    } else {
      console.error('Failed: Some File capturer tests failed:', results.errors);
    }

    // Update UI if render function exists
    if (typeof global.updateTestStatusUI === 'function') {
      global.updateTestStatusUI(results);
    }

    return results;
  }

  global.runFileTests = runFileTests;

  // Auto-run on DOM ready or immediate if already loaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(runFileTests, 150);
      });
    } else {
      setTimeout(runFileTests, 150);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
