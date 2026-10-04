/**
 * Unit & Integration Test Suite for Mult-fan Capturer Module
 * Validates South Park mult-fan.tv #player1514 subtitle parsing,
 * detectConfigs, parse, capture, and SubtitleTrack model normalization.
 */

(function(root) {
  'use strict';

  // Support both Browser and Node.js test execution
  const isNode = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
  const targetGlobal = isNode ? global : root;

  let capturer = targetGlobal.__SC?.capturers?.['multfan'] || targetGlobal.SubtitlesCapturers?.['multfan'];

  if (!capturer && isNode) {
    try {
      capturer = require('../index.js');
    } catch (e) {
      console.error('Failed to load multfan capturer in Node:', e);
    }
  }

  // Sample mock WebVTT fixtures
  const VTT_FIXTURE_EN = `WEBVTT - Mult-fan South Park English

1
00:00:00.800 --> 00:00:03.200
Oh my god, they killed Kenny!

2
00:00:03.500 --> 00:00:06.000
You bastards!

3
00:00:06.500 --> 00:00:09.500
Going down to South Park, gonna have myself a time.
`;

  const VTT_FIXTURE_RU = `WEBVTT - Mult-fan South Park Russian

1
00:00:00.800 --> 00:00:03.200
О боже мой, они убили Кенни!

2
00:00:03.500 --> 00:00:06.000
Сволочи!

3
00:00:06.500 --> 00:00:09.500
Едем мы в Южный Парк, чтобы весело провести время.
`;

  // Model Validator for unified SubtitleTrack
  function validateSubtitleTrack(track) {
    const errors = [];
    if (!track || typeof track !== 'object') {
      errors.push('Track must be an object');
      return errors;
    }
    if (typeof track.id !== 'string' || track.id.trim().length === 0) {
      errors.push(`Track id must be a non-empty string. Got: ${JSON.stringify(track.id)}`);
    }
    if (!Array.isArray(track.cues)) {
      errors.push('Track cues must be an array');
      return errors;
    }
    if (track.cues.length === 0) {
      errors.push('Track cues array must not be empty');
    }

    track.cues.forEach((cue, idx) => {
      if (typeof cue.startMs !== 'number' || isNaN(cue.startMs) || cue.startMs < 0) {
        errors.push(`Cue[${idx}] startMs must be a number >= 0. Got: ${cue.startMs}`);
      }
      if (cue.endMs !== null && (typeof cue.endMs !== 'number' || isNaN(cue.endMs) || cue.endMs < cue.startMs)) {
        errors.push(`Cue[${idx}] endMs must be null or number >= startMs (${cue.startMs}). Got: ${cue.endMs}`);
      }
      if (typeof cue.text !== 'string' || cue.text.trim().length === 0) {
        errors.push(`Cue[${idx}] text must be a non-empty string. Got: ${JSON.stringify(cue.text)}`);
      }
    });

    return errors;
  }

  // Test Runner
  async function runMultFanTests() {
    console.log('=== Running Tests for [multfan] Capturer ===');

    if (!capturer && targetGlobal.__SC?.capturers?.['multfan']) {
      capturer = targetGlobal.__SC.capturers['multfan'];
    }

    if (!capturer) {
      const err = 'MultFanCapturer module is not loaded!';
      console.error(`[FAIL] LoadModule: Failed - ${err}`);
      targetGlobal.__TEST_RESULTS__ = {
        name: 'multfan',
        passed: false,
        errors: [err],
        track: null,
        tests: []
      };
      return targetGlobal.__TEST_RESULTS__;
    }

    const testResults = [];
    let allErrors = [];
    let primaryTrack = null;

    function recordTest(testName, passed, errors = [], track = null) {
      if (passed) {
        console.log(`[PASS] ${testName}: Passed`);
      } else {
        console.error(`[FAIL] ${testName}: Failed -> ${errors.join('; ')}`);
        allErrors.push(`${testName}: ${errors.join(', ')}`);
      }
      testResults.push({ name: testName, passed, errors, track });
    }

    // 1. Test: parseSubtitleConfig
    try {
      const configStr = '[Вкл.]https://south-park.mult-fan.tv/captions/eng/15/1514.vtt,[Русские]https://south-park.mult-fan.tv/captions/rus/15/1514.vtt';
      const parsedTracks = capturer.parseSubtitleConfig(configStr);

      const errors = [];
      if (!Array.isArray(parsedTracks) || parsedTracks.length !== 2) {
        errors.push(`Expected 2 parsed tracks, got ${parsedTracks ? parsedTracks.length : 0}`);
      } else {
        if (parsedTracks[0].label !== 'Вкл.' || !parsedTracks[0].url.includes('1514.vtt')) {
          errors.push(`Unexpected track 0: ${JSON.stringify(parsedTracks[0])}`);
        }
        if (parsedTracks[1].label !== 'Русские' || !parsedTracks[1].url.includes('rus')) {
          errors.push(`Unexpected track 1: ${JSON.stringify(parsedTracks[1])}`);
        }
      }

      recordTest('Multfan parseSubtitleConfig [Вкл.]url parser', errors.length === 0, errors);
    } catch (e) {
      recordTest('Multfan parseSubtitleConfig [Вкл.]url parser', false, [e.message]);
    }

    // 2. Test: detectConfigs from script content & Playerjs subtitle config
    try {
      const scriptContent = `
        var player1514 = new Playerjs({
          id: "player1514",
          subtitle: "[Вкл.]https://south-park.mult-fan.tv/captions/eng/15/1514.vtt,[Русские]https://south-park.mult-fan.tv/captions/rus/15/1514.vtt"
        });
      `;
      const detected = capturer.detectConfigs(scriptContent);

      const errors = [];
      if (!Array.isArray(detected) || detected.length !== 2) {
        errors.push(`Expected 2 detected tracks, got ${detected ? detected.length : 0}`);
      } else {
        if (!detected.some(t => t.url.includes('/eng/') && t.label === 'Вкл.')) {
          errors.push('Missing or invalid English track in detected configs');
        }
        if (!detected.some(t => t.url.includes('/rus/') && t.label === 'Русские')) {
          errors.push('Missing or invalid Russian track in detected configs');
        }
      }

      recordTest('Multfan detectConfigs from script string', errors.length === 0, errors);
    } catch (e) {
      recordTest('Multfan detectConfigs from script string', false, [e.message]);
    }

    // 3. Test: capturer.parse with WebVTT string & SubtitleTrack validation
    try {
      const track = capturer.parse(VTT_FIXTURE_RU, {
        id: 'multfan:test_1514_ru',
        label: 'Русские',
        language: 'ru'
      });

      const validationErrors = validateSubtitleTrack(track);
      if (validationErrors.length === 0) {
        primaryTrack = track;
      }

      recordTest('Multfan capturer.parse WebVTT & SubtitleTrack Model', validationErrors.length === 0, validationErrors, track);
    } catch (e) {
      recordTest('Multfan capturer.parse WebVTT & SubtitleTrack Model', false, [e.message]);
    }

    // 4. Test: capturer.capture with mock fetch function
    try {
      const mockFetchFn = async (url) => {
        if (url.includes('/rus/')) return VTT_FIXTURE_RU;
        return VTT_FIXTURE_EN;
      };

      const capturedTracks = await capturer.capture({
        configs: [
          { label: 'Вкл.', url: 'https://south-park.mult-fan.tv/captions/eng/15/1514.vtt' },
          { label: 'Русские', url: 'https://south-park.mult-fan.tv/captions/rus/15/1514.vtt' }
        ],
        fetchFn: mockFetchFn
      });

      const errors = [];
      if (!Array.isArray(capturedTracks) || capturedTracks.length !== 2) {
        errors.push(`Expected 2 captured tracks, got ${capturedTracks ? capturedTracks.length : 0}`);
      } else {
        capturedTracks.forEach((t, i) => {
          const tErrors = validateSubtitleTrack(t);
          if (tErrors.length > 0) {
            errors.push(`Track ${i} invalid: ${tErrors.join(', ')}`);
          }
        });
      }

      recordTest('Multfan capturer.capture with Mock Fetch', errors.length === 0, errors, capturedTracks[0]);
    } catch (e) {
      recordTest('Multfan capturer.capture with Mock Fetch', false, [e.message]);
    }

    // Consolidated Results
    const allPassed = testResults.length > 0 && testResults.every(t => t.passed);
    const overallResult = {
      name: 'multfan',
      passed: allPassed,
      errors: allErrors,
      track: primaryTrack || (testResults[testResults.length - 1]?.track || null),
      tests: testResults
    };

    targetGlobal.__TEST_RESULTS__ = overallResult;

    // Update UI in test stand if DOM elements exist
    if (typeof document !== 'undefined') {
      const statusBadge = document.getElementById('test-status-badge');
      const testListEl = document.getElementById('test-items-list');
      const cuePreviewEl = document.getElementById('cue-preview-body');

      if (statusBadge) {
        statusBadge.textContent = allPassed ? 'PASSED' : 'FAILED';
        statusBadge.className = `status-badge ${allPassed ? 'passed' : 'failed'}`;
      }

      if (testListEl) {
        testListEl.innerHTML = '';
        testResults.forEach(tr => {
          const li = document.createElement('li');
          li.className = `test-item ${tr.passed ? 'passed' : 'failed'}`;
          li.innerHTML = `
            <span class="test-icon">${tr.passed ? '✔' : '✖'}</span>
            <span class="test-name">${tr.name}</span>
            <span class="test-result">${tr.passed ? 'Passed' : 'Failed'}</span>
            ${tr.errors.length ? `<div class="test-error-msg">${tr.errors.join('<br>')}</div>` : ''}
          `;
          testListEl.appendChild(li);
        });
      }

      if (cuePreviewEl && primaryTrack && Array.isArray(primaryTrack.cues)) {
        cuePreviewEl.innerHTML = '';
        primaryTrack.cues.forEach(cue => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><code>${cue.id || '-'}</code></td>
            <td>${(cue.startMs / 1000).toFixed(3)}s (${cue.startMs}ms)</td>
            <td>${cue.endMs !== null ? (cue.endMs / 1000).toFixed(3) + 's (' + cue.endMs + 'ms)' : 'null'}</td>
            <td><strong>${cue.text}</strong></td>
          `;
          cuePreviewEl.appendChild(tr);
        });
      }
    }

    return overallResult;
  }

  // Expose test runner
  targetGlobal.runMultFanTests = runMultFanTests;

  // Auto-run in browser or Node
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(runMultFanTests, 50);
    } else {
      window.addEventListener('DOMContentLoaded', () => setTimeout(runMultFanTests, 50));
    }
  } else if (isNode) {
    runMultFanTests();
  }
})(typeof window !== 'undefined' ? window : globalThis);
