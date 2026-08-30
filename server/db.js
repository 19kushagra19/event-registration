// SQLite for local/dev + free-tier hosting simplicity (single file, zero external service).
// See docs/decisions.md for why SQLite was chosen over a hosted Postgres for this submission,
// and docs/schema.md for what would need to change at higher scale / write concurrency.
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('organizer','staff')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  -- tracks the last time this session's active-registration count transitioned
  -- up to capacity; used to decide whether a dismissed alert should reappear.
  last_full_at TEXT,
  currently_full INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, session_id)
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Reserved','Confirmed','CheckedIn','Cancelled','Expired')),
  reserved_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_session ON registrations(session_id);
CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_reg_email ON registrations(attendee_email);

-- Append-only audit trail. No UPDATE/DELETE is ever issued against this table by app code.
CREATE TABLE IF NOT EXISTS registration_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dismissed_alerts (
  session_id INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
