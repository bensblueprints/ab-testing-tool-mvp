const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

function genToken(len = 24) {
  return crypto.randomBytes(len).toString('hex');
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',       -- draft | running | paused | completed
      traffic_pct INTEGER NOT NULL DEFAULT 100,   -- % of visitors entered into the test
      targeting_json TEXT NOT NULL DEFAULT '{}',  -- { url_match, device }
      goal_type TEXT NOT NULL DEFAULT 'event',    -- 'event' (track() call) | 'url' (pageview match)
      goal_value TEXT NOT NULL DEFAULT '',
      exclusion_group TEXT DEFAULT '',            -- experiments sharing a group never overlap per visitor
      winner_variant_id INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 50,
      is_control INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      visitor_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      UNIQUE(experiment_id, visitor_id)
    );
    CREATE TABLE IF NOT EXISTS goal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id INTEGER NOT NULL,
      visitor_id TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      rollout_pct INTEGER NOT NULL DEFAULT 100,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assign_exp ON assignments(experiment_id, variant_id);
    CREATE INDEX IF NOT EXISTS idx_goals_exp ON goal_events(experiment_id, visitor_id);
  `);

  return db;
}

module.exports = { openDb, genToken };
