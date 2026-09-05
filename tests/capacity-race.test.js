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

test('two simultaneous reservations for the last seat: exactly one succeeds, one gets 409', async () => {
  // roomySessionId has capacity 5; fill it to 4 active registrations first so exactly one seat remains.
  for (let i = 0; i < 4; i++) {
    const r = await organizer.post(`/api/sessions/${ctx.roomySessionId}/registrations`, {
      attendee_name: `Filler ${i}`, attendee_email: `filler${i}@test.local`,
    });
    assert.equal(r.status, 201);
  }

  // Fire two reservation requests at the same time for the one remaining seat.
  const [a, b] = await Promise.all([
    organizer.post(`/api/sessions/${ctx.roomySessionId}/registrations`, { attendee_name: 'Racer A', attendee_email: 'racerA@test.local' }),
    organizer.post(`/api/sessions/${ctx.roomySessionId}/registrations`, { attendee_name: 'Racer B', attendee_email: 'racerB@test.local' }),
  ]);

  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], `expected exactly one 201 and one 409, got ${statuses}`);

  const winner = a.status === 201 ? a : b;
  const loser = a.status === 201 ? b : a;
  assert.equal(winner.data.registration.status, 'Reserved');
  assert.match(loser.data.error, /capacity/i);
});

test('a tight session (capacity 1) never ends up with two active registrations under concurrency', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      organizer.post(`/api/sessions/${ctx.tightSessionId}/registrations`, {
        attendee_name: `Contender ${i}`, attendee_email: `contender${i}@test.local`,
      })
    )
  );
  const successes = results.filter(r => r.status === 201);
  const failures = results.filter(r => r.status === 409);
  assert.equal(successes.length, 1, 'exactly one of five concurrent requests should win the single seat');
  assert.equal(failures.length, 4);

  const list = await organizer.get(`/api/registrations?session_id=${ctx.tightSessionId}&status=Reserved`);
  assert.equal(list.data.total, 1, 'DB must reflect only one active reservation, not a race-created duplicate');
});
