const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { expireStale, activeCount, recomputeFullness, ACTIVE_STATUSES } = require('../utils/lifecycle');
const { canActOnSession, visibleSessionIds } = require('../utils/access');
const { recordHistory, verifyChain } = require('../utils/history');

const router = express.Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Legal transitions. Anything not listed here is rejected with a clear message (goal #4).
// 'Expired' is reachable only through the system's own expiry sweep, never this endpoint.
const ALLOWED_TRANSITIONS = {
  Reserved: ['Confirmed', 'Cancelled'],
  Confirmed: ['CheckedIn', 'Cancelled'],
  CheckedIn: [],
  Cancelled: [],
  Expired: [],
};

// ALLOWED_TRANSITIONS + this function are exported so server/routes/checkin.js (QR check-in)
// can reuse the exact same state machine instead of a parallel copy of it.
function applyTransition(reg, target, changedBy, note) {
  const allowed = ALLOWED_TRANSITIONS[reg.status] || [];
  if (!allowed.includes(target)) {
    const err = new Error(`Cannot move a registration from '${reg.status}' to '${target}'. Allowed next states: ${allowed.length ? allowed.join(', ') : 'none (this is a final state)'}.`);
    err.status = 400;
    throw err;
  }
  db.prepare(`UPDATE registrations SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(target, reg.id);
  recordHistory(reg.id, reg.status, target, changedBy, note);
  recomputeFullness(reg.session_id);
  return db.prepare('SELECT * FROM registrations WHERE id = ?').get(reg.id);
}

// ---- Create (Reserve) ----
router.post('/sessions/:sessionId/registrations', (req, res) => {
  const sessionId = Number(req.params.sessionId);
  if (!canActOnSession(req.user, sessionId)) return res.status(403).json({ error: 'Not assigned to this session' });

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { attendee_name, attendee_email } = req.body || {};
  if (!attendee_name || !attendee_email) return res.status(400).json({ error: 'attendee_name and attendee_email are required' });

  expireStale();
  const taken = activeCount(sessionId);
  if (taken >= session.capacity) {
    return res.status(409).json({ error: 'Session is at capacity; no seats left to reserve' });
  }

  const info = db.prepare(`
    INSERT INTO registrations (session_id, attendee_name, attendee_email, status) VALUES (?,?,?, 'Reserved')
  `).run(sessionId, attendee_name, attendee_email);
  recordHistory(info.lastInsertRowid, null, 'Reserved', req.user.email, 'Created');
  recomputeFullness(sessionId);

  res.status(201).json({ registration: db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid) });
});

// ---- Status transition (Confirm / Cancel / Check in) ----
router.post('/registrations/:id/status', (req, res) => {
  expireStale();
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });
  if (!canActOnSession(req.user, reg.session_id)) return res.status(403).json({ error: 'Not assigned to this session' });

  const { status: target, note } = req.body || {};
  try {
    const registration = applyTransition(reg, target, req.user.email, note);
    res.json({ registration });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---- Verify a registration's audit trail hasn't been tampered with ----
router.get('/registrations/:id/verify', (req, res) => {
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });
  if (!canActOnSession(req.user, reg.session_id)) return res.status(403).json({ error: 'Not assigned to this session' });
  res.json(verifyChain(reg.id));
});

// ---- Add a free-text note without changing status ----
router.post('/registrations/:id/notes', (req, res) => {
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });
  if (!canActOnSession(req.user, reg.session_id)) return res.status(403).json({ error: 'Not assigned to this session' });
  const { note } = req.body || {};
  if (!note) return res.status(400).json({ error: 'note is required' });
  recordHistory(reg.id, reg.status, reg.status, req.user.email, note);
  res.status(201).json({ ok: true });
});

// ---- Single registration + its timeline ----
router.get('/registrations/:id', (req, res) => {
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });
  if (!canActOnSession(req.user, reg.session_id)) return res.status(403).json({ error: 'Not assigned to this session' });
  const history = db.prepare('SELECT * FROM registration_history WHERE registration_id = ? ORDER BY changed_at ASC, id ASC').all(reg.id);
  res.json({ registration: reg, history });
});

// ---- Cross-session search/filter/sort/pagination (goal #6), all server-side ----
router.get('/registrations', (req, res) => {
  expireStale();
  const allowedIds = visibleSessionIds(req.user); // null = organizer, sees everything

  const { q, event_id, session_id, status, sort = 'reserved_at', dir = 'desc', page = '1', pageSize = '20' } = req.query;
  const where = [];
  const params = [];

  if (allowedIds !== null) {
    if (allowedIds.length === 0) {
      return res.json({ registrations: [], total: 0, page: 1, pageSize: Number(pageSize) });
    }
    where.push(`r.session_id IN (${allowedIds.map(() => '?').join(',')})`);
    params.push(...allowedIds);
  }
  if (q) {
    where.push('(r.attendee_name LIKE ? OR r.attendee_email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (event_id) { where.push('s.event_id = ?'); params.push(event_id); }
  if (session_id) { where.push('r.session_id = ?'); params.push(session_id); }
  if (status) { where.push('r.status = ?'); params.push(status); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = { reserved_at: 'r.reserved_at', status: 'r.status', session: 's.title' }[sort] || 'r.reserved_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM registrations r JOIN sessions s ON s.id = r.session_id ${whereSql}
  `).get(...params).c;

  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const rows = db.prepare(`
    SELECT r.*, s.title AS session_title, s.event_id, e.name AS event_name
    FROM registrations r
    JOIN sessions s ON s.id = r.session_id
    JOIN events e ON e.id = s.event_id
    ${whereSql}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ registrations: rows, total, page: Number(page) || 1, pageSize: limit });
});

// ---- Bulk CSV import into a session (goal #7) ----
router.post('/sessions/:sessionId/import', requireRole('organizer'), upload.single('file'), (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!req.file) return res.status(400).json({ error: 'CSV file is required (field name "file")' });

  let records;
  try {
    records = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: `Could not parse CSV: ${e.message}` });
  }

  expireStale();
  const report = [];
  const insertStmt = db.prepare(`INSERT INTO registrations (session_id, attendee_name, attendee_email, status) VALUES (?,?,?, 'Reserved')`);

  records.forEach((row, idx) => {
    const rowNum = idx + 2; // account for header row
    const name = (row.name || row.attendee_name || '').trim();
    const email = (row.email || row.attendee_email || '').trim();

    if (!name || !email) {
      report.push({ row: rowNum, result: 'rejected', reason: 'missing name or email' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      report.push({ row: rowNum, result: 'rejected', reason: 'invalid email format' });
      return;
    }
    const dup = db.prepare(`
      SELECT 1 FROM registrations WHERE session_id = ? AND attendee_email = ? AND status IN ('Reserved','Confirmed','CheckedIn')
    `).get(sessionId, email);
    if (dup) {
      report.push({ row: rowNum, result: 'duplicate', reason: 'already registered for this session' });
      return;
    }
    if (activeCount(sessionId) >= session.capacity) {
      report.push({ row: rowNum, result: 'rejected', reason: 'session is at capacity' });
      return;
    }
    const info = insertStmt.run(sessionId, name, email);
    recordHistory(info.lastInsertRowid, null, 'Reserved', req.user.email, 'Created via CSV bulk import');
    report.push({ row: rowNum, result: 'created', reason: null, registration_id: info.lastInsertRowid });
  });

  recomputeFullness(sessionId);
  const summary = {
    created: report.filter(r => r.result === 'created').length,
    duplicate: report.filter(r => r.result === 'duplicate').length,
    rejected: report.filter(r => r.result === 'rejected').length,
  };
  res.json({ summary, report });
});

// ---- Export a session's check-in sheet as CSV (goal #7) ----
router.get('/sessions/:sessionId/export', (req, res) => {
  const sessionId = Number(req.params.sessionId);
  if (!canActOnSession(req.user, sessionId)) return res.status(403).json({ error: 'Not assigned to this session' });
  const rows = db.prepare(`
    SELECT attendee_name, attendee_email, status, reserved_at, updated_at
    FROM registrations WHERE session_id = ? ORDER BY attendee_name
  `).all(sessionId);
  const csv = stringify(rows, { header: true, columns: ['attendee_name', 'attendee_email', 'status', 'reserved_at', 'updated_at'] });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="session-${sessionId}-checkin.csv"`);
  res.send(csv);
});

module.exports = router;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
module.exports.applyTransition = applyTransition;
