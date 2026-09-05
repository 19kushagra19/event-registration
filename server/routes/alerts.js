const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { expireStale } = require('../utils/lifecycle');

const router = express.Router();
router.use(requireAuth);

// A session shows here while currently_full=1 AND its latest full transition has not been
// dismissed. The generation counter is exact even when actions occur within the same second.
router.get('/', (req, res) => {
  expireStale();
  const rows = db.prepare(`
    SELECT s.id, s.title, s.capacity, s.last_full_at, e.name AS event_name, da.dismissed_at
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN dismissed_alerts da ON da.session_id = s.id
    WHERE s.currently_full = 1
      AND (da.session_id IS NULL OR da.dismissed_generation < s.full_generation)
    ORDER BY s.last_full_at DESC
  `).all();
  res.json({ alerts: rows, count: rows.length });
});

router.post('/:sessionId/dismiss', requireRole('organizer'), (req, res) => {
  const session = db.prepare('SELECT full_generation FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.prepare(`
    INSERT INTO dismissed_alerts (session_id, dismissed_at, dismissed_generation)
    VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now'), ?)
    ON CONFLICT(session_id) DO UPDATE SET
      dismissed_at = excluded.dismissed_at,
      dismissed_generation = excluded.dismissed_generation
  `).run(req.params.sessionId, session.full_generation);
  res.json({ ok: true });
});

module.exports = router;
