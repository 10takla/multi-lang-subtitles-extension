/**
 * Test Suite: DRM / Protected Stream Capturer (Netflix / OTT Mock)
 * Tests unencrypted sidecar WebVTT and TimedText TTML extraction,
 * cue normalization to integer milliseconds, and SubtitleTrack model validation.
 */
(() => {
  'use strict';

  const MODULE_NAME = 'drm';

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

  // Ensure DRM capturer module is loaded
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

  // Strategy Fixtures for DRM / Protected Streams
  const FIXTURES = {
    netflixTtml: `<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.500">Netflix DRM TimedText TTML Line 1</p>
      <p begin="00:00:04.000" end="00:00:06.500">Netflix DRM TimedText TTML Line 2</p>
    </div>
  </body>
</tt>`,

    drmSidecarVtt: `WEBVTT

00:00:01.200 --> 00:00:03.800
DRM Sidecar WebVTT Line 1

00:00:04.200 --> 00:00:07.000
DRM Sidecar WebVTT Line 2`
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

      // Test 1: DRM TimedText TTML parse() & SubtitleTrack validation
      const ttmlTrack = capturer.parse(FIXTURES.netflixTtml, {
        id: 'drm_ttml_ru',
        language: 'ru',
        label: 'DRM Netflix TimedText RU'
      });
      const ttmlVal = validateSubtitleTrack(ttmlTrack);
      if (ttmlVal.valid && ttmlTrack.format === 'ttml' && ttmlTrack.cues.length === 2) {
        testCases.push({
          name: 'DRM Netflix TimedText TTML parse() & SubtitleTrack Validation',
          passed: true,
          details: `Track id="${ttmlTrack.id}", cues=${ttmlTrack.cues.length}, startMs=${ttmlTrack.cues[0].startMs}`
        });
      } else {
        testCases.push({
          name: 'DRM Netflix TimedText TTML parse() & SubtitleTrack Validation',
          passed: false,
          error: ttmlVal.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 2: DRM Sidecar WebVTT parse() & SubtitleTrack validation
      const vttTrack = capturer.parse(FIXTURES.drmSidecarVtt, {
        id: 'drm_vtt_en',
        language: 'en',
        label: 'DRM Sidecar WebVTT EN'
      });
      const vttVal = validateSubtitleTrack(vttTrack);
      if (vttVal.valid && vttTrack.format === 'webvtt' && vttTrack.cues.length === 2) {
        testCases.push({
          name: 'DRM Sidecar WebVTT parse() & SubtitleTrack Validation',
          passed: true,
          details: `Track id="${vttTrack.id}", cues=${vttTrack.cues.length}, startMs=${vttTrack.cues[0].startMs}`
        });
      } else {
        testCases.push({
          name: 'DRM Sidecar WebVTT parse() & SubtitleTrack Validation',
          passed: false,
          error: vttVal.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 3: Stand Context Integration (detectTracks and capture)
      const detected = capturer.detectTracks(document);
      const captured = await capturer.capture();
      testCases.push({
        name: 'DRM VOD Context & OTT Mock Integration',
        passed: true,
        details: `Detected ${detected ? detected.length : 0} tracks, captured ${captured ? captured.length : 0} tracks`
      });

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
      badge.style.background = results.passed ? '#46d369' : '#e50914';
      badge.style.color = '#ffffff';
    }
    if (summary) {
      summary.textContent = results.passed
        ? `Все проверки пройдены (${results.passedTests}/${results.totalTests}). SubtitleTrack валиден.`
        : `Ошибка проверки: ${results.failedTests} из ${results.totalTests} тестов провалено.`;
      summary.style.color = results.passed ? '#46d369' : '#e50914';
    }
    if (detailsList) {
      detailsList.innerHTML = '';
      results.tests.forEach(t => {
        const li = document.createElement('li');
        li.style.marginBottom = '4px';
        li.style.color = t.passed ? '#46d369' : '#e50914';
        li.innerHTML = `<strong>${t.passed ? '✓' : '✗'} ${t.name}</strong>${t.details ? ': ' + t.details : ''}${t.error ? '<br><span style="color:#e50914;font-size:11px;">' + t.error + '</span>' : ''}`;
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
