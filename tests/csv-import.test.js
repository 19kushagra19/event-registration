// Encodes docs/decisions.md Decision 6's reversal: capacity filling mid-import must not stop
// the rest of the file from being evaluated. This test exists specifically to catch someone
// accidentally reintroducing the "stop early on capacity" behavior that was deliberately reverted.
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

async function importCsv(sessionId, csvText) {
  const cookieRes = await organizer.get('/api/auth/me');
  assert.equal(cookieRes.status, 200);
  const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=----testboundary',
      Cookie: (await getCookieHeader()),
    },
    body: buildMultipart(csvText),
  });
  const data = await res.json();
  return { status: res.status, data };

  function buildMultipart(text) {
    return (
      `------testboundary\r\n` +
      `Content-Disposition: form-data; name="file"; filename="import.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n` +
      `${text}\r\n` +
      `------testboundary--\r\n`
    );
  }
  async function getCookieHeader() {
    // Re-login fresh to grab a raw Set-Cookie header for the raw fetch call above,
    // since the shared helper client hides its cookie jar.
    const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'organizer@test.local', password: 'password123' }),
    });
    return loginRes.headers.get('set-cookie').split(';')[0];
  }
}

test('rows after the session fills mid-file are still evaluated and reported, not skipped', async () => {
  // roomySessionId has capacity 5, currently empty.
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(`Person ${i},person${i}-csv@test.local`);
  const csv = 'name,email\n' + rows.join('\n') + '\n';

  const result = await importCsv(ctx.roomySessionId, csv);
  assert.equal(result.status, 200);
  assert.equal(result.data.report.length, 8, 'every row must appear in the report, none silently dropped');
  assert.equal(result.data.summary.created, 5, 'only the first 5 rows fit the capacity-5 session');
  assert.equal(result.data.summary.rejected, 3, 'the remaining 3 rows must be reported as rejected, not skipped');

  const rejectedRows = result.data.report.filter(r => r.result === 'rejected');
  assert.equal(rejectedRows.length, 3);
  for (const r of rejectedRows) assert.match(r.reason, /capacity/i);

  // Critically: a row's own validity is still checked even after the session is full,
  // rather than every remaining row being lumped into one generic "capacity" bucket blindly.
  const csv2 = 'name,email\nGood One,goodone-csv@test.local\n,missing-name-csv@test.local\n';
  const alreadyFullResult = await importCsv(ctx.roomySessionId, csv2);
  assert.equal(alreadyFullResult.data.report[0].result, 'rejected');
  assert.match(alreadyFullResult.data.report[0].reason, /capacity/i);
  assert.equal(alreadyFullResult.data.report[1].result, 'rejected');
  assert.match(alreadyFullResult.data.report[1].reason, /missing/i, 'a malformed row must still report its real reason, not just "capacity"');
});

test('duplicate emails within the same session are rejected as duplicate, not created twice', async () => {
  const csv = 'name,email\nDup One,dup-csv@test.local\nDup Two,dup-csv@test.local\n';
  const result = await importCsv(ctx.unassignedSessionId, csv);
  assert.equal(result.data.summary.created, 1);
  assert.equal(result.data.summary.duplicate, 1);
});
