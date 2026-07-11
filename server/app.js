const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb, genToken } = require('./db');
const { twoProportionZTest, proportionCi } = require('./stats');
const SDK = require('./sdk');

const ADMIN_COOKIE = 'sp_admin';
const KEY_RE = /^[a-z0-9_-]{1,64}$/;

function createApp({ dbPath, adminPassword, autologinToken = null } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());

  app.locals.db = db;

  const adminSessions = new Set();
  function requireAdmin(req, res, next) {
    if (req.cookies[ADMIN_COOKIE] && adminSessions.has(req.cookies[ADMIN_COOKIE])) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  const rateMap = new Map();
  function rateLimited(key, max = 240, windowMs = 10_000) {
    const now = Date.now();
    const arr = (rateMap.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return true;
    arr.push(now);
    rateMap.set(key, arr);
    if (rateMap.size > 10000) rateMap.clear();
    return false;
  }

  function variantsOf(expId) {
    return db.prepare('SELECT * FROM variants WHERE experiment_id = ? ORDER BY is_control DESC, id ASC').all(expId);
  }

  function serializeExp(e) {
    let targeting = {};
    try { targeting = JSON.parse(e.targeting_json); } catch { /* default */ }
    return { ...e, targeting, variants: variantsOf(e.id) };
  }

  // ================= PUBLIC: SDK + config + collect =================

  const cors = (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };

  app.get('/sp.js', cors, (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('application/javascript').send(SDK);
  });

  // Running experiments + enabled flags — everything the SDK needs, nothing more.
  app.get('/api/sdk/config', cors, (req, res) => {
    if (rateLimited('cfg:' + (req.ip || ''))) return res.status(429).json({ error: 'rate limited' });
    const experiments = db.prepare("SELECT * FROM experiments WHERE status = 'running'").all().map((e) => {
      const s = serializeExp(e);
      return {
        key: s.key, traffic_pct: s.traffic_pct, targeting: s.targeting,
        goal_type: s.goal_type, goal_value: s.goal_value, exclusion_group: s.exclusion_group || '',
        variants: s.variants.map((v) => ({ name: v.name, weight: v.weight }))
      };
    });
    const flags = db.prepare('SELECT key, enabled, rollout_pct FROM flags WHERE enabled = 1').all();
    res.json({ experiments, flags });
  });

  // sendBeacon posts text/plain — parse manually.
  app.options('/collect', cors);
  app.post('/collect', cors, express.text({ type: '*/*', limit: '8kb' }), (req, res) => {
    if (rateLimited('collect:' + (req.ip || ''))) return res.status(429).end();
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'bad payload' }); }

    const type = String(body?.type || '');
    const expKey = String(body?.exp || '');
    const vid = String(body?.vid || '').slice(0, 64);
    if (!KEY_RE.test(expKey) || !vid) return res.status(400).json({ error: 'exp and vid required' });
    const exp = db.prepare("SELECT * FROM experiments WHERE key = ? AND status = 'running'").get(expKey);
    if (!exp) return res.status(404).json({ error: 'unknown or inactive experiment' });

    if (type === 'assignment') {
      const variantName = String(body.variant || '').slice(0, 120);
      const variant = db.prepare('SELECT * FROM variants WHERE experiment_id = ? AND name = ?').get(exp.id, variantName);
      if (!variant) return res.status(400).json({ error: 'unknown variant' });
      db.prepare(`
        INSERT INTO assignments (experiment_id, variant_id, visitor_id, at) VALUES (?, ?, ?, ?)
        ON CONFLICT(experiment_id, visitor_id) DO NOTHING
      `).run(exp.id, variant.id, vid, Date.now());
      return res.status(202).json({ ok: true });
    }

    if (type === 'goal') {
      // A goal only counts for visitors actually IN the experiment.
      const assigned = db.prepare('SELECT id FROM assignments WHERE experiment_id = ? AND visitor_id = ?').get(exp.id, vid);
      if (!assigned) return res.status(202).json({ ok: true, ignored: true });
      db.prepare('INSERT INTO goal_events (experiment_id, visitor_id, at) VALUES (?, ?, ?)').run(exp.id, vid, Date.now());
      return res.status(202).json({ ok: true });
    }

    res.status(400).json({ error: 'unknown event type' });
  });

  // ================= AUTH =================

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'splitpoint' }));

  app.post('/api/login', (req, res) => {
    if (String((req.body || {}).password || '') !== adminPassword) {
      return res.status(401).json({ error: 'wrong password' });
    }
    const t = genToken();
    adminSessions.add(t);
    res.cookie(ADMIN_COOKIE, t, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    adminSessions.delete(req.cookies[ADMIN_COOKIE]);
    res.clearCookie(ADMIN_COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) =>
    res.json({ authed: Boolean(req.cookies[ADMIN_COOKIE] && adminSessions.has(req.cookies[ADMIN_COOKIE])) }));

  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) {
      const t = genToken();
      adminSessions.add(t);
      res.cookie(ADMIN_COOKIE, t, { httpOnly: true, sameSite: 'lax' });
    }
    res.redirect('/');
  });

  // ================= EXPERIMENTS =================

  app.get('/api/experiments', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM experiments ORDER BY created_at DESC').all().map(serializeExp);
    res.json(rows.map((e) => ({
      ...e,
      visitors: db.prepare('SELECT COUNT(*) n FROM assignments WHERE experiment_id = ?').get(e.id).n,
      conversions: db.prepare('SELECT COUNT(DISTINCT visitor_id) n FROM goal_events WHERE experiment_id = ?').get(e.id).n
    })));
  });

  function validateExpInput(b, res, existing = null) {
    const key = String(b.key ?? existing?.key ?? '').trim().toLowerCase();
    if (!KEY_RE.test(key)) { res.status(400).json({ error: 'key: lowercase letters/digits/dash/underscore, 1-64 chars' }); return null; }
    const name = String(b.name ?? existing?.name ?? key).trim().slice(0, 200) || key;
    let traffic = Math.round(Number(b.traffic_pct ?? existing?.traffic_pct ?? 100));
    if (!Number.isFinite(traffic)) traffic = 100;
    traffic = Math.min(Math.max(traffic, 1), 100);
    const goal_type = (b.goal_type ?? existing?.goal_type) === 'url' ? 'url' : 'event';
    const goal_value = String(b.goal_value ?? existing?.goal_value ?? '').trim().slice(0, 200);
    const targeting = {};
    const tIn = b.targeting || {};
    if (tIn.url_match) targeting.url_match = String(tIn.url_match).slice(0, 200);
    if (['mobile', 'desktop'].includes(tIn.device)) targeting.device = tIn.device;
    const exclusion_group = String(b.exclusion_group ?? existing?.exclusion_group ?? '').trim().slice(0, 64);
    return { key, name, traffic_pct: traffic, goal_type, goal_value, targeting, exclusion_group };
  }

  app.post('/api/experiments', requireAdmin, (req, res) => {
    const b = req.body || {};
    const v = validateExpInput(b, res);
    if (!v) return;
    const variants = Array.isArray(b.variants) && b.variants.length >= 2 ? b.variants
      : [{ name: 'control', weight: 50, is_control: true }, { name: 'variant-b', weight: 50 }];
    try {
      let expId;
      db.transaction(() => {
        const info = db.prepare(`
          INSERT INTO experiments (key, name, status, traffic_pct, targeting_json, goal_type, goal_value, exclusion_group, created_at)
          VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)
        `).run(v.key, v.name, v.traffic_pct, JSON.stringify(v.targeting), v.goal_type, v.goal_value, v.exclusion_group, Date.now());
        expId = info.lastInsertRowid;
        const ins = db.prepare('INSERT INTO variants (experiment_id, name, weight, is_control) VALUES (?, ?, ?, ?)');
        variants.forEach((va, i) => {
          const w = Math.max(1, Math.round(Number(va.weight) || 1));
          ins.run(expId, String(va.name || `variant-${i}`).slice(0, 120), w, va.is_control || i === 0 ? 1 : 0);
        });
      })();
      res.status(201).json(serializeExp(db.prepare('SELECT * FROM experiments WHERE id = ?').get(expId)));
    } catch (e) {
      res.status(409).json({ error: 'experiment key already exists' });
    }
  });

  app.put('/api/experiments/:id', requireAdmin, (req, res) => {
    const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
    if (!exp) return res.status(404).json({ error: 'not found' });
    const v = validateExpInput({ ...req.body, key: exp.key }, res, exp);
    if (!v) return;
    db.prepare(`
      UPDATE experiments SET name = ?, traffic_pct = ?, targeting_json = ?, goal_type = ?, goal_value = ?, exclusion_group = ?
      WHERE id = ?
    `).run(v.name, v.traffic_pct, JSON.stringify(v.targeting), v.goal_type, v.goal_value, v.exclusion_group, exp.id);
    res.json(serializeExp(db.prepare('SELECT * FROM experiments WHERE id = ?').get(exp.id)));
  });

  app.post('/api/experiments/:id/status', requireAdmin, (req, res) => {
    const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
    if (!exp) return res.status(404).json({ error: 'not found' });
    const status = String((req.body || {}).status || '');
    if (!['draft', 'running', 'paused', 'completed'].includes(status)) return res.status(400).json({ error: 'bad status' });
    db.prepare('UPDATE experiments SET status = ? WHERE id = ?').run(status, exp.id);
    res.json(serializeExp(db.prepare('SELECT * FROM experiments WHERE id = ?').get(exp.id)));
  });

  app.post('/api/experiments/:id/winner', requireAdmin, (req, res) => {
    const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
    if (!exp) return res.status(404).json({ error: 'not found' });
    const variant = db.prepare('SELECT * FROM variants WHERE id = ? AND experiment_id = ?')
      .get((req.body || {}).variant_id, exp.id);
    if (!variant) return res.status(400).json({ error: 'variant not in this experiment' });
    db.prepare("UPDATE experiments SET winner_variant_id = ?, status = 'completed' WHERE id = ?").run(variant.id, exp.id);
    res.json(serializeExp(db.prepare('SELECT * FROM experiments WHERE id = ?').get(exp.id)));
  });

  app.delete('/api/experiments/:id', requireAdmin, (req, res) => {
    db.transaction(() => {
      db.prepare('DELETE FROM variants WHERE experiment_id = ?').run(req.params.id);
      db.prepare('DELETE FROM assignments WHERE experiment_id = ?').run(req.params.id);
      db.prepare('DELETE FROM goal_events WHERE experiment_id = ?').run(req.params.id);
      db.prepare('DELETE FROM experiments WHERE id = ?').run(req.params.id);
    })();
    res.json({ ok: true });
  });

  // Results: visitors/conversions/CR per variant + z-test vs control.
  app.get('/api/experiments/:id/results', requireAdmin, (req, res) => {
    const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
    if (!exp) return res.status(404).json({ error: 'not found' });
    const variants = variantsOf(exp.id);
    const rows = variants.map((v) => {
      const visitors = db.prepare('SELECT COUNT(*) n FROM assignments WHERE experiment_id = ? AND variant_id = ?').get(exp.id, v.id).n;
      const conversions = db.prepare(`
        SELECT COUNT(DISTINCT g.visitor_id) n FROM goal_events g
        JOIN assignments a ON a.experiment_id = g.experiment_id AND a.visitor_id = g.visitor_id
        WHERE g.experiment_id = ? AND a.variant_id = ?
      `).get(exp.id, v.id).n;
      const cr = visitors ? Math.round((conversions / visitors) * 10000) / 100 : 0;
      return { ...v, visitors, conversions, conversion_rate: cr, ci: proportionCi(visitors, conversions) };
    });
    const control = rows.find((r) => r.is_control) || rows[0];
    for (const r of rows) {
      if (!control || r.id === control.id) { r.vs_control = null; continue; }
      const test = twoProportionZTest(control.visitors, control.conversions, r.visitors, r.conversions);
      const lift = control.conversion_rate > 0
        ? Math.round(((r.conversion_rate - control.conversion_rate) / control.conversion_rate) * 1000) / 10
        : null;
      r.vs_control = { ...test, lift_pct: lift };
    }
    res.json({ experiment: serializeExp(exp), results: rows });
  });

  // ================= FLAGS =================

  app.get('/api/flags', requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT * FROM flags ORDER BY created_at DESC').all());
  });

  app.post('/api/flags', requireAdmin, (req, res) => {
    const b = req.body || {};
    const key = String(b.key || '').trim().toLowerCase();
    if (!KEY_RE.test(key)) return res.status(400).json({ error: 'key: lowercase letters/digits/dash/underscore' });
    let rollout = Math.round(Number(b.rollout_pct ?? 100));
    if (!Number.isFinite(rollout)) rollout = 100;
    rollout = Math.min(Math.max(rollout, 0), 100);
    try {
      const info = db.prepare('INSERT INTO flags (key, name, enabled, rollout_pct, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(key, String(b.name || key).slice(0, 200), b.enabled === false ? 0 : 1, rollout, Date.now());
      res.status(201).json(db.prepare('SELECT * FROM flags WHERE id = ?').get(info.lastInsertRowid));
    } catch {
      res.status(409).json({ error: 'flag key already exists' });
    }
  });

  app.put('/api/flags/:id', requireAdmin, (req, res) => {
    const f = db.prepare('SELECT * FROM flags WHERE id = ?').get(req.params.id);
    if (!f) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    let rollout = Math.round(Number(b.rollout_pct ?? f.rollout_pct));
    if (!Number.isFinite(rollout)) rollout = f.rollout_pct;
    rollout = Math.min(Math.max(rollout, 0), 100);
    db.prepare('UPDATE flags SET name = ?, enabled = ?, rollout_pct = ? WHERE id = ?')
      .run(String(b.name ?? f.name).slice(0, 200), b.enabled === undefined ? f.enabled : (b.enabled ? 1 : 0), rollout, f.id);
    res.json(db.prepare('SELECT * FROM flags WHERE id = ?').get(f.id));
  });

  app.delete('/api/flags/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM flags WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ================= SPA =================

  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/sp.js' || req.path === '/collect') return next();
      res.set('Cache-Control', 'no-store');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
