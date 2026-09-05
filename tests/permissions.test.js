const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDb, startServer, loginAs, cleanup } = require('./helpers');

let ctx, server, organizer, staff1, staff2;

before(async () => {
  ctx = setupDb();
  server = await startServer();
  organizer = await loginAs(server.baseUrl, 'organizer@test.local');
  staff1 = await loginAs(server.baseUrl, 'staff1@test.local'); // assigned to tightSession + roomySession
  staff2 = await loginAs(server.baseUrl, 'staff2@test.local'); // assigned to nothing
});
after(async () => { await server.close(); cleanup(ctx.dbPath); });

test('staff assigned to a session can reserve into it', async () => {
  const r = await staff1.post(`/api/sessions/${ctx.tightSessionId}/registrations`, { attendee_name: 'X', attendee_email: 'x-perm@test.local' });
  assert.equal(r.status, 201);
});

test('staff NOT assigned to a session is forbidden from reserving into it', async () => {
  const r = await staff2.post(`/api/sessions/${ctx.unassignedSessionId}/registrations`, { attendee_name: 'Y', attendee_email: 'y-perm@test.local' });
  assert.equal(r.status, 403);
});

test('staff cannot act on a registration belonging to a session they are not assigned to', async () => {
  const created = await organizer.post(`/api/sessions/${ctx.unassignedSessionId}/registrations`, { attendee_name: 'Z', attendee_email: 'z-perm@test.local' });
  const regId = created.data.registration.id;

  const viewAttempt = await staff2.get(`/api/registrations/${regId}`);
  assert.equal(viewAttempt.status, 403);

  const statusAttempt = await staff2.post(`/api/registrations/${regId}/status`, { status: 'Confirmed' });
  assert.equal(statusAttempt.status, 403);
});

test("staff's cross-session search only returns registrations from sessions they're assigned to", async () => {
  await organizer.post(`/api/sessions/${ctx.unassignedSessionId}/registrations`, { attendee_name: 'Hidden', attendee_email: 'hidden-perm@test.local' });
  await staff1.post(`/api/sessions/${ctx.roomySessionId}/registrations`, { attendee_name: 'Visible', attendee_email: 'visible-perm@test.local' });

  const results = await staff1.get('/api/registrations?pageSize=100');
  assert.equal(results.status, 200);
  const emails = results.data.registrations.map(r => r.attendee_email);
  assert.ok(emails.includes('visible-perm@test.local'));
  assert.ok(!emails.includes('hidden-perm@test.local'), 'staff must not see registrations from unassigned sessions');
});

test('CSV import into a session is organizer-only, even for staff assigned to that session', async () => {
  // staff1 IS assigned to tightSession, so a 403 here proves it's a role check, not an
  // assignment check — the two are easy to conflate and worth testing separately.
  const staffAttempt = await staff1.post(`/api/sessions/${ctx.tightSessionId}/import`, {});
  assert.equal(staffAttempt.status, 403);
});
