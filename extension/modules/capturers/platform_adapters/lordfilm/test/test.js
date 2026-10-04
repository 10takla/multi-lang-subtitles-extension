/**
 * Unit & Integration Test Suite for Lordfilm Capturer Module
 * Validates extraction from source: { cc: [...] }, direct VTT links,
 * detectConfigs, parse, capture, and SubtitleTrack model normalization.
 */

(function(root) {
  'use strict';

  // Support both Browser and Node.js test execution
  const isNode = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
  const targetGlobal = isNode ? global : root;

  let capturer = targetGlobal.__SC?.capturers?.['lordfilm'] || targetGlobal.SubtitlesCapturers?.['lordfilm'];

  if (!capturer && isNode) {
    try {
      capturer = require('../index.js');
    } catch (e) {
      console.error('Failed to load lordfilm capturer in Node:', e);
    }
  }

  // Sample mock WebVTT fixtures
  const VTT_FIXTURE_RU = `WEBVTT - Lordfilm Russian Subtitles

1
00:00:01.200 --> 00:00:03.800
Привет, это тестовые субтитры для Lordfilm!

2
00:00:04.200 --> 00:00:07.500
Вторая реплика: извлечение из source.cc конфигурации плеера.

3
00:00:08.100 --> 00:00:11.400
Третья реплика: SubtitleTrack модель полностью валидна.
`;

  const VTT_FIXTURE_EN = `WEBVTT - Lordfilm English Subtitles

1
00:00:01.200 --> 00:00:03.800
Hello, this is a test subtitle track for Lordfilm!

2
00:00:04.200 --> 00:00:07.500
Second cue: extraction from source.cc player configuration.

3
00:00:08.100 --> 00:00:11.400
Third cue: SubtitleTrack model is completely normalized.
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
  async function runLordfilmTests() {
    console.log('=== Running Tests for [lordfilm] Capturer ===');

    if (!capturer && targetGlobal.__SC?.capturers?.['lordfilm']) {
      capturer = targetGlobal.__SC.capturers['lordfilm'];
    }

    if (!capturer) {
      const err = 'LordfilmCapturer module is not loaded!';
      console.error(`[FAIL] LoadModule: Failed - ${err}`);
      targetGlobal.__TEST_RESULTS__ = {
        name: 'lordfilm',
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

    // 1. Test: detectConfigs from source: { cc: [...] } JSON
    try {
      const configStr = `
        var playerConfig = {
          source: {
            cc: [
              { "name": "Русский (Full)", "url": "https://lordfilm.local/subs/ru.vtt" },
              { "name": "English (Lordfilm)", "url": "https://lordfilm.local/subs/en.vtt" }
            ]
          }
        };
      `;
      const detected = capturer.detectConfigs(configStr);

      const errors = [];
      if (!Array.isArray(detected) || detected.length !== 2) {
        errors.push(`Expected 2 detected configs, got ${detected ? detected.length : 0}`);
      } else {
        if (!detected.some(t => t.url.includes('ru.vtt') && t.name.includes('Русский'))) {
          errors.push('Missing or invalid Russian track in detected configs');
        }
        if (!detected.some(t => t.url.includes('en.vtt') && t.name.includes('English'))) {
          errors.push('Missing or invalid English track in detected configs');
        }
      }

      recordTest('Lordfilm detectConfigs from source.cc JSON', errors.length === 0, errors);
    } catch (e) {
      recordTest('Lordfilm detectConfigs from source.cc JSON', false, [e.message]);
    }

    // 2. Test: detectConfigs from direct VTT links
    try {
      const directScript = `
        var directSubs = "https://lordfilm.local/cdn/stream_subs.vtt";
      `;
      const detected = capturer.detectConfigs(directScript);

      const errors = [];
      if (!Array.isArray(detected) || detected.length < 1) {
        errors.push(`Expected at least 1 direct VTT detected, got ${detected ? detected.length : 0}`);
      } else if (!detected[0].url.includes('stream_subs.vtt')) {
        errors.push(`Unexpected direct VTT URL: ${detected[0].url}`);
      }

      recordTest('Lordfilm detectConfigs from direct VTT URL', errors.length === 0, errors);
    } catch (e) {
      recordTest('Lordfilm detectConfigs from direct VTT URL', false, [e.message]);
    }

    // 3. Test: capturer.parse with WebVTT string & SubtitleTrack validation
    try {
      const track = capturer.parse(VTT_FIXTURE_RU, {
        id: 'lordfilm:test_ru',
        label: 'Русский',
        language: 'ru'
      });

      const validationErrors = validateSubtitleTrack(track);
      if (validationErrors.length === 0) {
        primaryTrack = track;
      }

      recordTest('Lordfilm capturer.parse WebVTT & SubtitleTrack Model', validationErrors.length === 0, validationErrors, track);
    } catch (e) {
      recordTest('Lordfilm capturer.parse WebVTT & SubtitleTrack Model', false, [e.message]);
    }

    // 4. Test: capturer.capture with mock fetch function
    try {
      const mockFetchFn = async (url) => {
        if (url.includes('en.vtt')) return VTT_FIXTURE_EN;
        return VTT_FIXTURE_RU;
      };

      const capturedTracks = await capturer.capture({
        configs: [
          { name: 'Русский', url: 'https://lordfilm.local/subs/ru.vtt' },
          { name: 'English', url: 'https://lordfilm.local/subs/en.vtt' }
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

      recordTest('Lordfilm capturer.capture with Mock Fetch', errors.length === 0, errors, capturedTracks[0]);
    } catch (e) {
      recordTest('Lordfilm capturer.capture with Mock Fetch', false, [e.message]);
    }

    // Consolidated Results
    const allPassed = testResults.length > 0 && testResults.every(t => t.passed);
    const overallResult = {
      name: 'lordfilm',
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
  targetGlobal.runLordfilmTests = runLordfilmTests;

  // Auto-run in browser or Node
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(runLordfilmTests, 50);
    } else {
      window.addEventListener('DOMContentLoaded', () => setTimeout(runLordfilmTests, 50));
    }
  } else if (isNode) {
    runLordfilmTests();
  }
})(typeof window !== 'undefined' ? window : globalThis);
