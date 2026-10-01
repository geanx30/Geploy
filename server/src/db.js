const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || '../data/geploy.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const raw = new DatabaseSync(dbPath);
raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');

raw.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_path TEXT NOT NULL,
  process_type TEXT NOT NULL CHECK (process_type IN ('windows_service', 'iis_site')),
  service_name TEXT,
  site_name TEXT,
  app_pool_name TEXT,
  git_auth_type TEXT NOT NULL CHECK (git_auth_type IN ('none', 'https_token', 'ssh_key')) DEFAULT 'none',
  git_username TEXT,
  git_token_encrypted TEXT,
  git_ssh_key_path TEXT,
  post_update_commands TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  system_id INTEGER REFERENCES systems(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  success INTEGER NOT NULL,
  output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS update_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  diff_stat TEXT,
  diff_text TEXT,
  findings_json TEXT,
  post_update_commands TEXT,
  decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  result_output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  host TEXT,
  port INTEGER,
  secure INTEGER NOT NULL DEFAULT 0,
  username TEXT,
  password_encrypted TEXT,
  from_address TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_systems_owner ON systems(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_system ON audit_logs(system_id);
CREATE INDEX IF NOT EXISTS idx_update_requests_status ON update_requests(status);
`);

// Migracao leve para bancos criados antes destes campos existirem.
const systemsColumns = raw.prepare('PRAGMA table_info(systems)').all().map((c) => c.name);
if (!systemsColumns.includes('post_update_commands')) {
  raw.exec('ALTER TABLE systems ADD COLUMN post_update_commands TEXT');
}
if (!systemsColumns.includes('access_url')) {
  raw.exec('ALTER TABLE systems ADD COLUMN access_url TEXT');
}
if (!systemsColumns.includes('public_url')) {
  raw.exec('ALTER TABLE systems ADD COLUMN public_url TEXT');
}

if (!systemsColumns.includes('last_status')) {
  raw.exec('ALTER TABLE systems ADD COLUMN last_status TEXT');
}
if (!systemsColumns.includes('down_since')) {
  raw.exec('ALTER TABLE systems ADD COLUMN down_since INTEGER');
}
if (!systemsColumns.includes('down_alert_sent')) {
  raw.exec('ALTER TABLE systems ADD COLUMN down_alert_sent INTEGER NOT NULL DEFAULT 0');
}

const usersColumns = raw.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!usersColumns.includes('must_change_password')) {
  raw.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
}
if (!usersColumns.includes('email')) {
  raw.exec('ALTER TABLE users ADD COLUMN email TEXT');
}

module.exports = raw;
