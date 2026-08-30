# Submission

## Links

- **GitHub repository:** <fill in after you push — see instructions below>
- **Live application:** <fill in after you deploy>

## Notes for the reviewer

<TODO: e.g. "Hosted on Render's free tier — the service sleeps after inactivity, so the first
request can take up to a minute to wake it." Also note here if you switched from SQLite to a
hosted Postgres for the live deploy, per the caveat in README.md.>

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Organizer | organizer@demo.test | password123 |
| Staff | staff1@demo.test | password123 |
| Staff | staff2@demo.test | password123 |

(Created by `npm run seed` — regenerate on the live deploy if its database resets.)

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| Frontend | Vanilla JS SPA (hash router, fetch), no build step | See docs/decisions.md #3 |
| Backend | Node.js + Express | Fast to build in, whole team-familiar |
| Database | SQLite (better-sqlite3) | See docs/decisions.md #1 |
| Hosting | TODO — fill in once deployed | |

## Goal checklist

Mark each honestly against what actually works when you click through the live deploy.

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Server-side role checks in `requireRole` middleware, exercised on every organizer-only route |
| 2 | Events | Done | Create/edit/archive/restore |
| 3 | Sessions inside events | Done | Create/edit/delete, capacity edit blocked below active reservations |
| 4 | Registration lifecycle with rules | Done | `ALLOWED_TRANSITIONS` map + capacity check + auto-expiry sweep |
| 5 | Assignment | Done | `staff_assignments` join table, organizer-only add/remove, "My sessions" view |
| 6 | Finding registrations | Done | Server-side search/filter/sort/pagination in `/api/registrations` |
| 7 | Bulk actions | Done | CSV import with per-row report, CSV export of check-in sheet |
| 8 | Dashboard | Done | Headline numbers, by-status/by-session breakdown, 14-day check-in chart |
| 9 | History you cannot rewrite | Done | Append-only `registration_history`, no UPDATE/DELETE issued against it anywhere |
| 10 | At-capacity alerts | Done | `currently_full`/`last_full_at` transition tracking + dismiss/reappear logic |

TODO — re-verify each of these against your actual deployed app before submitting; "Done" here
reflects what the code implements, not a live-tested confirmation.

## How much time did you actually spend?

TODO

## What would you do next, with another 12 hours?

TODO — candidates: automated tests (none exist yet — see "least happy with" below), a proper
migrations tool instead of `CREATE TABLE IF NOT EXISTS` in `db.js`, WebSocket/polling so the
dashboard and alerts update live instead of on navigation, one of the stretch ideas (a waitlist
would reuse most of the existing capacity/expiry logic).

## What are you least happy with in this codebase, and why?

TODO — my honest candidate: there is no automated test suite. The lifecycle/capacity/expiry logic
in `server/utils/lifecycle.js` is exactly the kind of code that benefits most from tests (it's
easy to silently break the "count Reserved+Confirmed+CheckedIn together" rule while refactoring),
and it currently has none — verification was manual, by reading the code and reasoning through
each transition by hand.
