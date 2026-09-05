# AI assistance record

## Accuracy note

I used AI as a learning and troubleshooting aid while building this project locally. I did not retain a complete verbatim export of every chat, so I will not present reconstructed wording as an exact transcript. The entries below record the real areas where I used assistance, the guidance I received, and what I changed or verified afterwards. The retained screenshots show the dependency, Render, and JWT setup guidance described below.

## Native dependency setup: `better-sqlite3`

### What I asked for

Help resolving the `better-sqlite3` installation problem on Node 24 without installing Visual Studio build tooling.

### What I got

The guidance explained that the older `better-sqlite3` version did not provide a suitable ready-made binary for my Node version and recommended changing the dependency from v11 to v13, then reinstalling dependencies.

### What I did and verified

I updated `package.json` to `better-sqlite3` v13, reinstalled dependencies, and confirmed the local application could use SQLite. This corrected the earlier environment approach: changing the dependency was more appropriate than trying to alter my Visual Studio setup.

## Render deployment

### What I asked for

Guidance for deploying the locally working Node application to Render with consistent demo data.

### What I got

The setup guidance specified a Node service, `npm install` as the build command, and `npm run seed && npm start` as the Render start command so the ephemeral free-tier filesystem is reseeded after a restart.

### What I did and verified

I pushed the project to GitHub, configured Render with that start command, and verified the deployed application using the seeded organizer and staff credentials. I also documented the free-tier wake-up time and reset behaviour in `SUBMISSION.md`.

## JWT configuration

### What I asked for

How to configure a secure signing secret for the login token in Render.

### What I got

The guidance recommended adding a `JWT_SECRET` environment variable with a long random value, rather than using a real password or committing a secret into the repository.

### What I did and verified

I configured the variable in Render and kept secrets out of version control through `.gitignore`.

## Lifecycle and capacity review

### What I asked for

How to model the registration lifecycle: Reserved → Confirmed → Checked In; cancellation from only Reserved or Confirmed; capacity based on Reserved, Confirmed, and Checked In; and expiry of old reservations.

### What I got

An explicit server-side transition map and capacity check. An early version did not run the expiry sweep before every capacity-sensitive calculation, which could leave an expired reservation holding a seat too long.

### What I corrected

I added `expireStale()` before capacity-sensitive reads and writes, plus a background sweep. I then manually checked the seeded full session, illegal status transitions, and the cancellation flow.

## What I learned

AI was most useful for narrowing down environment and deployment errors and for explaining unfamiliar configuration steps. I still tested locally, read the code paths involved, and made the final choices about the deployed configuration and scope.

## Post-submission enhancements: hash-chained audit trail, QR check-in, test suite

### What I asked for

After the initial submission, I asked for a review of my remaining priorities (tests, docs,
stretch goals), then asked for further technical additions that would stand out to a reviewer,
ranked by impact vs effort against my actual codebase. I picked the hash-chained audit trail, QR
door-mode check-in, and a real automated test suite, and asked for all three plus doc updates to
be built against my real `server/` and `public/` source (uploaded as a zip) rather than guessed
from my docs alone.

### What I got

- A hash-chaining design for `registration_history` (`server/utils/history.js`): each row's SHA-256
  hash commits to its own content plus the previous row's hash, per registration, with a
  `GET /api/registrations/:id/verify` endpoint to walk the chain and report exactly which row
  broke and why.
- A signed, expiring HMAC token design for QR check-in (`server/utils/qrToken.js`,
  `server/routes/checkin.js`) rather than encoding a bare registration id, plus reuse of my
  existing `ALLOWED_TRANSITIONS` state machine via a shared `applyTransition` helper instead of a
  parallel check-in code path.
- 16 automated tests (`tests/`) using Node's built-in `node:test` and native `fetch` — no new test
  framework dependency — covering the concurrent double-reservation race described in my own
  README's problem statement, full lifecycle transitions and auto-expiry, staff/organizer
  permission boundaries, the CSV import Decision 6 regression, and hash-chain tamper detection.
- A refactor splitting `server/index.js` into `server/app.js` (the testable Express app) and a thin
  entrypoint, so tests don't need to bind a real network port.
- A frontend "Show QR" button and audit-verify control on the registration detail page, plus a
  `#/checkin/:token` door-mode page that a scanned QR code opens directly and auto-submits.

### What I did and verified

I ran `npm test` myself after every change and confirmed all 16 tests pass. I manually smoke-tested
the QR flow end-to-end on a local server: generated a QR code, decoded the image back to a URL,
submitted it to the scan endpoint, confirmed the registration moved to `CheckedIn`, and confirmed a
second scan of the same code returns `alreadyCheckedIn: true` instead of erroring or double-processing.
I also manually tampered with rows in `registration_history` (editing a note, deleting a row) directly
against the database and confirmed `/verify` correctly reported the tampering. After pushing to GitHub,
I re-verified both the `/verify` and `/qrcode` endpoints against my live Render deployment to confirm
the deployed code — not just my local copy — reflected these changes.
