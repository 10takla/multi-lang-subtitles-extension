/**
 * Test Suite: Hardsub Capturer (Visual OCR / Canvas Frames)
 * Tests hardcoded burned-in subtitle frames extraction, canvas processing,
 * cue normalization to integer milliseconds, and SubtitleTrack model validation.
 */
(() => {
  'use strict';

  const MODULE_NAME = 'hardsub';

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

  // Ensure hardsub capturer module is loaded
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

  // Strategy Fixtures for Hardsub / Frame OCR
  const FIXTURES = {
    framesArray: [
      { id: 'ocr_frame_1', startMs: 500, endMs: 3000, text: 'Первая строка вшитых субтитров (Hardsub)' },
      { id: 'ocr_frame_2', startMs: 3500, endMs: 6000, text: 'Вторая строка: визуальный рендеринг' }
    ],

    framesJson: JSON.stringify([
      { id: 'hardsub_json_1', start: 1.0, end: 3.5, text: 'Hardsub frame recognition from JSON' },
      { id: 'hardsub_json_2', start: 4.0, end: 6.5, text: 'Second hardsub frame from JSON' }
    ])
  };

  async function runSubtitlesTests() {
    console.log(`[TEST: ${MODULE_NAME}] Running test suite...`);
    const testCases = [];
    let allPassed = true;

    try {
      const capturer = await getCapturer();
      if (!capturer) {
        throw new Error(`Capturer module '${MODULE_NAME}' failed to load`);
      }

      // Test 1: Hardsub OCR Frame Array parse() & SubtitleTrack validation
      const trackFromArray = capturer.parse(FIXTURES.framesArray, {
        id: 'hardsub_track_ru',
        language: 'ru',
        label: 'Hardsub Track RU'
      });
      const valArray = validateSubtitleTrack(trackFromArray);
      if (valArray.valid && trackFromArray.cues.length === 2 && trackFromArray.cues[0].startMs === 500) {
        testCases.push({
          name: 'Hardsub Frame Array parse() & SubtitleTrack Validation',
          passed: true,
          details: `Track id="${trackFromArray.id}", cues=${trackFromArray.cues.length}, startMs=${trackFromArray.cues[0].startMs}, endMs=${trackFromArray.cues[0].endMs}`
        });
      } else {
        testCases.push({
          name: 'Hardsub Frame Array parse() & SubtitleTrack Validation',
          passed: false,
          error: valArray.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 2: Hardsub JSON recognition log parse() & SubtitleTrack validation
      const trackFromJson = capturer.parse(FIXTURES.framesJson, {
        id: 'hardsub_track_en',
        language: 'en',
        label: 'Hardsub Track EN'
      });
      const valJson = validateSubtitleTrack(trackFromJson);
      if (valJson.valid && trackFromJson.cues.length === 2 && trackFromJson.cues[0].startMs === 1000) {
        testCases.push({
          name: 'Hardsub JSON Log parse() & SubtitleTrack Validation',
          passed: true,
          details: `Track id="${trackFromJson.id}", cues=${trackFromJson.cues.length}, startMs=${trackFromJson.cues[0].startMs}`
        });
      } else {
        testCases.push({
          name: 'Hardsub JSON Log parse() & SubtitleTrack Validation',
          passed: false,
          error: valJson.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 3: Hardsub Canvas processFrame() execution
      const canvas = document.getElementById('canvas-overlay') || document.createElement('canvas');
      const frameResult = capturer.processFrame(canvas, 1500);
      if (frameResult && typeof frameResult.startMs === 'number' && frameResult.startMs >= 0) {
        testCases.push({
          name: 'Hardsub Canvas processFrame() Execution',
          passed: true,
          details: `Processed frame at timestampMs=${frameResult.startMs}, endMs=${frameResult.endMs}`
        });
      } else {
        testCases.push({
          name: 'Hardsub Canvas processFrame() Execution',
          passed: false,
          error: 'Invalid frame output'
        });
        allPassed = false;
      }

      // Test 4: Live capture() execution with active visual caption
      const video = document.querySelector('video');
      const capturedTracks = await capturer.capture({
        video: video,
        text: 'Активная реплика Hardsub',
        language: 'ru'
      });
      if (Array.isArray(capturedTracks) && capturedTracks.length > 0) {
        const valCapture = validateSubtitleTrack(capturedTracks[0]);
        if (valCapture.valid) {
          testCases.push({
            name: 'Hardsub capture() & SubtitleTrack Validation',
            passed: true,
            details: `Captured track ${capturedTracks[0].id} with ${capturedTracks[0].cues.length} active cues`
          });
        } else {
          testCases.push({
            name: 'Hardsub capture() & SubtitleTrack Validation',
            passed: false,
            error: valCapture.errors.join(', ')
          });
          allPassed = false;
        }
      } else {
        testCases.push({
          name: 'Hardsub capture() Execution',
          passed: false,
          error: 'Expected at least 1 track from capture()'
        });
        allPassed = false;
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

    // Log strictly Passed / Failed to console
    if (allPassed) {
      console.log(`[TEST: ${MODULE_NAME}] Passed (${testResults.passedTests}/${testResults.totalTests} tests)`);
      console.log('Passed');
    } else {
      console.error(`[TEST: ${MODULE_NAME}] Failed:`, testResults.tests.filter(t => !t.passed));
      console.error('Failed');
    }

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
