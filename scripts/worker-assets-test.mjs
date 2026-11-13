// worker-assets-test.mjs —— Worker v3.0 全功能形态分发逻辑单测（#84 QA）
// 用法：node scripts/worker-assets-test.mjs
// 验证点：
//   1) 有 ASSETS 绑定时非 /api/* 路径 → 派发给 ASSETS（游戏本体静态托管）
//   2) 有 ASSETS 绑定时未知 /api/* 路径 → JSON 404（绝不把 SPA HTML 回给 API 调用）
//   3) 无 ASSETS 绑定（仪表盘裸部署形态）→ / 返回 JSON 服务自述（零破坏）
//   4) GET /healthz → 200 ok:true（部署链探活不变）
//   5) POST /api/save/backup 无 KV → 503（API 行为不变）
//   6) GET /api/oracle/agent → 405（前端 probeSiteBackend 识别协议不变）
import { strict as assert } from 'node:assert';
import worker from '../cloudflare/worker.js';

const BASE = 'https://pwb-oracle-relay.yeyilin2010.workers.dev';
const mockAssetsResponses = new Map();
const mockAssets = {
  async fetch(req) {
    const u = new URL(req.url);
    const key = u.pathname;
    mockAssetsResponses.set(key, (mockAssetsResponses.get(key) ?? 0) + 1);
    if (key === '/' || key === '/index.html') {
      return new Response('<!DOCTYPE html><html><head><title>Pixel World Box</title></head><body><div id="__next">GAME</div></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (key === '/wasm/wbcore.wasm') {
      return new Response(new Uint8Array([0, 97, 115, 109]), { status: 200, headers: { 'content-type': 'application/wasm' } });
    }
    return new Response('asset-not-found:' + key, { status: 404 });
  },
};
const envWithAssets = { ASSETS: mockAssets };
const envBare = {}; // 仪表盘 Quick edit 粘贴 worker.js 的裸部署形态

let passed = 0;
const t = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL  ${name}\n    ${e && e.message}`);
    process.exitCode = 1;
  }
};

console.log('== Worker v3.0 全功能形态分发单测 ==');

await t('ASSETS 在：GET / 派发给 ASSETS 返回游戏 HTML', async () => {
  const res = await worker.fetch(new Request(`${BASE}/`), envWithAssets);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const body = await res.text();
  assert.match(body, /Pixel World Box/);
  assert.equal(mockAssetsResponses.get('/'), 1);
});

await t('ASSETS 在：GET /wasm/wbcore.wasm 派发给 ASSETS', async () => {
  const res = await worker.fetch(new Request(`${BASE}/wasm/wbcore.wasm`), envWithAssets);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/wasm/);
});

await t('ASSETS 在：未知 /api/* 路径 → JSON 404（不吞成 SPA HTML）', async () => {
  const res = await worker.fetch(new Request(`${BASE}/api/unknown-endpoint`), envWithAssets);
  assert.equal(res.status, 404);
  const j = await res.json();
  assert.match(j.error, /未知路径/);
  assert.equal(mockAssetsResponses.get('/api/unknown-endpoint'), undefined, 'API 路径不得派发 ASSETS');
});

await t('ASSETS 无（裸部署）：GET / 保持 JSON 服务自述（零破坏）', async () => {
  const res = await worker.fetch(new Request(`${BASE}/`), envBare);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.service, 'pwb-oracle-worker');
  assert.equal(j.version, '3.0.0');
});

await t('GET /healthz → 200 ok:true（探活协议不变）', async () => {
  const res = await worker.fetch(new Request(`${BASE}/healthz?cb=1`), envWithAssets);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.kv, false); // mock env 无 KV → 如实上报
});

await t('POST /api/save/backup 无 KV → 503（API 行为不变）', async () => {
  const res = await worker.fetch(
    new Request(`${BASE}/api/save/backup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: 'pwb-0123456789abcdef', slot: 0, payload: '{}' }),
    }),
    envWithAssets,
  );
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.match(j.error, /未启用云存档/);
});

await t('GET /api/oracle/agent → 405（probeSiteBackend 识别协议不变）', async () => {
  const res = await worker.fetch(new Request(`${BASE}/api/oracle/agent`), envWithAssets);
  assert.equal(res.status, 405);
});

console.log(process.exitCode ? `== ${'存在失败'} ==` : `== 全部通过：${passed} ==`);
