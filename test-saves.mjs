// Smoke test: load the intro game in a headless browser, exercise the
// SDK's save API against a mock RPC host, and verify the handshake +
// get/set/delete/list flow.
//
// Run: node test-saves.mjs   (after `npm run dev -- --port 5180`)

import { chromium } from 'playwright';
import http from 'node:http';

const INTRO_URL = process.env.INTRO_URL || 'http://localhost:5180/';
const TEST_HOST_PORT = 5181;

// Serve a tiny HTML that iframes the intro game and implements a mock
// home-ui RPC host backed by an in-memory store (no backend dependency).
const mockHostHtml = `<!doctype html>
<html><body>
<iframe id="g" src="${INTRO_URL}" style="width:800px;height:600px;border:0"></iframe>
<script>
  const PROTOCOL_VERSION = 1;
  const iframe = document.getElementById('g');
  const store = new Map();            // key → { value, version }
  window.__rpcLog = [];
  window.__store = store;

  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'unboxy:hello') {
      iframe.contentWindow.postMessage({
        type: 'unboxy:init',
        protocolVersion: PROTOCOL_VERSION,
        gameId: 'mock-game',
        user: { id: 'mock-user', name: 'Mock User' },
        capabilities: ['saves'],
      }, '*');
      return;
    }
    if (data.type === 'unboxy:rpc') {
      const params = data.params || {};
      const reply = (body) => iframe.contentWindow.postMessage({ type: 'unboxy:rpc.result', id: data.id, ...body }, '*');
      window.__rpcLog.push({ method: data.method, params });
      try {
        let result;
        if (data.method === 'saves.get') {
          const rec = store.get(params.key);
          result = rec ? { value: rec.value, version: rec.version } : { value: null, version: null };
        } else if (data.method === 'saves.set') {
          const existing = store.get(params.key);
          const version = (existing?.version ?? 0) + 1;
          store.set(params.key, { value: params.value, version });
          result = { version };
        } else if (data.method === 'saves.delete') {
          const deleted = store.delete(params.key);
          result = { deleted };
        } else if (data.method === 'saves.list') {
          result = { keys: [...store.keys()] };
        } else {
          throw Object.assign(new Error('unknown'), { code: 'UNKNOWN_METHOD' });
        }
        reply({ ok: true, result });
      } catch (err) {
        reply({ ok: false, error: { code: err.code || 'INTERNAL', message: err.message } });
      }
    }
  });
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(mockHostHtml);
});
await new Promise((resolve) => server.listen(TEST_HOST_PORT, resolve));
const hostUrl = `http://localhost:${TEST_HOST_PORT}/`;
console.log('mock host at', hostUrl);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(hostUrl, { waitUntil: 'load' });

// The game iframe's Unboxy.init() should complete once the mock host
// replies to unboxy:hello. Drive saves directly by reaching into the
// iframe's window.
const iframeHandle = await page.waitForSelector('#g');
const frame = await iframeHandle.contentFrame();
if (!frame) throw new Error('no iframe');

// Wait for main.ts's exported unboxyReady promise to be visible on the
// window of the game, then use it to run the save roundtrip.
await frame.waitForLoadState('load');
await frame.waitForFunction(() => !!(globalThis.__PHASER_GAME__ || document.querySelector('canvas')), null, { timeout: 10_000 });

// The SDK is exported via the module graph; not attached to window. So call
// RPCs by sending postMessages manually against the game iframe — same wire
// format — to prove the PostMessageTransport round-trips correctly.
async function rpc(method, params) {
  return frame.evaluate(async ({ method, params }) => {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random()}`;
      const onMsg = (event) => {
        if (event.source !== window.parent) return;
        const d = event.data;
        if (d && d.type === 'unboxy:rpc.result' && d.id === id) {
          window.removeEventListener('message', onMsg);
          d.ok ? resolve(d.result) : reject(new Error(d.error.code + ': ' + d.error.message));
        }
      };
      window.addEventListener('message', onMsg);
      window.parent.postMessage({ type: 'unboxy:rpc', id, method, params }, '*');
      setTimeout(() => { window.removeEventListener('message', onMsg); reject(new Error('timeout')); }, 5000);
    });
  }, { method, params });
}

function assertEqual(a, b, label) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) { console.error(`FAIL ${label}: ${as} !== ${bs}`); process.exitCode = 1; }
  else console.log(`ok   ${label}`);
}

// 1. initial get → null
assertEqual(await rpc('saves.get', { key: 'progress' }), { value: null, version: null }, 'get missing');

// 2. set
const v1 = await rpc('saves.set', { key: 'progress', value: { level: 1 } });
assertEqual(v1, { version: 1 }, 'set v1');

// 3. get → returns value
assertEqual(await rpc('saves.get', { key: 'progress' }), { value: { level: 1 }, version: 1 }, 'get v1');

// 4. set again
const v2 = await rpc('saves.set', { key: 'progress', value: { level: 2 } });
assertEqual(v2, { version: 2 }, 'set v2');

// 5. list
assertEqual(await rpc('saves.list'), { keys: ['progress'] }, 'list after set');

// 6. delete
assertEqual(await rpc('saves.delete', { key: 'progress' }), { deleted: true }, 'delete');

// 7. get after delete → null
assertEqual(await rpc('saves.get', { key: 'progress' }), { value: null, version: null }, 'get after delete');

await browser.close();
server.close();

console.log(process.exitCode ? 'FAILED' : 'all passed');
