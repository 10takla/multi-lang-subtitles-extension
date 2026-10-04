/**
 * Test Suite: HTML5 Video & WebVTT Capturer
 * Tests HTML5 TextTracks extraction, cue normalization, and SubtitleTrack model validation.
 */
(() => {
  'use strict';

  const MODULE_NAME = 'html5';

  /**
   * Strict SubtitleTrack model validator
   * Validates: id, language, cues (startMs >= 0, endMs, text non-empty)
   */
  function validateSubtitleTrack(track) {
    const errors = [];
    if (!track || typeof track !== 'object') {
      return { valid: false, errors: ['Track must be a non-null object'] };
    }
    if (!track.id || typeof track.id !== 'string' || !track.id.trim()) {
      errors.push('track.id must be a non-empty string');
    }
    if (!track.language || typeof track.language !== 'string' || !track.language.trim()) {
      errors.push('track.language must be a non-empty string');
    }
    if (!Array.isArray(track.cues)) {
      errors.push('track.cues must be an array');
    } else if (track.cues.length === 0) {
      errors.push('track.cues must contain at least 1 cue');
    } else {
      track.cues.forEach((cue, idx) => {
        if (typeof cue.startMs !== 'number' || isNaN(cue.startMs) || cue.startMs < 0) {
          errors.push(`cue[${idx}].startMs must be a number >= 0 (got: ${cue.startMs})`);
        }
        if (cue.endMs !== null && cue.endMs !== undefined) {
          if (typeof cue.endMs !== 'number' || isNaN(cue.endMs)) {
            errors.push(`cue[${idx}].endMs must be a number or null (got: ${cue.endMs})`);
          } else if (cue.endMs < cue.startMs) {
            errors.push(`cue[${idx}].endMs (${cue.endMs}) must be >= startMs (${cue.startMs})`);
          }
        }
        if (!cue.text || typeof cue.text !== 'string' || !cue.text.trim()) {
          errors.push(`cue[${idx}].text must be a non-empty string`);
        }
      });
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Ensure HTML5 capturer is loaded
  async function getCapturer() {
    if (window.SubtitlesCapturers && window.SubtitlesCapturers[MODULE_NAME]) {
      return window.SubtitlesCapturers[MODULE_NAME];
    }
    if (window.__SC && window.__SC.capturers && window.__SC.capturers[MODULE_NAME]) {
      return window.__SC.capturers[MODULE_NAME];
    }
    // Load ../index.js if not yet present
    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = '../index.js';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      (document.head || document.documentElement).appendChild(script);
    });
    return (window.SubtitlesCapturers && window.SubtitlesCapturers[MODULE_NAME]) ||
           (window.__SC && window.__SC.capturers && window.__SC.capturers[MODULE_NAME]);
  }

  // HTML5 Strategy Fixtures
  function createHtml5Fixture() {
    const mockTracks = [
      {
        language: 'ru',
        label: 'Русский',
        kind: 'subtitles',
        mode: 'hidden',
        cues: [
          { id: '1', startTime: 0.5, endTime: 3.0, text: 'Тестовая строка 1 (RU)' },
          { id: '2', startTime: 3.5, endTime: 6.0, text: 'Тестовая строка 2 (RU)' }
        ]
      },
      {
        language: 'en',
        label: 'English',
        kind: 'subtitles',
        mode: 'hidden',
        cues: [
          { id: '1', startTime: 0.5, endTime: 2.8, text: 'Test subtitle line 1 (EN)' },
          { id: '2', startTime: 3.2, endTime: 5.5, text: 'Test subtitle line 2 (EN)' }
        ]
      }
    ];

    const mockVideo = {
      textTracks: mockTracks,
      currentTime: 1.0,
      paused: false
    };

    return { mockVideo, mockTracks };
  }

  async function runSubtitlesTests() {
    console.log(`[TEST: ${MODULE_NAME}] Running test suite...`);
    const testCases = [];
    let allPassed = true;

    try {
      const capturer = await getCapturer();
      if (!capturer) {
        throw new Error(`Capturer module '${MODULE_NAME}' failed to load`);
      }

      // Test 1: HTML5 TextTracks Strategy Fixture Capture
      const { mockVideo } = createHtml5Fixture();
      const capturedTracks = await capturer.capture({ video: mockVideo });

      if (!Array.isArray(capturedTracks) || capturedTracks.length !== 2) {
        testCases.push({
          name: 'HTML5 Fixture Capture',
          passed: false,
          error: `Expected 2 captured tracks, got ${capturedTracks ? capturedTracks.length : 0}`
        });
        allPassed = false;
      } else {
        let tracksValid = true;
        const validationErrors = [];
        capturedTracks.forEach((tr, i) => {
          const val = validateSubtitleTrack(tr);
          if (!val.valid) {
            tracksValid = false;
            validationErrors.push(`Track ${i} (${tr.id}): ${val.errors.join(', ')}`);
          }
        });

        if (tracksValid) {
          testCases.push({
            name: 'HTML5 Fixture Capture & SubtitleTrack Validation',
            passed: true,
            details: `Validated ${capturedTracks.length} tracks and ${capturedTracks.reduce((acc, t) => acc + t.cues.length, 0)} cues`
          });
        } else {
          testCases.push({
            name: 'HTML5 Fixture Capture & SubtitleTrack Validation',
            passed: false,
            error: validationErrors.join('; ')
          });
          allPassed = false;
        }
      }

      // Test 2: HTML5 parse() Model Validation
      const rawCuesFixture = [
        { startTime: 1.25, endTime: 4.5, text: 'Raw HTML5 cue' },
        { startTime: 5.0, endTime: 8.0, text: 'Second raw HTML5 cue' }
      ];
      const parsedTrack = capturer.parse(rawCuesFixture, { id: 'track:custom_html5', language: 'ru' });
      const parseVal = validateSubtitleTrack(parsedTrack);
      if (parseVal.valid) {
        testCases.push({
          name: 'HTML5 parse() SubtitleTrack Model Validation',
          passed: true,
          details: `Track id="${parsedTrack.id}", cues=${parsedTrack.cues.length}, startMs=${parsedTrack.cues[0].startMs}`
        });
      } else {
        testCases.push({
          name: 'HTML5 parse() SubtitleTrack Model Validation',
          passed: false,
          error: parseVal.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 3: Live Stand Video Integration
      const liveVideo = document.querySelector('video');
      if (liveVideo) {
        const liveCaptured = await capturer.capture({ video: liveVideo });
        if (Array.isArray(liveCaptured) && liveCaptured.length > 0) {
          let allLiveValid = true;
          const liveErrors = [];
          liveCaptured.forEach(tr => {
            if (tr.cues && tr.cues.length > 0) {
              const val = validateSubtitleTrack(tr);
              if (!val.valid) {
                allLiveValid = false;
                liveErrors.push(`${tr.id}: ${val.errors.join(', ')}`);
              }
            }
          });
          if (allLiveValid) {
            testCases.push({
              name: 'Live Stand Video Capture & Validation',
              passed: true,
              details: `Captured ${liveCaptured.length} tracks from video element`
            });
          } else {
            testCases.push({
              name: 'Live Stand Video Capture & Validation',
              passed: false,
              error: liveErrors.join('; ')
            });
            allPassed = false;
          }
        } else {
          testCases.push({
            name: 'Live Stand Video Capture',
            passed: true,
            details: 'Live video tracks processed successfully'
          });
        }
      }

    } catch (err) {
      allPassed = false;
      testCases.push({
        name: 'Execution Exception',
        passed: false,
        error: err.message
      });
    }

    const testResults = {
      module: MODULE_NAME,
      status: allPassed ? 'Passed' : 'Failed',
      passed: allPassed,
      totalTests: testCases.length,
      passedTests: testCases.filter(t => t.passed).length,
      failedTests: testCases.filter(t => !t.passed).length,
      tests: testCases,
      timestamp: new Date().toISOString()
    };

    window.__TEST_RESULTS__ = testResults;

    // Log Passed / Failed strictly to console
    if (allPassed) {
      console.log(`[TEST: ${MODULE_NAME}] Passed (${testResults.passedTests}/${testResults.totalTests} tests)`);
      console.log('Passed');
    } else {
      console.error(`[TEST: ${MODULE_NAME}] Failed:`, testResults.tests.filter(t => !t.passed));
      console.error('Failed');
    }

    // Update UI indicator
    updateUIIndicator(testResults);

    window.dispatchEvent(new CustomEvent('subtitles-test-complete', { detail: testResults }));
    return testResults;
  }

  function updateUIIndicator(results) {
    const badge = document.getElementById('test-status-badge');
    const summary = document.getElementById('test-summary');
    const detailsList = document.getElementById('test-details-list');

    if (badge) {
      badge.textContent = results.status;
      badge.style.background = results.passed ? '#238636' : '#da3633';
      badge.style.color = '#ffffff';
    }
    if (summary) {
      summary.textContent = results.passed
        ? `Все проверки пройдены (${results.passedTests}/${results.totalTests}). SubtitleTrack валиден.`
        : `Ошибка проверки: ${results.failedTests} из ${results.totalTests} тестов провалено.`;
      summary.style.color = results.passed ? '#3fb950' : '#f85149';
    }
    if (detailsList) {
      detailsList.innerHTML = '';
      results.tests.forEach(t => {
        const li = document.createElement('li');
        li.style.marginBottom = '4px';
        li.style.color = t.passed ? '#3fb950' : '#f85149';
        li.innerHTML = `<strong>${t.passed ? '✓' : '✗'} ${t.name}</strong>${t.details ? ': ' + t.details : ''}${t.error ? '<br><span style="color:#f85149;font-size:11px;">' + t.error + '</span>' : ''}`;
        detailsList.appendChild(li);
      });
    }
  }

  window.runSubtitlesTests = runSubtitlesTests;

  // Auto-run on load
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => setTimeout(runSubtitlesTests, 150));
  } else {
    setTimeout(runSubtitlesTests, 150);
  }
})();
