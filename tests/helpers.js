// Shared test bootstrap: each test file gets its own throwaway SQLite file (set via DB_PATH
// before requiring server/db.js, so every module that does `require('../db')` shares the same
// connection) and its own ephemeral-port HTTP server, so test files can run in parallel without
// stepping on each other's data.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

function freshDbPath() {
  return path.join(os.tmpdir(), `event-reg-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

// Call this BEFORE requiring anything else from server/, so db.js picks up DB_PATH.
function setupDb() {
  const dbPath = freshDbPath();
  process.env.DB_PATH = dbPath;
  process.env.QR_SECRET = 'test-secret';
  process.env.JWT_SECRET = 'test-secret';
  const db = require('../server/db');
  const { hashPassword } = require('../server/auth');

  const insUser = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)');
  const organizer = insUser.run('organizer@test.local', hashPassword('password123'), 'Test Organizer', 'organizer').lastInsertRowid;
  const staff1 = insUser.run('staff1@test.local', hashPassword('password123'), 'Test Staff One', 'staff').lastInsertRowid;
  const staff2 = insUser.run('staff2@test.local', hashPassword('password123'), 'Test Staff Two', 'staff').lastInsertRowid;

  const insEvent = db.prepare('INSERT INTO events (name, description, start_date, end_date, venue) VALUES (?,?,?,?,?)');
  const eventId = insEvent.run('Test Conf', 'desc', '2026-01-01', '2026-01-02', 'Venue').lastInsertRowid;

  const insSession = db.prepare('INSERT INTO sessions (event_id, title, start_time, duration_minutes, location, capacity) VALUES (?,?,?,?,?,?)');
  // capacity 1 makes the race test and capacity tests trivial to reason about
  const tightSessionId = insSession.run(eventId, 'Tight Session', '2026-01-01 09:00', 30, 'Room A', 1).lastInsertRowid;
  const roomySessionId = insSession.run(eventId, 'Roomy Session', '2026-01-01 10:00', 30, 'Room B', 5).lastInsertRowid;
  const unassignedSessionId = insSession.run(eventId, 'Unassigned Session', '2026-01-01 11:00', 30, 'Room C', 5).lastInsertRowid;

  db.prepare('INSERT INTO staff_assignments (user_id, session_id) VALUES (?,?)').run(staff1, tightSessionId);
  db.prepare('INSERT INTO staff_assignments (user_id, session_id) VALUES (?,?)').run(staff1, roomySessionId);

  return { db, dbPath, organizer, staff1, staff2, eventId, tightSessionId, roomySessionId, unassignedSessionId };
}

// Starts the real Express app (server/app.js) on an ephemeral port. Returns { baseUrl, close }.
function startServer() {
  const app = require('../server/app');
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

// A tiny fetch-based client that keeps the auth cookie between calls, like a browser tab.
function makeClient(baseUrl) {
  let cookie = null;
  async function request(method, path, body) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data };
  }
  return {
    get: (p) => request('GET', p),
    post: (p, body) => request('POST', p, body),
  };
}

async function loginAs(baseUrl, email, password = 'password123') {
  const client = makeClient(baseUrl);
  const res = await client.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.data)}`);
  return client;
}

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

module.exports = { setupDb, startServer, makeClient, loginAs, cleanup };
