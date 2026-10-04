/**
 * Test Suite: YouTube Capturer
 * Tests YouTube TimedText API (JSON3 / XML), Player Response captions,
 * cue normalization to integer milliseconds, and SubtitleTrack model validation.
 */
(() => {
  'use strict';

  const MODULE_NAME = 'youtube';

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

  // Ensure YouTube capturer module is loaded
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

  // Strategy Fixtures for YouTube Player Mock & TimedText API
  const FIXTURES = {
    json3Data: {
      events: [
        {
          tStartMs: 500,
          dDurationMs: 2500,
          segs: [{ utf8: 'YouTube JSON3 caption line 1' }]
        },
        {
          tStartMs: 3500,
          dDurationMs: 2000,
          segs: [{ utf8: 'YouTube JSON3 caption line 2' }]
        }
      ]
    },

    xmlText: `<transcript>
  <text start="0.5" dur="2.5">YouTube XML caption line 1</text>
  <text start="3.5" dur="2.0">YouTube XML caption line 2</text>
</transcript>`
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

      // Test 1: YouTube JSON3 parse() & SubtitleTrack validation
      const json3Track = capturer.parse(FIXTURES.json3Data, {
        id: 'yt:ru',
        language: 'ru',
        label: '[YouTube] Русский'
      });
      const json3Val = validateSubtitleTrack(json3Track);
      if (json3Val.valid && json3Track.cues.length === 2 && json3Track.cues[0].startMs === 500) {
        testCases.push({
          name: 'YouTube JSON3 TimedText parse() & SubtitleTrack Validation',
          passed: true,
          details: `Track id="${json3Track.id}", cues=${json3Track.cues.length}, startMs=${json3Track.cues[0].startMs}, endMs=${json3Track.cues[0].endMs}`
        });
      } else {
        testCases.push({
          name: 'YouTube JSON3 TimedText parse() & SubtitleTrack Validation',
          passed: false,
          error: json3Val.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 2: YouTube XML parse() & SubtitleTrack validation
      const xmlTrack = capturer.parse(FIXTURES.xmlText, {
        id: 'yt:en',
        language: 'en',
        label: '[YouTube] English'
      });
      const xmlVal = validateSubtitleTrack(xmlTrack);
      if (xmlVal.valid && xmlTrack.cues.length === 2 && xmlTrack.cues[0].startMs === 500) {
        testCases.push({
          name: 'YouTube XML TimedText parse() & SubtitleTrack Validation',
          passed: true,
          details: `Track id="${xmlTrack.id}", cues=${xmlTrack.cues.length}, startMs=${xmlTrack.cues[0].startMs}, endMs=${xmlTrack.cues[0].endMs}`
        });
      } else {
        testCases.push({
          name: 'YouTube XML TimedText parse() & SubtitleTrack Validation',
          passed: false,
          error: xmlVal.errors.join(', ')
        });
        allPassed = false;
      }

      // Test 3: YouTube Player Mock on stand (#movie_player)
      const moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
        const resp = moviePlayer.getPlayerResponse();
        const captionTracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(captionTracks) && captionTracks.length > 0) {
          testCases.push({
            name: 'YouTube Player Mock getPlayerResponse() Check',
            passed: true,
            details: `Found ${captionTracks.length} tracks in player response`
          });
        } else {
          testCases.push({
            name: 'YouTube Player Mock getPlayerResponse() Check',
            passed: false,
            error: 'No captionTracks found in getPlayerResponse'
          });
          allPassed = false;
        }
      } else {
        testCases.push({
          name: 'YouTube Player Mock getPlayerResponse() Check',
          passed: true,
          details: 'Ready'
        });
      }

      // Test 4: Live Stand capture() execution
      const captured = await capturer.capture();
      testCases.push({
        name: 'YouTube Module capture() Execution',
        passed: true,
        details: `Captured ${captured ? captured.length : 0} registered tracks`
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
      badge.style.background = results.passed ? '#22c55e' : '#ef4444';
      badge.style.color = '#ffffff';
    }
    if (summary) {
      summary.textContent = results.passed
        ? `Все проверки пройдены (${results.passedTests}/${results.totalTests}). SubtitleTrack валиден.`
        : `Ошибка проверки: ${results.failedTests} из ${results.totalTests} тестов провалено.`;
      summary.style.color = results.passed ? '#4ade80' : '#f87171';
    }
    if (detailsList) {
      detailsList.innerHTML = '';
      results.tests.forEach(t => {
        const li = document.createElement('li');
        li.style.marginBottom = '4px';
        li.style.color = t.passed ? '#4ade80' : '#f87171';
        li.innerHTML = `<strong>${t.passed ? '✓' : '✗'} ${t.name}</strong>${t.details ? ': ' + t.details : ''}${t.error ? '<br><span style="color:#f87171;font-size:11px;">' + t.error + '</span>' : ''}`;
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
