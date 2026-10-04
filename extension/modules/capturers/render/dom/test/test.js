/**
 * Video Subtitles Capturer - DOM Capturer Test Suite
 * Automated and manual validation of DOMCapturer module, DOM element extraction,
 * MutationObserver monitoring, and SubtitleTrack model normalization.
 */

(function(global) {
  'use strict';

  // Environment fallback for running under Node.js
  let isNode = typeof document === 'undefined';
  let doc = !isNode ? document : null;

  if (isNode) {
    // Lightweight mock DOM for Node.js test runner
    class MockNode {
      constructor(tagName = 'div', className = '', textContent = '') {
        this.tagName = tagName.toUpperCase();
        this.className = className;
        this.textContent = textContent;
        this.children = [];
        this.parentNode = null;
        this.offsetParent = {};
      }

      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      }

      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          this.children.splice(idx, 1);
        }
        return child;
      }

      querySelector(sel) {
        const matches = this.querySelectorAll(sel);
        return matches[0] || null;
      }

      querySelectorAll(sel) {
        const results = [];
        const matchClass = sel.startsWith('.') ? sel.slice(1) : null;
        const matchTag = !sel.startsWith('.') && !sel.startsWith('[') ? sel.toLowerCase() : null;

        function traverse(node) {
          if (matchClass && node.className && node.className.split(/\s+/).includes(matchClass)) {
            results.push(node);
          } else if (matchTag && node.tagName.toLowerCase() === matchTag) {
            results.push(node);
          } else if (sel.includes('_subtitle') && node.className && node.className.includes('subtitle')) {
            results.push(node);
          }

          for (const child of node.children) {
            traverse(child);
          }
        }

        traverse(this);
        return results;
      }
    }

    class MockMutationObserver {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        MockMutationObserver.activeInstances.push(this);
      }

      observe(target, options) {
        this.target = target;
      }

      disconnect() {
        const idx = MockMutationObserver.activeInstances.indexOf(this);
        if (idx !== -1) MockMutationObserver.activeInstances.splice(idx, 1);
      }

      trigger() {
        if (this.callback) this.callback([], this);
      }
    }
    MockMutationObserver.activeInstances = [];

    const mockRoot = new MockNode('div', 'root');
    doc = {
      createElement: (tag) => new MockNode(tag),
      body: mockRoot,
      documentElement: mockRoot,
      querySelector: (sel) => mockRoot.querySelector(sel),
      querySelectorAll: (sel) => mockRoot.querySelectorAll(sel)
    };
    global.document = doc;
    global.MutationObserver = MockMutationObserver;
  }

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

    if (track.kind !== 'captions' && track.kind !== 'subtitles' && track.kind !== 'unknown') {
      errors.push(`Track kind is invalid: ${track.kind}`);
    }

    if (track.source !== 'dom') {
      errors.push(`DOM track source should be 'dom', got: ${track.source}`);
    }

    if (track.live !== true) {
      errors.push(`Track.live should be true for DOM capturer, got: ${track.live}`);
    }

    if (track.completeness !== 'active-only') {
      errors.push(`Track.completeness should be 'active-only', got: ${track.completeness}`);
    }

    if (!Array.isArray(track.cues)) {
      errors.push('Track.cues must be an array');
      return false;
    }

    if (track.cues.length === 0) {
      errors.push('Track.cues is empty');
    }

    track.cues.forEach((cue, idx) => {
      if (typeof cue.id !== 'string' || cue.id.length === 0) {
        errors.push(`Cue[${idx}] must have string id, got: ${cue.id}`);
      }
      if (typeof cue.startMs !== 'number' || isNaN(cue.startMs) || cue.startMs < 0) {
        errors.push(`Cue[${idx}] startMs must be a non-negative number, got: ${cue.startMs}`);
      }
      if (cue.endMs !== null && (typeof cue.endMs !== 'number' || isNaN(cue.endMs) || cue.endMs < cue.startMs)) {
        errors.push(`Cue[${idx}] endMs must be null or >= startMs, got: ${cue.endMs}`);
      }
      if (typeof cue.text !== 'string' || cue.text.trim().length === 0) {
        errors.push(`Cue[${idx}] text must be non-empty string, got: ${cue.text}`);
      }
      if (/<[^>]+>/.test(cue.text)) {
        errors.push(`Cue[${idx}] text should not contain uncleaned HTML tags: ${cue.text}`);
      }
    });

    return errors.length === 0;
  }

  /**
   * Helper to create a test container with specified DOM elements.
   */
  function createTestDOMContainer() {
    const container = doc.createElement('div');
    container.className = 'test-player-container';
    return container;
  }

  /**
   * Main test runner for DOMCapturer.
   */
  async function runDOMTests() {
    const results = {
      name: 'dom',
      passed: true,
      errors: [],
      track: null,
      tests: []
    };

    const DOMCapturer = (global.__SC && global.__SC.capturers && global.__SC.capturers['dom'])
      || global.SubtitlesCapturers?.dom
      || (typeof require !== 'undefined' ? require('../index.js') : null);

    if (!DOMCapturer) {
      const err = 'DOMCapturer module is not loaded or found';
      console.error('[Failed] ' + err);
      results.passed = false;
      results.errors.push(err);
      global.__TEST_RESULTS__ = results;
      return results;
    }

    // Ensure observe alias is bound
    if (!DOMCapturer.observe && DOMCapturer.startObserving) {
      DOMCapturer.observe = DOMCapturer.startObserving.bind(DOMCapturer);
    }

    console.log('--- Starting DOM Capturer Test Suite ---');

    // Test 1: Extraction of .ytp-caption-segment elements
    const test1 = { name: 'DOMCapturer.extractActiveText (.ytp-caption-segment)', passed: true, errors: [] };
    try {
      const container = createTestDOMContainer();
      const windowEl = doc.createElement('div');
      windowEl.className = 'caption-window';

      const seg1 = doc.createElement('span');
      seg1.className = 'ytp-caption-segment';
      seg1.textContent = 'Первый сегмент субтитров YouTube';

      const seg2 = doc.createElement('span');
      seg2.className = 'ytp-caption-segment';
      seg2.textContent = 'Второй сегмент в той же строке';

      windowEl.appendChild(seg1);
      windowEl.appendChild(seg2);
      container.appendChild(windowEl);

      const extracted = DOMCapturer.extractActiveText(container);
      if (!extracted.includes('Первый сегмент субтитров YouTube') || !extracted.includes('Второй сегмент в той же строке')) {
        throw new Error(`Failed to extract text from .ytp-caption-segment. Got: "${extracted}"`);
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

    // Test 2: Extraction of .caption-window elements
    const test2 = { name: 'DOMCapturer.extractActiveText (.caption-window standalone)', passed: true, errors: [] };
    try {
      const container = createTestDOMContainer();
      const capWindow = doc.createElement('div');
      capWindow.className = 'caption-window';
      capWindow.textContent = 'Текст внутри окна субтитров caption-window';
      container.appendChild(capWindow);

      const extracted = DOMCapturer.extractActiveText(container);
      if (extracted !== 'Текст внутри окна субтитров caption-window') {
        throw new Error(`Failed to extract from .caption-window. Expected "Текст внутри окна субтитров caption-window", got: "${extracted}"`);
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

    // Test 3: Extraction of .subtitles-overlay elements
    const test3 = { name: 'DOMCapturer.extractActiveText (.subtitles-overlay)', passed: true, errors: [] };
    try {
      const container = createTestDOMContainer();
      const overlayEl = doc.createElement('div');
      overlayEl.className = 'subtitles-overlay';
      overlayEl.textContent = 'Строка субтитров из оверлея плеера';
      container.appendChild(overlayEl);

      const extracted = DOMCapturer.extractActiveText(container);
      if (extracted !== 'Строка субтитров из оверлея плеера') {
        throw new Error(`Failed to extract from .subtitles-overlay. Expected "Строка субтитров из оверлея плеера", got: "${extracted}"`);
      }

      console.log(`[Passed] ${test3.name}`);
    } catch (e) {
      test3.passed = false;
      test3.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test3.name}: ${e.message}`);
      console.error(`[Failed] ${test3.name}: ${e.message}`);
    }
    results.tests.push(test3);

    // Test 4: Live DOM observing via MutationObserver (observe / startObserving)
    const test4 = { name: 'DOMCapturer.observe / startObserving (MutationObserver)', passed: true, errors: [] };
    try {
      const container = createTestDOMContainer();
      if (!isNode) {
        doc.body.appendChild(container);
      }

      let cueCallbackCalled = false;
      let capturedCue = null;

      const disconnect = DOMCapturer.observe(container, (cue) => {
        cueCallbackCalled = true;
        capturedCue = cue;
      });

      if (typeof disconnect !== 'function') {
        throw new Error('observe() did not return a disconnect function');
      }

      // Mutate container by inserting subtitle element
      const liveSubtitleEl = doc.createElement('div');
      liveSubtitleEl.className = 'subtitles-overlay';
      liveSubtitleEl.textContent = 'Динамически добавленный субтитр через MutationObserver';
      container.appendChild(liveSubtitleEl);

      if (isNode) {
        // Trigger mock observer instances
        global.MutationObserver.activeInstances.forEach(inst => inst.trigger());
      } else {
        // Wait for real browser MutationObserver microtask
        await new Promise(r => setTimeout(r, 60));
      }

      if (!cueCallbackCalled || !capturedCue) {
        throw new Error('MutationObserver callback was not triggered on DOM mutation');
      }

      if (capturedCue.text !== 'Динамически добавленный субтитр через MutationObserver') {
        throw new Error(`Captured cue text mismatch. Got: "${capturedCue.text}"`);
      }

      if (typeof capturedCue.startMs !== 'number') {
        throw new Error(`Captured cue startMs must be a number, got: ${capturedCue.startMs}`);
      }

      // Test disconnect
      disconnect();

      // Clean up test DOM
      if (!isNode && container.parentNode) {
        container.parentNode.removeChild(container);
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

    // Test 5: DOMCapturer.parse and SubtitleTrack Model Validation
    const test5 = { name: 'DOMCapturer.parse (Model Normalization)', passed: true, errors: [] };
    try {
      const rawText = '   Тестовая строка <b>с тегами</b>   ';
      const parsedTrack = DOMCapturer.parse(rawText, {
        trackId: 'test_dom_track',
        startMs: 1200,
        endMs: 3500
      });

      const trackErrors = [];
      validateSubtitleTrack(parsedTrack, trackErrors);
      if (trackErrors.length > 0) {
        throw new Error(`SubtitleTrack validation failed: ${trackErrors.join('; ')}`);
      }

      if (parsedTrack.id !== 'test_dom_track') {
        throw new Error(`Track id mismatch. Expected 'test_dom_track', got: ${parsedTrack.id}`);
      }

      if (parsedTrack.source !== 'dom') {
        throw new Error(`Track source should be 'dom', got: ${parsedTrack.source}`);
      }

      if (parsedTrack.cues[0].text !== 'Тестовая строка с тегами') {
        throw new Error(`Cue text cleaning failed. Got: "${parsedTrack.cues[0].text}"`);
      }

      if (parsedTrack.cues[0].startMs !== 1200 || parsedTrack.cues[0].endMs !== 3500) {
        throw new Error(`Cue timestamps mismatch: start=${parsedTrack.cues[0].startMs}, end=${parsedTrack.cues[0].endMs}`);
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

    // Test 6: DOMCapturer.capture with Active DOM Elements
    const test6 = { name: 'DOMCapturer.capture (Full SubtitleTrack Capture)', passed: true, errors: [] };
    try {
      const container = createTestDOMContainer();
      const segEl = doc.createElement('div');
      segEl.className = 'ytp-caption-segment';
      segEl.textContent = 'Финальный тестовый субтитр для захвата';
      container.appendChild(segEl);

      const capturedTracks = await DOMCapturer.capture({ document: container });
      if (!Array.isArray(capturedTracks) || capturedTracks.length !== 1) {
        throw new Error(`capture() expected 1 SubtitleTrack, got: ${capturedTracks?.length}`);
      }

      const track = capturedTracks[0];
      const captureErrors = [];
      validateSubtitleTrack(track, captureErrors);
      if (captureErrors.length > 0) {
        throw new Error(`Captured SubtitleTrack invalid: ${captureErrors.join('; ')}`);
      }

      if (track.cues[0].text !== 'Финальный тестовый субтитр для захвата') {
        throw new Error(`Captured cue text mismatch. Got: "${track.cues[0].text}"`);
      }

      results.track = track;
      console.log(`[Passed] ${test6.name}`);
    } catch (e) {
      test6.passed = false;
      test6.errors.push(e.message);
      results.passed = false;
      results.errors.push(`${test6.name}: ${e.message}`);
      console.error(`[Failed] ${test6.name}: ${e.message}`);
    }
    results.tests.push(test6);

    // Final summary
    if (results.passed) {
      console.log('Passed: All DOM Capturer tests passed successfully.');
    } else {
      console.error('Failed: Some DOM Capturer tests failed. Errors:', results.errors);
    }

    global.__TEST_RESULTS__ = results;

    // Dispatch custom event for UI updates if DOM is available
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('DOM_TESTS_COMPLETED', { detail: results }));
    }

    return results;
  }

  // Export or run immediately
  global.runDOMTests = runDOMTests;
  global.createTestDOMContainer = createTestDOMContainer;
  global.validateSubtitleTrack = validateSubtitleTrack;

  if (typeof document !== 'undefined' && !isNode) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => runDOMTests());
    } else {
      setTimeout(() => runDOMTests(), 50);
    }
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      runDOMTests,
      validateSubtitleTrack,
      createTestDOMContainer
    };
    if (require.main === module) {
      runDOMTests();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
