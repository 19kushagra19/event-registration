const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { activeCount } = require('../utils/lifecycle');

const router = express.Router();
router.use(requireAuth);

function withCounts(row) {
  return { ...row, seats_taken: activeCount(row.id), seats_left: row.capacity - activeCount(row.id) };
}

// A session's own detail, including live seat counts.
router.get('/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ session: withCounts(session) });
});

router.post('/', requireRole('organizer'), (req, res) => {
  const { event_id, title, start_time, duration_minutes, location, capacity } = req.body || {};
  if (!event_id || !title || !start_time || !duration_minutes || !location || !capacity) {
    return res.status(400).json({ error: 'event_id, title, start_time, duration_minutes, location, capacity are required' });
  }
  if (capacity <= 0) return res.status(400).json({ error: 'capacity must be a positive number' });
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(event_id);
  if (!event) return res.status(400).json({ error: 'event_id does not exist' });

  const info = db.prepare(`
    INSERT INTO sessions (event_id, title, start_time, duration_minutes, location, capacity)
    VALUES (?,?,?,?,?,?)
  `).run(event_id, title, start_time, duration_minutes, location, capacity);
  res.status(201).json({ session: withCounts(db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid)) });
});

router.put('/:id', requireRole('organizer'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { title, start_time, duration_minutes, location, capacity } = req.body || {};
  if (capacity !== undefined && capacity < activeCount(session.id)) {
    return res.status(400).json({ error: `capacity cannot be set below the ${activeCount(session.id)} seats already held` });
  }
  db.prepare(`
    UPDATE sessions SET title=?, start_time=?, duration_minutes=?, location=?, capacity=? WHERE id=?
  `).run(
    title ?? session.title, start_time ?? session.start_time, duration_minutes ?? session.duration_minutes,
    location ?? session.location, capacity ?? session.capacity, session.id
  );
  res.json({ session: withCounts(db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id)) });
});

router.delete('/:id', requireRole('organizer'), (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true });
});

module.exports = router;
