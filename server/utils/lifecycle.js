const db = require('../db');

const HOLD_MINUTES = parseInt(process.env.HOLD_MINUTES || '30', 10);
const ACTIVE_STATUSES = ['Reserved', 'Confirmed', 'CheckedIn'];

// Expire any Reserved registration that has sat past the holding window.
// Called defensively before every capacity-sensitive read/write, plus on a timer,
// so correctness never depends on the background timer having fired recently.
function expireStale() {
  const cutoff = `-${HOLD_MINUTES} minutes`;
  const stale = db.prepare(`
    SELECT * FROM registrations
    WHERE status = 'Reserved' AND reserved_at <= datetime('now', ?)
  `).all(cutoff);

  const updateStmt = db.prepare(`UPDATE registrations SET status = 'Expired', updated_at = datetime('now') WHERE id = ?`);
  const historyStmt = db.prepare(`INSERT INTO registration_history (registration_id, old_status, new_status, changed_by, note) VALUES (?,?,?,?,?)`);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      updateStmt.run(r.id);
      historyStmt.run(r.id, r.status, 'Expired', 'system', `Auto-expired after ${HOLD_MINUTES} min hold window`);
      recomputeFullness(r.session_id);
    }
  });
  if (stale.length) tx(stale);
  return stale.length;
}

function activeCount(sessionId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM registrations
    WHERE session_id = ? AND status IN ('Reserved','Confirmed','CheckedIn')
  `).get(sessionId);
  return row.c;
}

// Recompute whether a session is currently full, and stamp last_full_at only on the
// transition from not-full -> full. That transition timestamp is what the alerts
// endpoint compares against the most recent dismissal, so a dismissed alert only
// reappears once the session has actually dropped below capacity and refilled.
function recomputeFullness(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return;
  const count = activeCount(sessionId);
  const isFull = count >= session.capacity;

  if (isFull && !session.currently_full) {
    db.prepare(`UPDATE sessions SET currently_full = 1, last_full_at = datetime('now') WHERE id = ?`).run(sessionId);
  } else if (!isFull && session.currently_full) {
    db.prepare(`UPDATE sessions SET currently_full = 0 WHERE id = ?`).run(sessionId);
  }
}

module.exports = { expireStale, activeCount, recomputeFullness, HOLD_MINUTES, ACTIVE_STATUSES };
