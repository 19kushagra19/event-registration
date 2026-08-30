const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();
router.use(requireAuth);

// List events. Archived events hidden by default (goal #2), organizers can request them.
router.get('/', (req, res) => {
  const includeArchived = req.query.includeArchived === '1' && req.user.role === 'organizer';
  const rows = includeArchived
    ? db.prepare('SELECT * FROM events ORDER BY start_date DESC').all()
    : db.prepare('SELECT * FROM events WHERE archived = 0 ORDER BY start_date DESC').all();
  res.json({ events: rows });
});

router.get('/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const sessions = db.prepare('SELECT * FROM sessions WHERE event_id = ? ORDER BY start_time').all(event.id);
  res.json({ event, sessions });
});

router.post('/', requireRole('organizer'), (req, res) => {
  const { name, description, start_date, end_date, venue } = req.body || {};
  if (!name || !start_date || !end_date || !venue) {
    return res.status(400).json({ error: 'name, start_date, end_date and venue are required' });
  }
  const info = db.prepare(`
    INSERT INTO events (name, description, start_date, end_date, venue) VALUES (?,?,?,?,?)
  `).run(name, description || '', start_date, end_date, venue);
  res.status(201).json({ event: db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/:id', requireRole('organizer'), (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const { name, description, start_date, end_date, venue } = req.body || {};
  db.prepare(`
    UPDATE events SET name=?, description=?, start_date=?, end_date=?, venue=? WHERE id=?
  `).run(
    name ?? event.name, description ?? event.description, start_date ?? event.start_date,
    end_date ?? event.end_date, venue ?? event.venue, event.id
  );
  res.json({ event: db.prepare('SELECT * FROM events WHERE id = ?').get(event.id) });
});

router.post('/:id/archive', requireRole('organizer'), (req, res) => {
  const result = db.prepare('UPDATE events SET archived = 1 WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Event not found' });
  res.json({ ok: true });
});

router.post('/:id/restore', requireRole('organizer'), (req, res) => {
  const result = db.prepare('UPDATE events SET archived = 0 WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Event not found' });
  res.json({ ok: true });
});

module.exports = router;
