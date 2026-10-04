/**
 * Video Subtitles Capturer - HLS Module Test Suite
 * Validates HTTP Live Streaming master playlist, media playlist, WebVTT segment parsing,
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
    masterPlaylist: [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Русский",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="ru",URI="subtitles/ru/prog_index.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="en",URI="subtitles/en/prog_index.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2149280,SUBTITLES="subs"',
      'video/720p/prog_index.m3u8'
    ].join('\n'),

    mediaPlaylist: [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:4',
      '#EXT-X-VERSION:3',
      '#EXTINF:3.500,',
      'seg-001.vtt',
      '#EXTINF:3.000,',
      'seg-002.vtt',
      '#EXT-X-ENDLIST'
    ].join('\n'),

    vttSegment: [
      'WEBVTT',
      '',
      '00:00:00.500 --> 00:00:03.000',
      'HLS WebVTT segment parsed',
      '',
      '00:00:03.500 --> 00:00:06.000',
      'Second HLS WebVTT segment cue',
      '',
      '00:00:06.500 --> 00:00:09.500',
      'Adaptive HLS stream cue verified'
    ].join('\n')
  };

  // 3. Test Runner
  async function runHlsTests() {
    const capturer = global.__SC?.capturers?.['hls'] || global.SubtitlesCapturers?.['hls'];
    const results = {
      name: 'hls',
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
      const err = 'HLSCapturer module is not loaded or registered in global.__SC.capturers.hls';
      recordTest('Module Availability', false, err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    recordTest('Module Availability', true);

    // Test 1: Parse WebVTT segment into SubtitleTrack with cues
    try {
      const segmentTrack = capturer.parse(FIXTURES.vttSegment, {
        id: 'hls_segment_en',
        language: 'en',
        label: 'HLS WebVTT Segment'
      });

      const validation = validateSubtitleTrack(segmentTrack);
      if (!validation.valid) {
        recordTest('parse(vttSegment)', false, validation.errors.join('; '), segmentTrack);
      } else {
        recordTest('parse(vttSegment)', true, null, segmentTrack);
        results.track = segmentTrack;
      }
    } catch (e) {
      recordTest('parse(vttSegment)', false, e.message);
    }

    // Test 2: Parse Master Playlist m3u8
    try {
      const masterTracks = capturer.parseMasterPlaylist(FIXTURES.masterPlaylist, 'https://mock.example.com/hls/master.m3u8');
      if (!Array.isArray(masterTracks) || masterTracks.length < 2) {
        recordTest('parseMasterPlaylist()', false, `Expected at least 2 tracks, got ${masterTracks?.length}`);
      } else {
        const ru = masterTracks.find(t => t.language === 'ru');
        const en = masterTracks.find(t => t.language === 'en');
        if (!ru || !en) {
          recordTest('parseMasterPlaylist()', false, 'Missing language tracks (ru/en)');
        } else {
          recordTest('parseMasterPlaylist()', true);
        }
      }
    } catch (e) {
      recordTest('parseMasterPlaylist()', false, e.message);
    }

    // Test 3: Parse Media Playlist m3u8
    try {
      const mediaInfo = capturer.parseMediaPlaylist(FIXTURES.mediaPlaylist, 'https://mock.example.com/hls/');
      if (!mediaInfo || !Array.isArray(mediaInfo.segments) || mediaInfo.segments.length !== 2) {
        recordTest('parseMediaPlaylist()', false, `Expected 2 segments, got ${mediaInfo?.segments?.length}`);
      } else if (mediaInfo.isLive !== false) {
        recordTest('parseMediaPlaylist()', false, 'Expected isLive === false due to #EXT-X-ENDLIST');
      } else {
        recordTest('parseMediaPlaylist()', true);
      }
    } catch (e) {
      recordTest('parseMediaPlaylist()', false, e.message);
    }

    // Test 4: Parse WebVTT segment with timeOffsetMs
    try {
      const offsetMs = 3500;
      const cues = capturer.parseVttSegment(FIXTURES.vttSegment, offsetMs);
      if (!Array.isArray(cues) || cues.length === 0) {
        recordTest('parseVttSegment(offset)', false, 'No cues returned');
      } else {
        // 500ms + 3500ms = 4000ms
        if (cues[0].startMs !== 4000) {
          recordTest('parseVttSegment(offset)', false, `Expected startMs 4000, got ${cues[0].startMs}`);
        } else {
          recordTest('parseVttSegment(offset)', true);
        }
      }
    } catch (e) {
      recordTest('parseVttSegment(offset)', false, e.message);
    }

    // Test 5: Capture from master playlist URL with local fetch mock
    try {
      const mockFetchFn = async (url) => {
        if (url.includes('master.m3u8')) return FIXTURES.masterPlaylist;
        if (url.includes('prog_index.m3u8')) return FIXTURES.mediaPlaylist;
        return FIXTURES.vttSegment;
      };

      const capturedTracks = await capturer.capture({
        masterPlaylistUrl: 'https://mock.example.com/hls/master.m3u8',
        fetchFn: mockFetchFn
      });

      if (!Array.isArray(capturedTracks) || capturedTracks.length === 0) {
        recordTest('capture({ masterPlaylistUrl, fetchFn })', false, 'No tracks returned from HLS capture');
      } else {
        recordTest('capture({ masterPlaylistUrl, fetchFn })', true);
      }
    } catch (e) {
      recordTest('capture({ masterPlaylistUrl, fetchFn })', false, e.message);
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
      console.log('Passed: All HLS capturer tests passed successfully.');
    } else {
      console.error('Failed: Some HLS capturer tests failed:', results.errors);
    }

    // Update UI if render function exists
    if (typeof global.updateTestStatusUI === 'function') {
      global.updateTestStatusUI(results);
    }

    return results;
  }

  global.runHlsTests = runHlsTests;

  // Auto-run on DOM ready or immediate if already loaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(runHlsTests, 150);
      });
    } else {
      setTimeout(runHlsTests, 150);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
