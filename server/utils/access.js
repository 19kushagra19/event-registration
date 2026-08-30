const db = require('../db');

// Organizers can act on any session. Staff only on sessions they're assigned to.
// This is the single choke point both the registration routes and the "find registrations"
// list route call through, so the rule can't be bypassed from a second code path.
function canActOnSession(user, sessionId) {
  if (user.role === 'organizer') return true;
  const row = db.prepare('SELECT 1 FROM staff_assignments WHERE user_id = ? AND session_id = ?').get(user.id, sessionId);
  return !!row;
}

// Session ids a user is allowed to see at all, for the cross-session "find registrations" list.
// Organizers: every session. Staff: only assigned ones.
function visibleSessionIds(user) {
  if (user.role === 'organizer') return null; // null = no restriction
  const rows = db.prepare('SELECT session_id FROM staff_assignments WHERE user_id = ?').all(user.id);
  return rows.map(r => r.session_id);
}

module.exports = { canActOnSession, visibleSessionIds };
