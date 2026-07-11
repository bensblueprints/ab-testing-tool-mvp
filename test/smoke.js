// Splitpoint smoke test — boots the real server, creates an experiment,
// then behaves like 200 browsers: fetches the public SDK config, POSTs
// assignment + goal beacons to /collect (text/plain like sendBeacon), and
// asserts rows land in SQLite, dedupe holds, the z-test math is sane, and
// declare-winner completes the experiment. Kills ONLY the spawned child.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5553;
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function beacon(payload) {
  return fetch(`${BASE}/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload)
  });
}

async function main() {
  console.log('1. Booting Splitpoint on port', TEST_PORT, 'with temp DB');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));
  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('   Auth: unauthenticated admin API 401, login 200');
  cookie = '';
  assert.strictEqual((await api('/api/experiments')).status, 401, 'admin API must require auth');
  assert.strictEqual((await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } })).status, 200);

  console.log('2. Create + start experiment (control vs variant-b, 50/50, goal=signup)');
  const created = await api('/api/experiments', {
    method: 'POST',
    body: {
      key: 'pricing_test', name: 'Pricing page test', traffic_pct: 100,
      goal_type: 'event', goal_value: 'signup',
      variants: [{ name: 'control', weight: 50, is_control: true }, { name: 'variant-b', weight: 50 }]
    }
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.status, 'draft', 'experiments start as drafts');
  const expId = created.data.id;
  const variants = created.data.variants;
  assert.strictEqual(variants.length, 2);

  console.log('   Draft experiments are NOT in the public SDK config');
  let cfg = await (await fetch(`${BASE}/api/sdk/config`)).json();
  assert.strictEqual(cfg.experiments.length, 0, 'draft must not be public');
  await api(`/api/experiments/${expId}/status`, { method: 'POST', body: { status: 'running' } });
  const cfgRes = await fetch(`${BASE}/api/sdk/config`);
  assert.strictEqual(cfgRes.headers.get('access-control-allow-origin'), '*', 'SDK config is CORS-open');
  cfg = await cfgRes.json();
  assert.strictEqual(cfg.experiments.length, 1, 'running experiment is public');
  assert.strictEqual(cfg.experiments[0].key, 'pricing_test');
  assert.ok(!('id' in cfg.experiments[0]), 'public config leaks no internal ids');

  console.log('3. SDK script served, sane and DOM-free');
  const sdkRes = await fetch(`${BASE}/sp.js`);
  assert.strictEqual(sdkRes.status, 200);
  const js = await sdkRes.text();
  assert.ok(js.includes('getVariant'), 'SDK exposes getVariant');
  assert.ok(js.includes('isEnabled'), 'SDK exposes feature flags');
  assert.ok(js.includes('track'), 'SDK exposes track()');
  assert.ok(!js.match(/innerHTML|document\.write/), 'SDK never writes HTML to the DOM');
  assert.ok(Buffer.byteLength(js) < 8192, `SDK is small (${Buffer.byteLength(js)}B raw, <3KB gzipped)`);

  console.log('4. Simulate 200 visitors: assignments via /collect beacons');
  // 100 visitors per variant; control converts 10%, variant-b converts 22%.
  for (let i = 0; i < 200; i++) {
    const vid = `visitor-${i}`;
    const variant = i < 100 ? 'control' : 'variant-b';
    const r = await beacon({ type: 'assignment', exp: 'pricing_test', variant, vid });
    assert.strictEqual(r.status, 202, 'assignment beacon accepted');
  }
  // duplicate assignment for visitor-0 must not double-count
  await beacon({ type: 'assignment', exp: 'pricing_test', variant: 'variant-b', vid: 'visitor-0' });

  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM assignments WHERE experiment_id = ?').get(expId).n, 200,
    'exactly 200 assignments (dedupe holds, sticky wins)');
  const v0 = db.prepare(`
    SELECT v.name FROM assignments a JOIN variants v ON v.id = a.variant_id
    WHERE a.experiment_id = ? AND a.visitor_id = 'visitor-0'
  `).get(expId);
  assert.strictEqual(v0.name, 'control', 'first assignment is sticky; re-assignment ignored');

  console.log('5. Goals: 10 control + 22 variant-b conversions; strangers ignored');
  for (let i = 0; i < 10; i++) await beacon({ type: 'goal', exp: 'pricing_test', vid: `visitor-${i}` });
  for (let i = 100; i < 122; i++) await beacon({ type: 'goal', exp: 'pricing_test', vid: `visitor-${i}` });
  const stranger = await beacon({ type: 'goal', exp: 'pricing_test', vid: 'never-assigned' });
  assert.strictEqual(stranger.status, 202);
  assert.strictEqual(
    db.prepare("SELECT COUNT(*) n FROM goal_events WHERE visitor_id = 'never-assigned'").get().n, 0,
    'goals from visitors not in the experiment are ignored');
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM goal_events WHERE experiment_id = ?').get(expId).n, 32);

  console.log('6. Results: conversion rates + two-proportion z-test');
  const results = await api(`/api/experiments/${expId}/results`);
  assert.strictEqual(results.status, 200);
  const control = results.data.results.find((r) => r.is_control);
  const varB = results.data.results.find((r) => !r.is_control);
  assert.strictEqual(control.visitors, 100);
  assert.strictEqual(control.conversions, 10);
  assert.strictEqual(control.conversion_rate, 10);
  assert.strictEqual(varB.visitors, 100);
  assert.strictEqual(varB.conversions, 22);
  assert.strictEqual(varB.conversion_rate, 22);
  assert.ok(varB.vs_control, 'variant carries z-test vs control');
  assert.ok(varB.vs_control.z > 1.96, `z=${varB.vs_control.z} — 10% vs 22% at n=100 is significant`);
  assert.ok(varB.vs_control.p_value < 0.05, 'p < 0.05');
  assert.strictEqual(varB.vs_control.significant, true);
  assert.strictEqual(varB.vs_control.lift_pct, 120, '+120% relative lift');
  console.log(`   z=${varB.vs_control.z} p=${varB.vs_control.p_value} confidence=${varB.vs_control.confidence}%`);

  console.log('7. Declare winner → experiment completed → drops out of SDK config');
  const win = await api(`/api/experiments/${expId}/winner`, { method: 'POST', body: { variant_id: varB.id } });
  assert.strictEqual(win.data.status, 'completed');
  assert.strictEqual(win.data.winner_variant_id, varB.id);
  cfg = await (await fetch(`${BASE}/api/sdk/config`)).json();
  assert.strictEqual(cfg.experiments.length, 0, 'completed experiment no longer served to browsers');
  const lateBeacon = await beacon({ type: 'goal', exp: 'pricing_test', vid: 'visitor-5' });
  assert.strictEqual(lateBeacon.status, 404, 'collect rejects events for inactive experiments');

  console.log('8. Feature flags: rollout in config, disabled flags hidden');
  await api('/api/flags', { method: 'POST', body: { key: 'dark_mode', name: 'Dark mode', rollout_pct: 50 } });
  const off = await api('/api/flags', { method: 'POST', body: { key: 'hidden_flag', enabled: false } });
  assert.strictEqual(off.status, 201);
  cfg = await (await fetch(`${BASE}/api/sdk/config`)).json();
  assert.strictEqual(cfg.flags.length, 1, 'only enabled flags are public');
  assert.strictEqual(cfg.flags[0].key, 'dark_mode');
  assert.strictEqual(cfg.flags[0].rollout_pct, 50);

  db.close();
  console.log('\n✅ All Splitpoint smoke tests passed');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill();
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows lock */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
