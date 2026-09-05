# Submission

## Links

- **GitHub repository:** https://github.com/19kushagra19/event-registration
- **Live application:** https://event-registration-5wbz.onrender.com

## Notes for the reviewer

Hosted on Render's free tier — the service spins down after periods of inactivity, so the first
request after a while can take 50+ seconds to wake up. This is expected, not a bug.

The start command runs `npm run seed && npm start`, so the demo database is freshly reseeded every
time the service restarts (idle spin-down, a new deploy, or Render's own maintenance). This means
demo data is always present and consistent, but any data entered live (new registrations, etc.)
will not persist across a restart — a known trade-off of using SQLite on a free tier's ephemeral
disk, documented in `docs/decisions.md` and `README.md`.

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Organizer | organizer@demo.test | password123 |
| Staff | staff1@demo.test | password123 |
| Staff | staff2@demo.test | password123 |

(Created fresh on every service start by `server/seed.js`.)

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| Frontend | Vanilla JS SPA (hash router, fetch), no build step | See docs/decisions.md #3 |
| Backend | Node.js + Express | Fast to build a small REST API in |
| Database | SQLite (better-sqlite3 v13, N-API) | See docs/decisions.md #1; bumped from v11 to v13 during setup to fix a Node 24 install issue |
| Hosting | Render (free tier), single Web Service running both API and static frontend | See docs/decisions.md #2 |

## Goal checklist

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Login/logout working live; organizer vs staff enforced server-side via `requireRole` middleware, not just hidden in the UI |
| 2 | Events | Done | Create/edit/archive/restore all exercised locally; seed data includes 2 events |
| 3 | Sessions inside events | Done | Create/edit/delete; capacity edit blocked below active reservation count |
| 4 | Registration lifecycle with rules | Done | Full Reserved→Confirmed→CheckedIn flow tested; capacity rejection confirmed on the seeded full session; illegal transitions rejected with a message |
| 5 | Assignment | Done | Staff seeded with real assignments; "My sessions" view confirmed working when logged in as staff1 |
| 6 | Finding registrations | Done | Search/filter/sort/pagination all server-side, confirmed via the "Find registrations" page |
| 7 | Bulk actions | Done | CSV import tested with a real file (created/duplicate/rejected all demonstrated); CSV export downloads a session's check-in sheet |
| 8 | Dashboard | Done | Headline numbers, by-status/by-session breakdowns, and 14-day check-in chart all populated with real seeded data |
| 9 | History you cannot rewrite | Done | Every registration's timeline visible; no route in the codebase ever issues UPDATE/DELETE against `registration_history` |
| 10 | At-capacity alerts | Done | Confirmed live: dismissing an alert clears it, cancelling+re-reserving a seat on the same session brings it back |

## How much time did you actually spend?

Roughly 25 hours, more than double the suggested 12-hour budget. A meaningful chunk of that wasn't
writing application code — it went into environment setup and deployment friction I had to learn
as I went: a Node.js version mismatch that broke `better-sqlite3`'s install, getting Git installed
and working on Windows, getting npm's newer install-script permission model out of the way, and
sorting out Render's build/start command configuration until the live deploy actually seeded data
correctly. None of that was wasted time — it's a real, if unglamorous, part of shipping anything —
but it does mean the ratio of "debugging the environment" to "building the feature" was higher
than I'd have liked.

## What would you do next, with another 12 hours?

An automated test suite would be the first thing — the registration lifecycle in
`server/utils/lifecycle.js` (capacity counting, expiry, the alert-reappearance logic) is exactly
the kind of code that's easy to silently break during a refactor, and right now the only
verification is manual reasoning and clicking through the UI. After that: swap SQLite for a hosted
Postgres so live data actually persists across restarts instead of resetting on every Render
spin-down, and pick one stretch feature — a waitlist would reuse most of the existing
capacity/expiry machinery with the least new code.

## What are you least happy with in this codebase, and why?

I'm least happy that the core application code was generated in one large pass rather than
something I built up piece by piece and debugged myself. My own hands-on time mostly went into
environment setup and deployment — fighting the Node version mismatch with `better-sqlite3`,
getting Git installed properly, sorting out Render's build/start commands — rather than writing or
stepping through the registration lifecycle logic line by line. If I'm asked in the call to explain
exactly why `server/utils/lifecycle.js` checks capacity in the order it does, I'd want to go back
through it myself first rather than answer from memory of being told. Going forward, I want to
actually read and trace through the trickier parts of this codebase — the lifecycle module and the
alert-reappearance logic especially — so I can defend it as if I'd written it myself, not just
describe what it does.
