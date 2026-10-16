const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync('extension/modules/capturers/platform_adapters/youtube/bridge.js', 'utf8');

function createPage({ videoId = 'video', failResponse = false, coldToken = false } = {}) {
  const track = { languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=video&lang=en&signature=signed' };
  class PlaybackProvider {
    constructor() {
      this.data = { videoId };
      this.tokenReads = 0;
    }
    getVideoData() { return this.data; }
    initialize() {
      const feature = 'html5_generate_content_po_token';
      const unrelatedInitialization = 'This initialization method must not be called while reading a token. '.repeat(20);
      if (feature && unrelatedInitialization) throw new Error('Initialization must not be called');
      // Simulate the much larger initialization method in the real player.
      // It contains the same feature flag but also changes playback state.
      // Discovery must select the short getter instead of this method.
      // The names of both methods change with each player revision.
    }
    revisionSpecificName() {
      const feature = 'html5_generate_content_po_token';
      return feature && (++this.tokenReads === 1 && coldToken ? 'provisional-token' : 'player-generated-token');
    }
  }
  const provider = new PlaybackProvider();
  const originalGetter = PlaybackProvider.prototype.getVideoData;
  let responseReads = 0;
  const player = {
    getPlayerResponse() {
      provider.getVideoData();
      if (++responseReads === 3 && failResponse) throw new Error('Player unavailable');
      return { captions: { playerCaptionsTracklistRenderer: { captionTracks: [track] } } };
    },
    setOption() { throw new Error('Native captions must not be changed'); },
    toggleSubtitles() { throw new Error('Native captions must not be changed'); },
    loadModule() { throw new Error('Native modules must not be changed'); }
  };
  const listeners = [];
  const replies = new Map();
  const requests = [];
  const page = {
    _yt_player: { renamedExport: PlaybackProvider },
    addEventListener(type, handler) { if (type === 'message') listeners.push(handler); },
    postMessage(message) {
      if (message.type === '__SC_YT_TIMEDTEXT__') replies.get(message.requestId)?.(message);
    }
  };
  const document = {
    getElementById() { return player; }, querySelector() { return null; }, addEventListener() {}
  };
  vm.runInNewContext(source, {
    window: page, document, URL, AbortController,
    console: { info() {}, warn() {} },
    setInterval() { return 1; }, clearInterval() {}, setTimeout, clearTimeout,
    async fetch(url) {
      requests.push(new URL(url));
      return { ok: true, text: async () => new URL(url).searchParams.get('pot') === 'provisional-token' ? '' : '{"events":[]}' };
    }
  });
  return {
    track, requests,
    assertGetterRestored() { assert.equal(PlaybackProvider.prototype.getVideoData, originalGetter); },
    load(baseUrl = track.baseUrl) {
      return new Promise(resolve => {
        replies.set('test-request', resolve);
        listeners.forEach(handler => handler({ source: page, data: {
          type: '__SC_REQ_YT_TIMEDTEXT__', requestId: 'test-request', baseUrl
        } }));
      });
    }
  };
}

test('loads the signed track using the player token without changing native captions', async () => {
  const page = createPage();
  const response = await page.load();
  assert.equal(response.error, undefined);
  assert.equal(page.requests.length, 1);
  const url = page.requests[0];
  assert.equal(url.searchParams.get('signature'), 'signed');
  assert.equal(url.searchParams.get('pot'), 'player-generated-token');
  assert.equal(url.searchParams.get('potc'), '1');
  assert.equal(url.searchParams.get('fmt'), 'json3');
  page.assertGetterRestored();
});

test('refreshes a provisional token when YouTube returns an empty body', async () => {
  const page = createPage({ coldToken: true });
  const response = await page.load();
  assert.equal(response.error, undefined);
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[0].searchParams.get('pot'), 'provisional-token');
  assert.equal(page.requests[1].searchParams.get('pot'), 'player-generated-token');
  page.assertGetterRestored();
});

test('rejects a request for a different video and restores the temporary getter', async () => {
  const page = createPage({ videoId: 'next-video' });
  const response = await page.load();
  assert.match(response.error, /video changed/);
  assert.equal(page.requests.length, 0);
  page.assertGetterRestored();
});

test('rejects arbitrary URLs without making network requests', async () => {
  const page = createPage();
  const response = await page.load('https://example.com/private');
  assert.match(response.error, /no longer belongs/);
  assert.equal(page.requests.length, 0);
  page.assertGetterRestored();
});

test('restores the getter when the player throws during provider discovery', async () => {
  const page = createPage({ failResponse: true });
  const response = await page.load();
  assert.match(response.error, /Player unavailable/);
  assert.equal(page.requests.length, 0);
  page.assertGetterRestored();
});
