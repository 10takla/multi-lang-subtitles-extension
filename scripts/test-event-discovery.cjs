const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

class Surface {
  listeners = new Map();
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  emit(type, target = this) {
    for (const handler of this.listeners.get(type) || []) handler({ target });
  }
}

function element(tagName) {
  return {
    tagName, nodeType: 1, className: '', id: '', firstElementChild: null,
    matches(selector) { return selector.split(', ').includes(tagName.toLowerCase()); },
    querySelector() { return null; }
  };
}

function createPage() {
  const page = new Surface();
  const document = new Surface();
  const observers = [];
  const videos = [];
  const calls = { scan: 0, hook: 0, render: 0, broadcast: 0, position: 0 };
  document.body = element('BODY');
  document.querySelectorAll = selector => selector === 'video' ? videos : [];
  document.querySelector = () => null;
  const SC = page.__SC = {
    scanPageForSubtitleTracks() { calls.scan++; },
    renderLanguageList() { calls.render++; },
    broadcastFrameUpdate() { calls.broadcast++; },
    scheduleUpdatePositions() { calls.position++; }
  };
  const context = vm.createContext({
    window: page, document, Node: { ELEMENT_NODE: 1 }, console, queueMicrotask,
    setInterval() { throw new Error('Discovery must not install a polling timer'); },
    setTimeout,
    MutationObserver: class {
      constructor(callback) { observers.push(callback); }
      observe() {}
    }
  });
  function load(path) {
    vm.runInContext(fs.readFileSync(`extension/${path}`, 'utf8'), context);
  }
  load('modules/capturers.js');
  const hookVideo = SC.hookVideo;
  SC.hookVideo = () => { calls.hook++; };
  SC.checkVideoHasSubtitles = () => false;
  load('modules/lifecycle.js');
  SC.initLifecycle();
  SC.setupDOMSubtitleObserver();
  return { page, document, SC, calls, videos, observers, load, context, hookVideo };
}

test('starts without a polling timer and coalesces media and navigation events', async () => {
  const { page, document, SC, calls, videos } = createPage();
  videos.push(element('VIDEO'));
  SC.scanForVideos();
  assert.equal(calls.scan, 1);
  document.emit('loadedmetadata', videos[0]);
  document.emit('play', videos[0]);
  page.emit('popstate');
  page.emit('hashchange');
  assert.equal(calls.scan, 1);
  await Promise.resolve();
  assert.equal(calls.scan, 2);
  assert.equal(calls.hook, 2);
  assert.equal(calls.render, 2);
  assert.equal(calls.broadcast, 2);
});

test('discovers added/removed players, changed sources, and inline configurations', async () => {
  const { calls, observers, document } = createPage();
  const notify = observers[0];
  const video = element('VIDEO');
  const script = element('SCRIPT');
  notify([{ type: 'childList', target: document.body, addedNodes: [video], removedNodes: [] }]);
  notify([{ type: 'attributes', target: element('TRACK') }]);
  notify([{ type: 'attributes', target: element('SOURCE') }]);
  notify([{ type: 'characterData', target: { parentElement: script } }]);
  notify([{ type: 'childList', target: document.body, addedNodes: [], removedNodes: [video] }]);
  await Promise.resolve();
  assert.equal(calls.scan, 1);
  assert.equal(calls.position, 1);
  document.emit('load', element('IFRAME'));
  await Promise.resolve();
  assert.equal(calls.scan, 2);
});

test('ignores unrelated page mutations and installs discovery listeners once', async () => {
  const { SC, calls, observers, document, page } = createPage();
  SC.initLifecycle();
  SC.setupDOMSubtitleObserver();
  assert.equal(observers.length, 1);
  assert.equal(page.listeners.get('popstate').length, 1);
  for (let i = 0; i < 100; i++) {
    observers[0]([{ type: 'childList', target: document.body, addedNodes: [element('DIV')], removedNodes: [] }]);
    observers[0]([{ type: 'attributes', target: element('IMG') }]);
  }
  await Promise.resolve();
  assert.equal(calls.scan, 0);
});

test('native track events refresh choices without accumulating observers or listeners', () => {
  const { SC, calls, observers, load } = createPage();
  load('modules/capturers/browser/html5/index.js');
  const video = new Surface();
  video.textTracks = new Surface();
  video.textTracks.length = 1;
  video.textTracks[0] = { mode: 'hidden' };
  let visits = 0;
  SC.hookTrack = () => { visits++; };
  SC.hookHTML5Tracks(video);
  SC.hookHTML5Tracks(video);
  assert.equal(visits, 1);
  assert.equal(observers.length, 1); // Native tracks use TextTrackList events.
  assert.equal(video.textTracks.listeners.get('addtrack').length, 1);
  const before = calls.render;
  video.textTracks.emit('addtrack');
  video.textTracks.emit('removetrack');
  video.emit('load');
  assert.equal(calls.render, before + 3);
  assert.equal(visits, 4);
  assert.equal(calls.broadcast, 3);
});

test('one discovery pass fetches YouTube tracks once and checks each video once', () => {
  const { SC, calls, videos, document, hookVideo } = createPage();
  let lookups = 0, requests = 0, checks = 0, registrations = 0, videoQueries = 0;
  const querySelectorAll = document.querySelectorAll;
  document.querySelectorAll = selector => {
    if (selector === 'video') videoQueries++;
    return querySelectorAll(selector);
  };
  for (let i = 0; i < 3; i++) {
    const video = new Surface();
    video.ownerDocument = document;
    videos.push(video);
  }
  SC.hookVideo = hookVideo;
  SC.getActiveVideo = () => videos[0];
  SC.isYouTubePage = () => true;
  SC.fetchYouTubeCaptionTracks = () => {
    lookups++;
    return SC.ytCaptionTracks = [{ languageCode: 'en' }];
  };
  SC.loadYouTubeTimedText = () => { requests++; };
  SC.checkVideoHasSubtitles = () => { checks++; return true; };
  SC.registerVideoWithSubtitles = () => { registrations++; };
  SC.scanPageForSubtitleTracks = options => {
    calls.scan++;
    assert.equal(options.registerVideos, false);
  };
  SC.scanForVideos();
  assert.equal(videoQueries, 1);
  assert.equal(calls.scan, 1);
  assert.equal(lookups, 1);
  assert.equal(requests, 1);
  assert.equal(checks, 3);
  assert.equal(registrations, 3);
  assert.equal(calls.render, 1);
  for (let i = 0; i < 10; i++) assert.equal(SC.getAvailableVideoTracks()[0].value, 'yt:en');
  assert.equal(lookups, 1, 'UI reads must not repeat discovery');
});

test('custom configs are parsed again only when their script text changes', () => {
  const { SC, page, document, context, load } = createPage();
  const script = { textContent: 'const player = { subtitles: "[English]https://example.test/one.vtt" };' };
  let videoQueries = 0;
  document.querySelectorAll = selector => {
    if (selector === 'video') videoQueries++;
    return selector === 'script' ? [script] : [];
  };
  load('modules/capturers/platform_adapters/custom/index.js');
  const loaded = [];
  SC.loadCustomSubtitleUrl = url => loaded.push(url);
  SC.registerVideoWithSubtitles = () => {};
  page.parseCalls = 0;
  vm.runInContext(`
    const matchAll = String.prototype.matchAll;
    String.prototype.matchAll = function(...args) {
      window.parseCalls++;
      return matchAll.apply(this, args);
    };
  `, context);
  SC.scanPageForSubtitleTracks({ registerVideos: false });
  const firstCalls = page.parseCalls;
  assert.ok(firstCalls > 0);
  SC.scanPageForSubtitleTracks({ registerVideos: false });
  assert.equal(page.parseCalls, firstCalls);
  assert.equal(videoQueries, 0);
  script.textContent = 'const player = { subtitles: "[Russian]https://example.test/two.vtt" };';
  SC.scanPageForSubtitleTracks({ registerVideos: false });
  assert.ok(page.parseCalls > firstCalls);
  assert.deepEqual(loaded, ['https://example.test/one.vtt', 'https://example.test/two.vtt']);
});
