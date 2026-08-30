const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { expireStale } = require('../utils/lifecycle');

const router = express.Router();
router.use(requireAuth);

// A session shows here while currently_full=1 AND (never dismissed, or the dismissal
// predates the most recent full-transition). See utils/lifecycle.recomputeFullness.
router.get('/', (req, res) => {
  expireStale();
  const rows = db.prepare(`
    SELECT s.id, s.title, s.capacity, s.last_full_at, e.name AS event_name, da.dismissed_at
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN dismissed_alerts da ON da.session_id = s.id
    WHERE s.currently_full = 1
      AND (da.dismissed_at IS NULL OR da.dismissed_at < s.last_full_at)
    ORDER BY s.last_full_at DESC
  `).all();
  res.json({ alerts: rows, count: rows.length });
});

router.post('/:sessionId/dismiss', requireRole('organizer'), (req, res) => {
  db.prepare(`
    INSERT INTO dismissed_alerts (session_id, dismissed_at) VALUES (?, datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET dismissed_at = datetime('now')
  `).run(req.params.sessionId);
  res.json({ ok: true });
});

module.exports = router;
