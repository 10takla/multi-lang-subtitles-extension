const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function createPanel(mobile = false) {
  const SC = {};
  const listeners = new Map();
  const window = { __SC: SC, innerWidth: 1200, innerHeight: 800,
    matchMedia: () => ({ matches: mobile }),
    addEventListener(type, handler, options) { listeners.set(type, { handler, options }); }
  };
  const document = { contains: () => true, addEventListener() {} };
  const context = vm.createContext({ window, document });
  vm.runInContext(fs.readFileSync('extension/modules/video_badge.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('extension/modules/widget.js', 'utf8'), context);
  const classes = new Set();
  const focusedSelect = { tagName: 'SELECT' };
  const widget = { style: {}, offsetWidth: 560, offsetHeight: 200,
    contains: element => element === focusedSelect,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }
  };
  let rect = {};
  const video = { getBoundingClientRect: () => rect };
  const moveVideo = (top, left = 100) => {
    rect = { top, left, width: 1000, height: 600, bottom: top + 600, right: left + 1000 };
  };
  moveVideo(100);
  SC.state = { widgetVisible: true, widgetVideoRelX: null, widgetVideoRelY: null };
  SC.widgetEl = widget;
  SC.shadowRoot = { activeElement: null };
  SC.getLocalVideo = () => video;
  return { SC, widget, moveVideo, focusedSelect, listeners, context, document, video };
}

test('panel hides behind the sticky header and returns without closing', () => {
  const { SC, widget, moveVideo, document, video, focusedSelect } = createPanel();
  const header = { contains: () => false };
  const player = { contains: element => element === player || element === video };
  video.closest = () => player;
  document.elementsFromPoint = (x, y) => [SC.hostEl, y < 56 ? header : player];
  SC.updateWidgetPosition();
  assert.equal(widget.classList.contains('sc-hidden'), false);
  SC.shadowRoot.activeElement = focusedSelect;
  moveVideo(45);
  SC.updateWidgetPosition();
  assert.equal(widget.classList.contains('sc-hidden'), true);
  assert.equal(SC.state.widgetVisible, true);
  moveVideo(100);
  SC.updateWidgetPosition();
  assert.equal(widget.classList.contains('sc-hidden'), false);
  assert.equal(widget.style.top, '112px');
});

test('default panel follows the video above the viewport without shrinking', () => {
  const { SC, widget, moveVideo } = createPanel();
  SC.updateWidgetPosition();
  assert.equal(widget.style.top, '112px');
  const maxHeight = widget.style.maxHeight;
  moveVideo(-100);
  SC.updateWidgetPosition();
  assert.equal(widget.style.top, '-88px');
  assert.equal(widget.style.maxHeight, maxHeight);
});

test('a focused selector stays steady until its video moves', () => {
  const { SC, widget, moveVideo, focusedSelect } = createPanel();
  SC.updateWidgetPosition();
  SC.shadowRoot.activeElement = focusedSelect;
  widget.style.left = '123px';
  SC.updateWidgetPosition();
  assert.equal(widget.style.left, '123px');
  moveVideo(-100);
  SC.updateWidgetPosition();
  assert.equal(widget.style.top, '-88px');
  assert.equal(widget.style.left, '528px');
});

test('a dragged panel retains its offset from the video while scrolling', () => {
  const { SC, widget, moveVideo, focusedSelect } = createPanel();
  SC.state.widgetVideoRelX = 40;
  SC.state.widgetVideoRelY = 150;
  SC.updateWidgetPosition();
  assert.equal(widget.style.top, '250px');
  SC.shadowRoot.activeElement = focusedSelect;
  moveVideo(-100, 50);
  SC.updateWidgetPosition();
  assert.equal(widget.style.top, '50px');
  assert.equal(widget.style.left, '90px');
});

test('panel hides with an offscreen video and reappears when it returns', () => {
  const { SC, widget, moveVideo, focusedSelect } = createPanel();
  SC.updateWidgetPosition();
  SC.shadowRoot.activeElement = focusedSelect;
  moveVideo(-700);
  SC.updateWidgetPosition();
  assert.equal(widget.classList.contains('sc-hidden'), true);
  moveVideo(100);
  SC.updateWidgetPosition();
  assert.equal(widget.classList.contains('sc-hidden'), false);
});

test('mobile panel retains its bottom placement', () => {
  const { SC, widget, moveVideo } = createPanel(true);
  SC.updateWidgetPosition();
  moveVideo(-100);
  SC.updateWidgetPosition();
  assert.equal(widget.style.top, 'auto');
  assert.equal(widget.style.bottom, '0');
});

test('scroll listener captures scrolling inside nested containers', () => {
  const { SC, listeners, context } = createPanel();
  let updates = 0;
  SC.scheduleUpdatePositions = () => { updates++; };
  vm.runInContext(fs.readFileSync('extension/modules/lifecycle.js', 'utf8'), context);
  SC.initLifecycle();
  const scroll = listeners.get('scroll');
  assert.equal(scroll.options.capture, true);
  scroll.handler();
  assert.equal(updates, 1);
});
