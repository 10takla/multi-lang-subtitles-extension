/**
 * Video Subtitles Capturer - DASH Module Test Suite
 * Validates MPEG-DASH MPD manifest parsing, TTML timed text cue parsing,
 * network capture flow, and SubtitleTrack / SubtitleCue model conformance.
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
    // DASH TTML XML subtitle segment
    ttmlSegment: `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xml:lang="en">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.500">MPEG-DASH stream initialized with TTML timed text</p>
      <p begin="00:00:04.000" end="00:00:06.800">Second subtitle cue parsed from DASH AdaptationSet</p>
      <p begin="00:00:07.200" end="00:00:09.500">High precision cue synchronization confirmed</p>
    </div>
  </body>
</tt>`,

    // MPD Manifest containing subtitle AdaptationSets
    mpdManifest: `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" minBufferTime="PT2S">
  <Period id="P0" start="PT0S">
    <AdaptationSet id="sub-ru" contentType="text" mimeType="application/ttml+xml" lang="ru">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <BaseURL>dash_sub_ru.ttml</BaseURL>
      <Representation id="rep-sub-ru" bandwidth="1000"/>
    </AdaptationSet>
    <AdaptationSet id="sub-en" contentType="text" mimeType="application/ttml+xml" lang="en">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <BaseURL>dash_sub_en.ttml</BaseURL>
      <Representation id="rep-sub-en" bandwidth="1000"/>
    </AdaptationSet>
  </Period>
</MPD>`
  };

  // 3. Test Runner
  async function runDashTests() {
    const capturer = global.__SC?.capturers?.['dash'] || global.SubtitlesCapturers?.['dash'];
    const results = {
      name: 'dash',
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
      const err = 'DASHCapturer module is not loaded or registered in global.__SC.capturers.dash';
      recordTest('Module Availability', false, err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    recordTest('Module Availability', true);

    // Test 1: Parse TTML subtitle chunk into SubtitleTrack with cues
    try {
      const ttmlTrack = capturer.parse(FIXTURES.ttmlSegment, {
        id: 'dash_ttml_en',
        language: 'en',
        label: 'DASH TTML (en)'
      });

      const validation = validateSubtitleTrack(ttmlTrack);
      if (!validation.valid) {
        recordTest('parse(ttmlSegment)', false, validation.errors.join('; '), ttmlTrack);
      } else {
        recordTest('parse(ttmlSegment)', true, null, ttmlTrack);
        results.track = ttmlTrack;
      }
    } catch (e) {
      recordTest('parse(ttmlSegment)', false, e.message);
    }

    // Test 2: Parse MPD XML Manifest for subtitle tracks
    try {
      const manifestTracks = capturer.parse(FIXTURES.mpdManifest, {
        baseUrl: 'https://mock.example.com/dash/manifest.mpd'
      });

      if (!Array.isArray(manifestTracks) || manifestTracks.length < 2) {
        recordTest('parse(mpdManifest)', false, `Expected at least 2 tracks from MPD manifest, got ${manifestTracks?.length}`);
      } else {
        const ruTrack = manifestTracks.find(t => t.language === 'ru');
        const enTrack = manifestTracks.find(t => t.language === 'en');
        if (!ruTrack || !enTrack) {
          recordTest('parse(mpdManifest)', false, 'Missing language track descriptors (ru/en)');
        } else {
          recordTest('parse(mpdManifest)', true);
        }
      }
    } catch (e) {
      recordTest('parse(mpdManifest)', false, e.message);
    }

    // Test 3: Parse TTML with timeOffsetMs
    try {
      const offsetMs = 5000;
      const offsetTrack = capturer.parse(FIXTURES.ttmlSegment, {
        id: 'dash_ttml_offset',
        timeOffsetMs: offsetMs
      });

      const validation = validateSubtitleTrack(offsetTrack);
      if (!validation.valid) {
        recordTest('parse(ttmlSegment with offset)', false, validation.errors.join('; '), offsetTrack);
      } else {
        const firstCue = offsetTrack.cues[0];
        // 1.0s + 5.0s = 6000ms
        if (firstCue.startMs !== 6000) {
          recordTest('parse(ttmlSegment with offset)', false, `Expected startMs 6000, got ${firstCue.startMs}`, offsetTrack);
        } else {
          recordTest('parse(ttmlSegment with offset)', true, null, offsetTrack);
        }
      }
    } catch (e) {
      recordTest('parse(ttmlSegment with offset)', false, e.message);
    }

    // Test 4: Capture via manifestUrl with local fetch mock
    try {
      const mockFetchFn = async (url) => {
        if (url.includes('manifest.mpd')) {
          return FIXTURES.mpdManifest;
        }
        return FIXTURES.ttmlSegment;
      };

      const capturedTracks = await capturer.capture({
        manifestUrl: 'https://mock.example.com/dash/manifest.mpd',
        fetchFn: mockFetchFn
      });

      if (!Array.isArray(capturedTracks) || capturedTracks.length === 0) {
        recordTest('capture({ manifestUrl, fetchFn })', false, 'No tracks returned from manifest capture');
      } else {
        recordTest('capture({ manifestUrl, fetchFn })', true);
      }
    } catch (e) {
      recordTest('capture({ manifestUrl, fetchFn })', false, e.message);
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
      console.log('Passed: All DASH capturer tests passed successfully.');
    } else {
      console.error('Failed: Some DASH capturer tests failed:', results.errors);
    }

    // Update UI if render function exists
    if (typeof global.updateTestStatusUI === 'function') {
      global.updateTestStatusUI(results);
    }

    return results;
  }

  global.runDashTests = runDashTests;

  // Auto-run on DOM ready or immediate if already loaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(runDashTests, 150);
      });
    } else {
      setTimeout(runDashTests, 150);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
