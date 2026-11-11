import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { createRepairServer } from '../build/server/index.js';

const publicOrigin = 'https://hepai-deployment-test.example';
async function connect(url, origin) {
  const socket = io(url, { transports: ['websocket'], autoConnect: false,
    extraHeaders: { Origin: origin }, reconnection: false, forceNew: true, timeout: 1500 });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', error => { socket.close(); reject(error); });
    socket.connect();
  });
  return socket;
}
function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(1500).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
  });
}

test('compiled production entry serves the SPA and allows only its configured browser origins', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'hepai-deploy-origin-'));
  const server = createRepairServer({ dataDir, production: true, shareBaseUrl: publicOrigin });
  const peers = [];
  try {
    const port = await server.start(0), url = `http://127.0.0.1:${port}`;
    assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true, service: 'hepai-repair' });
    const config = await (await fetch(`${url}/api/config`)).json();
    assert.equal(config.shareBaseUrl, publicOrigin);
    assert.deepEqual(config.lanAddresses, [], 'public config does not advertise container-private addresses');
    for (const pathname of ['/', '/museum', '/work/test-readonly-route']) {
      const response = await fetch(url + pathname);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<div id="root"><\/div>/);
    }
    assert.equal((await fetch(`${url}/api/not-a-route`)).status, 404);
    peers.push(await connect(url, publicOrigin));
    await assert.rejects(connect(url, 'https://unrelated.example'));
    await assert.rejects(connect(url, 'http://hepai-deployment-test.example'));
    const spoofed = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: 'https://unrelated.example', 'X-Forwarded-Host': 'unrelated.example', 'X-Forwarded-Proto': 'https' }
    });
    assert.equal(spoofed.status, 403, 'forwarded visitor headers cannot widen the trusted origin');
  } finally {
    peers.forEach(socket => socket.close());
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a mounted data directory retains a real room across compiled-server restarts', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'hepai-deploy-data-'));
  let server = createRepairServer({ dataDir, production: true, shareBaseUrl: publicOrigin });
  let a, b;
  try {
    let port = await server.start(0), url = `http://127.0.0.1:${port}`;
    a = await connect(url, publicOrigin);
    b = await connect(url, publicOrigin);
    const created = await emit(a, 'create', { mode: 'real' });
    assert.equal(created.ok, true);
    const joined = await emit(b, 'join', { code: created.snapshot.code });
    assert.equal(joined.ok, true);
    assert.equal(joined.snapshot.members.length, 2);
    a.close(); b.close();
    await server.stop();
    server = createRepairServer({ dataDir, production: true, shareBaseUrl: publicOrigin });
    port = await server.start(0); url = `http://127.0.0.1:${port}`;
    a = await connect(url, publicOrigin);
    const restored = await emit(a, 'resume', { code: created.snapshot.code, token: created.token });
    assert.equal(restored.ok, true, restored.error);
    assert.equal(restored.snapshot.code, created.snapshot.code);
    assert.equal(restored.snapshot.members.length, 2);
  } finally {
    a?.close(); b?.close();
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('invalid external URLs and wildcard origins fail before listening', async () => {
  assert.throws(() => createRepairServer({ dataDir: 'unused', shareBaseUrl: 'https://example.com/wrong-path' }), /SHARE_BASE_URL/);
  assert.throws(() => createRepairServer({ dataDir: 'unused', allowedOrigins: ['*'] }), /ALLOWED_ORIGINS/);
});
