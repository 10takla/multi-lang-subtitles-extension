const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function createPage(mobile = false) {
  const SC = {};
  let top = 80, blocked = null, checks = 0;
  const video = { contains: element => element === video };
  const header = { contains: () => false };
  const controls = { contains: () => false };
  const player = { contains: element => [video, player, controls].includes(element) };
  const document = {
    contains: () => true,
    elementsFromPoint(x, y) {
      checks++;
      return [SC.hostEl, SC.overlayHostEl, blocked || (y < 56 ? header : player)];
    }
  };
  video.ownerDocument = document;
  video.closest = () => player;
  video.getBoundingClientRect = () => ({ top, left: 100, right: 1000, bottom: top + 500, width: 900, height: 500 });
  vm.runInNewContext(fs.readFileSync('extension/modules/video_badge.js', 'utf8'), {
    window: { __SC: SC, innerWidth: 1200, innerHeight: 800 }, document
  });
  const priorities = {};
  const button = { style: { setProperty(name, value, priority) {
    this[name] = value;
    priorities[name] = priority;
  } } };
  SC.hostEl = { getBoundingClientRect: () => ({ top: 0, left: 0 }) };
  SC.overlayHostEl = {};
  SC.isMobilePanel = () => mobile;
  SC.videoIcons.set(video, button);
  return { SC, button, priorities, controls,
    move(value) { top = value; }, cover(element) { blocked = element; }, checks: () => checks
  };
}

test('badge hides behind a sticky header and returns when its video scrolls back', () => {
  const { SC, button, priorities, move } = createPage();
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'flex');
  move(42);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'none');
  assert.equal(priorities.display, 'important');
  move(-20);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'none');
  move(80);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'flex');
});

test('the badge glow cannot extend over the header either', () => {
  const { SC, button, move } = createPage();
  move(50); // Button starts at 60px; header ends at 56px, inside the glow.
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'none');
});

test('player controls do not count as an external overlay', () => {
  const { SC, button, controls, cover } = createPage();
  cover(controls);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'flex');
  cover({ contains: () => false });
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'none');
});

test('offscreen badges are hidden without additional hit testing', () => {
  const { SC, button, move, checks } = createPage();
  move(-700);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'none');
  assert.equal(checks(), 0);
});

test('mobile badges obey the same header occlusion rule', () => {
  const { SC, button, move } = createPage(true);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'flex');
  assert.equal(button.style.position, 'absolute');
  move(42);
  SC.updateVideoIconsPosition();
  assert.equal(button.style.display, 'none');
});
