const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDb, startServer, loginAs, cleanup } = require('./helpers');

let ctx, server, organizer;

before(async () => {
  ctx = setupDb();
  server = await startServer();
  organizer = await loginAs(server.baseUrl, 'organizer@test.local');
});
after(async () => { await server.close(); cleanup(ctx.dbPath); });

async function reserve(sessionId, name, email) {
  const r = await organizer.post(`/api/sessions/${sessionId}/registrations`, { attendee_name: name, attendee_email: email });
  assert.equal(r.status, 201);
  return r.data.registration;
}

test('Reserved -> Confirmed -> CheckedIn is allowed', async () => {
  const reg = await reserve(ctx.roomySessionId, 'Alice', 'alice-lc@test.local');
  const confirmed = await organizer.post(`/api/registrations/${reg.id}/status`, { status: 'Confirmed' });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.registration.status, 'Confirmed');

  const checkedIn = await organizer.post(`/api/registrations/${reg.id}/status`, { status: 'CheckedIn' });
  assert.equal(checkedIn.status, 200);
  assert.equal(checkedIn.data.registration.status, 'CheckedIn');
});

test('Reserved -> Cancelled is allowed and frees the seat', async () => {
  const reg = await reserve(ctx.tightSessionId, 'Bob', 'bob-lc@test.local');
  const blocked = await organizer.post(`/api/sessions/${ctx.tightSessionId}/registrations`, { attendee_name: 'Blocked', attendee_email: 'blocked@test.local' });
  assert.equal(blocked.status, 409);

  const cancelled = await organizer.post(`/api/registrations/${reg.id}/status`, { status: 'Cancelled' });
  assert.equal(cancelled.status, 200);

  const nowFits = await organizer.post(`/api/sessions/${ctx.tightSessionId}/registrations`, { attendee_name: 'Fits Now', attendee_email: 'fitsnow@test.local' });
  assert.equal(nowFits.status, 201, 'cancelling must free the seat for a new reservation');
});

test('illegal transitions are rejected with a clear message, not silently accepted', async () => {
  const reg = await reserve(ctx.roomySessionId, 'Carl', 'carl-lc@test.local');
  // Reserved -> CheckedIn skips Confirmed, which is not allowed.
  const skip = await organizer.post(`/api/registrations/${reg.id}/status`, { status: 'CheckedIn' });
  assert.equal(skip.status, 400);
  assert.match(skip.data.error, /Cannot move/);

  const cancelled = await organizer.post(`/api/registrations/${reg.id}/status`, { status: 'Cancelled' });
  assert.equal(cancelled.status, 200);
  // Cancelled is a final state; nothing should move out of it.
  const reopen = await organizer.post(`/api/registrations/${reg.id}/status`, { status: 'Reserved' });
  assert.equal(reopen.status, 400);
});

test('a stale Reserved registration auto-expires and frees its seat', async () => {
  // Dedicated capacity-1 session so this test isn't affected by seats used up in earlier tests.
  const freshSessionId = ctx.db.prepare(
    `INSERT INTO sessions (event_id, title, start_time, duration_minutes, location, capacity) VALUES (?,?,?,?,?,?)`
  ).run(ctx.eventId, 'Expiry Test Session', '2026-01-01 12:00', 30, 'Room D', 1).lastInsertRowid;

  const reg = await reserve(freshSessionId, 'Dana', 'dana-lc@test.local');
  // Back-date reserved_at past the hold window directly in the DB (fast, no real waiting).
  ctx.db.prepare(`UPDATE registrations SET reserved_at = datetime('now', '-999 minutes') WHERE id = ?`).run(reg.id);

  // Any capacity-sensitive route call runs expireStale() defensively before checking capacity.
  const attempt = await organizer.post(`/api/sessions/${freshSessionId}/registrations`, { attendee_name: 'Erin', attendee_email: 'erin-lc@test.local' });
  assert.equal(attempt.status, 201, 'the expired reservation should have freed the seat');

  const expiredReg = await organizer.get(`/api/registrations/${reg.id}`);
  assert.equal(expiredReg.data.registration.status, 'Expired');
});
