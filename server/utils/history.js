// Turns "no route issues UPDATE/DELETE against registration_history" from a policy you have to
// trust into something you can prove. Every row's hash commits to its own content AND the
// previous row's hash (same idea as a Git commit chain / blockchain), so editing or deleting any
// row breaks every hash after it. See docs/decisions.md for the full write-up.
const crypto = require('crypto');
const db = require('../db');

// Chains are per-registration: each registration's timeline is its own hash chain, keyed by
// registration_id, so unrelated registrations don't share (or contend on) a single global chain.
function lastHash(registrationId) {
  const row = db.prepare(`
    SELECT hash FROM registration_history
    WHERE registration_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(registrationId);
  return row ? row.hash : null;
}

function computeHash({ registration_id, old_status, new_status, changed_by, note, changed_at, prev_hash }) {
  const payload = JSON.stringify([registration_id, old_status, new_status, changed_by || null, note || null, changed_at, prev_hash]);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Insert a history row chained to whatever the previous row for this registration hashed to.
// Callers must NOT construct history rows any other way, or the chain silently breaks.
function recordHistory(registrationId, oldStatus, newStatus, changedBy, note) {
  const prev_hash = lastHash(registrationId);
  const changed_at = db.prepare(`SELECT strftime('%Y-%m-%d %H:%M:%f', 'now') AS t`).get().t;
  const hash = computeHash({
    registration_id: registrationId, old_status: oldStatus, new_status: newStatus,
    changed_by: changedBy, note, changed_at, prev_hash,
  });
  db.prepare(`
    INSERT INTO registration_history (registration_id, old_status, new_status, changed_by, note, changed_at, prev_hash, hash)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(registrationId, oldStatus, newStatus, changedBy || null, note || null, changed_at, prev_hash, hash);
}

// Walk a registration's full chain and confirm every row's hash still matches its content and
// its predecessor. Returns { valid: true } or { valid: false, brokenAt: <history row id>, reason }.
function verifyChain(registrationId) {
  const rows = db.prepare(`
    SELECT * FROM registration_history WHERE registration_id = ? ORDER BY id ASC
  `).all(registrationId);

  let expectedPrev = null;
  for (const row of rows) {
    if (row.prev_hash !== expectedPrev) {
      return { valid: false, brokenAt: row.id, reason: 'prev_hash does not match the preceding row (a row was likely deleted or reordered)' };
    }
    const recomputed = computeHash({
      registration_id: row.registration_id, old_status: row.old_status, new_status: row.new_status,
      changed_by: row.changed_by, note: row.note, changed_at: row.changed_at, prev_hash: row.prev_hash,
    });
    if (recomputed !== row.hash) {
      return { valid: false, brokenAt: row.id, reason: 'stored hash does not match recomputed hash (this row was edited after being written)' };
    }
    expectedPrev = row.hash;
  }
  return { valid: true, checked: rows.length };
}

module.exports = { recordHistory, verifyChain };
