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

test('an untouched history chain verifies as valid', async () => {
  const created = await organizer.post(`/api/sessions/${ctx.roomySessionId}/registrations`, { attendee_name: 'Chain Test', attendee_email: 'chain1@test.local' });
  const regId = created.data.registration.id;
  await organizer.post(`/api/registrations/${regId}/status`, { status: 'Confirmed' });
  await organizer.post(`/api/registrations/${regId}/notes`, { note: 'a note' });

  const verify = await organizer.get(`/api/registrations/${regId}/verify`);
  assert.equal(verify.status, 200);
  assert.equal(verify.data.valid, true);
  assert.equal(verify.data.checked, 3); // created, confirmed, note
});

test('editing a history row after the fact is detected', async () => {
  const created = await organizer.post(`/api/sessions/${ctx.roomySessionId}/registrations`, { attendee_name: 'Chain Test 2', attendee_email: 'chain2@test.local' });
  const regId = created.data.registration.id;
  await organizer.post(`/api/registrations/${regId}/status`, { status: 'Confirmed' });

  // Simulate tampering: directly edit a history row's note, bypassing the app entirely
  // (the app itself never issues UPDATE against this table — this is the attack the chain guards against).
  ctx.db.prepare(`UPDATE registration_history SET note = 'forged note' WHERE registration_id = ? AND new_status = 'Confirmed'`).run(regId);

  const verify = await organizer.get(`/api/registrations/${regId}/verify`);
  assert.equal(verify.data.valid, false);
  assert.match(verify.data.reason, /edited/i);
});

test('deleting a history row breaks the chain for every row after it', async () => {
  const created = await organizer.post(`/api/sessions/${ctx.roomySessionId}/registrations`, { attendee_name: 'Chain Test 3', attendee_email: 'chain3@test.local' });
  const regId = created.data.registration.id;
  await organizer.post(`/api/registrations/${regId}/status`, { status: 'Confirmed' });
  await organizer.post(`/api/registrations/${regId}/status`, { status: 'CheckedIn' });

  const rows = ctx.db.prepare(`SELECT * FROM registration_history WHERE registration_id = ? ORDER BY id ASC`).all(regId);
  assert.equal(rows.length, 3);
  // Delete the middle row (the Confirmed transition) — later rows' prev_hash now points to a hash that no longer exists.
  ctx.db.prepare(`DELETE FROM registration_history WHERE id = ?`).run(rows[1].id);

  const verify = await organizer.get(`/api/registrations/${regId}/verify`);
  assert.equal(verify.data.valid, false);
  assert.match(verify.data.reason, /prev_hash|deleted/i);
});
