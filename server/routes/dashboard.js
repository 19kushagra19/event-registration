const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { expireStale } = require('../utils/lifecycle');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  expireStale();

  const sessionsToday = db.prepare(`
    SELECT COUNT(*) AS c FROM sessions WHERE date(start_time) = date('now')
  `).get().c;

  const checkedInToday = db.prepare(`
    SELECT COUNT(*) AS c FROM registration_history
    WHERE new_status = 'CheckedIn' AND date(changed_at) = date('now')
  `).get().c;

  const expiredThisWeek = db.prepare(`
    SELECT COUNT(*) AS c FROM registration_history
    WHERE new_status = 'Expired' AND changed_at >= datetime('now', '-7 days')
  `).get().c;

  const atCapacity = db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE currently_full = 1`).get().c;

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS count FROM registrations GROUP BY status
  `).all();

  const bySession = db.prepare(`
    SELECT s.id AS session_id, s.title, COUNT(r.id) AS count
    FROM sessions s LEFT JOIN registrations r ON r.session_id = s.id
    GROUP BY s.id ORDER BY count DESC LIMIT 20
  `).all();

  const checkinsPerDay = db.prepare(`
    SELECT date(changed_at) AS day, COUNT(*) AS count
    FROM registration_history
    WHERE new_status = 'CheckedIn' AND changed_at >= datetime('now', '-14 days')
    GROUP BY day ORDER BY day
  `).all();

  res.json({
    headline: { sessionsToday, checkedInToday, expiredThisWeek, atCapacity },
    byStatus, bySession, checkinsPerDay,
  });
});

module.exports = router;
