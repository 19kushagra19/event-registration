const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();
router.use(requireAuth);

// Organizer assigns/unassigns staff to a session.
router.post('/assign', requireRole('organizer'), (req, res) => {
  const { user_id, session_id } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(user_id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!user) return res.status(400).json({ error: 'user_id must reference a staff account' });
  if (!session) return res.status(400).json({ error: 'session_id does not exist' });
  try {
    db.prepare('INSERT INTO staff_assignments (user_id, session_id) VALUES (?,?)').run(user_id, session_id);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Already assigned' });
    throw e;
  }
  res.status(201).json({ ok: true });
});

router.post('/unassign', requireRole('organizer'), (req, res) => {
  const { user_id, session_id } = req.body || {};
  db.prepare('DELETE FROM staff_assignments WHERE user_id = ? AND session_id = ?').run(user_id, session_id);
  res.json({ ok: true });
});

// Every staff member's own list of assigned sessions (goal #5). Organizers can pass ?user_id=
// to inspect anyone's assignments; staff can only ever see their own.
router.get('/my-sessions', (req, res) => {
  const userId = req.user.role === 'organizer' && req.query.user_id ? req.query.user_id : req.user.id;
  const rows = db.prepare(`
    SELECT s.*, e.name AS event_name
    FROM staff_assignments sa
    JOIN sessions s ON s.id = sa.session_id
    JOIN events e ON e.id = s.event_id
    WHERE sa.user_id = ?
    ORDER BY s.start_time
  `).all(userId);
  res.json({ sessions: rows });
});

router.get('/list', requireRole('organizer'), (req, res) => {
  const rows = db.prepare("SELECT id, name, email FROM users WHERE role = 'staff' ORDER BY name").all();
  res.json({ staff: rows });
});

module.exports = router;
