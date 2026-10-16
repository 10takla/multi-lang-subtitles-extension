const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync('extension/modules/translator.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = text => ({ ok: true, json: async () => [[[text]]] });

function createPage({ enabled = false, runtime = false, fetchImpl, localFactory } = {}) {
  const calls = { fetch: [], messages: [], tracks: 0, upcoming: 0, ui: 0 };
  const item = { id: 'translation', mode: 'trans', targetLang: 'ru', sourceTrack: 'yt:en', engine: 'google', bufferChars: 1000 };
  const line = { id: 'current', text: 'Current line', trackTexts: {}, translations: {} };
  const SC = {
    state: { subtitlesEnabled: enabled, languages: [item], lines: [line], currentActiveLine: line, translationCache: new Map() },
    cleanText: text => text.trim(), normalizeLangCode: lang => lang,
    getActiveVideo: () => ({ currentTime: 5, paused: true }),
    getAvailableVideoTracks() { calls.tracks++; return [{ value: 'yt:en' }]; },
    getUpcomingCues() { calls.upcoming++; return []; },
    resolveTrackLang: () => 'en',
    updateTranslationInDOM() { calls.ui++; }, updateVideoOverlayContent() {}
  };
  const page = { __SC: SC };
  if (localFactory) page.translation = { createTranslator: localFactory };
  const timers = [];
  const chrome = { runtime: {
    id: runtime ? 'test-extension' : undefined,
    sendMessage(message, callback) { calls.messages.push({ message, callback }); }
  } };
  vm.runInNewContext(source, {
    window: page, chrome, console,
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
    fetch(url) {
      calls.fetch.push(url);
      return fetchImpl ? fetchImpl(url) : Promise.resolve(response('Translated line'));
    }
  });
  return { SC, calls, item, line, timers };
}

test('disabled subtitles do not prepare or request translations through any entry point', async () => {
  const { SC, item, line, calls } = createPage({ runtime: true });
  SC.prefetchUpcomingTranslations();
  SC.retranslateItem(item);
  SC.translateLine(line);
  SC.syncTranslationActivity();
  assert.equal(await SC.fetchTranslation('Hello', 'ru', 'en'), null);
  assert.equal(await SC.fetchTranslation('Hello', 'ru', 'en', 'chrome'), null);
  assert.equal(calls.tracks, 0);
  assert.equal(calls.upcoming, 0);
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.messages.length, 0);
  assert.equal(calls.ui, 0);
});

test('enabling subtitles resumes the paused current line and reuses the cache', () => {
  const { SC, line, calls } = createPage();
  SC.state.translationCache.set('google_en_ru_Current line', 'Cached translation');
  line.translations.translation = 'Outdated translation';
  SC.state.subtitlesEnabled = true;
  SC.syncTranslationActivity();
  assert.equal(line.translations.translation, 'Cached translation');
  assert.equal(calls.upcoming, 1);
  assert.equal(calls.fetch.length, 0);
  assert.equal(SC.state.translationCache.size, 1);
});

test('enabled subtitles translate and prefetch without duplicate requests', async () => {
  const { SC, line, calls } = createPage({ enabled: true });
  SC.getUpcomingCues = () => [
    { start: 5, end: 10, text: line.text }, { start: 10, end: 15, text: 'Upcoming line' }
  ];
  SC.translateLine(line);
  SC.prefetchUpcomingTranslations();
  await flush();
  assert.equal(calls.fetch.length, 2);
  assert.equal(line.translations.translation, 'Translated line');
  assert.equal(SC.state.translationCache.size, 2);
});

test('disabling subtitles prevents a background failure from starting a direct fallback', async () => {
  const { SC, calls } = createPage({ enabled: true, runtime: true });
  const pending = SC.fetchTranslation('Hello', 'ru', 'en');
  assert.equal(calls.messages.length, 1);
  SC.state.subtitlesEnabled = false;
  SC.syncTranslationActivity();
  calls.messages[0].callback({ success: false });
  assert.equal(await pending, null);
  assert.equal(calls.fetch.length, 0);
});

test('disabling subtitles prevents the background timeout from starting a fallback', async () => {
  const { SC, timers, calls } = createPage({ enabled: true, runtime: true });
  const pending = SC.fetchTranslation('Hello', 'ru', 'en');
  SC.state.subtitlesEnabled = false;
  SC.syncTranslationActivity();
  timers[0]();
  assert.equal(await pending, null);
  assert.equal(calls.fetch.length, 0);
});

test('a local translator that becomes ready after disabling does not translate', async () => {
  let ready, translated = 0;
  const { SC } = createPage({ enabled: true,
    localFactory: () => new Promise(resolve => { ready = resolve; })
  });
  const pending = SC.fetchTranslation('Hello', 'ru', 'en', 'chrome');
  SC.state.subtitlesEnabled = false;
  SC.syncTranslationActivity();
  ready({ translate() { translated++; return 'Translation'; } });
  assert.equal(await pending, null);
  assert.equal(translated, 0);
});

test('late responses from before disabling cannot overwrite the resumed current line', async () => {
  const pending = new Map();
  const { SC, item, line, calls } = createPage({ enabled: true,
    fetchImpl: url => new Promise(resolve => pending.set(new URL(url).searchParams.get('tl'), resolve))
  });
  SC.translateLine(line);
  SC.state.subtitlesEnabled = false;
  SC.syncTranslationActivity();
  item.targetLang = 'de';
  SC.state.subtitlesEnabled = true;
  SC.syncTranslationActivity();
  pending.get('ru')(response('Old Russian translation'));
  await flush();
  assert.equal(line.translations.translation, undefined);
  assert.equal(calls.ui, 0);
  pending.get('de')(response('New German translation'));
  await flush();
  assert.equal(line.translations.translation, 'New German translation');
  assert.equal(calls.ui, 1);
});
