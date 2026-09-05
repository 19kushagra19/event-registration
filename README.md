# Event Registration

A registration system for organizations running multi-day conferences and workshops.
Organizers create events and sessions with a real seat capacity, check-in staff manage the door
on the day, and a reservation nobody confirms in time frees itself automatically instead of
sitting on the books forever. Built for the Assignment 12 brief (see `docs/` for the design
write-up and `SUBMISSION.md` for links/credentials/checklist).

---

## Table of contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [How it's put together](#how-its-put-together)
- [Project layout](#project-layout)
- [Database schema](#database-schema)
- [Registration lifecycle](#registration-lifecycle)
- [Roles and permissions](#roles-and-permissions)
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Deploying it](#deploying-it)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## What it does

Ten required capabilities, all implemented:

1. **Accounts and roles** — email/password login, two roles (organizer, staff), every
   organizer-only action re-checked server-side, not just hidden in the UI.
2. **Events** — create, edit, archive, restore. Archived events are hidden from default views
   without deleting their sessions or registrations.
3. **Sessions inside events** — title, start time, duration, location, seat capacity. Create,
   edit, delete.
4. **Registration lifecycle with rules** — `Reserved → Confirmed → CheckedIn`, with capacity
   enforced (Reserved+Confirmed+CheckedIn counted together), automatic expiry of stale
   reservations, and every illegal transition rejected with an explanation.
5. **Staff assignment** — organizers assign any number of staff to any number of sessions; staff
   see one list of everything they're assigned to.
6. **Finding registrations** — one cross-session list with server-side search (name/email),
   filters (event/session/status), sorting, and pagination.
7. **Bulk actions** — CSV import into a session with a per-row report (created / duplicate /
   rejected + reason), and CSV export of a session's check-in sheet.
8. **Dashboard** — headline numbers (sessions today, checked in today, expired this week,
   sessions at capacity), breakdowns by status and by session, and a 14-day check-in chart.
9. **Immutable audit trail** — every registration has a timeline of every status change (old →
   new, who, when) plus free-text notes; nothing in it can ever be edited or deleted.
10. **At-capacity alerts** — a session that fills shows up in an alerts list with a nav badge;
    dismissing it clears it, but it reappears if the session empties and refills to capacity again.

## Tech stack

| Layer | Choice | Why (short version — full reasoning in `docs/decisions.md`) |
|---|---|---|
| Backend | Node.js + Express | Fast to build a small REST API in, no framework ceremony |
| Database | SQLite via `better-sqlite3` | Single file, synchronous, zero setup — right-sized for this project's scale |
| Auth | JWT in an `httpOnly` cookie + bcrypt | Standard, stateless, no session store needed |
| Frontend | Vanilla JS SPA (hash router, `fetch`), no build step | The exact files in the repo are exactly what runs — nothing to compile |
| Hosting shape | One Node process serves both the API and the static frontend | One deployable unit, no CORS, no split-hosting overhead |

## How it's put together

The browser loads `public/index.html` + `public/app.js` (a small hash-router SPA — `#/events`,
`#/sessions/12`, etc.). Every view function in `app.js` calls the JSON API under `/api/*` with
`fetch(..., { credentials: 'same-origin' })`; the auth cookie rides along automatically.

On the server, `server/index.js` wires everything together:

```
browser (public/app.js)
      |  fetch('/api/...')
      v
Express app (server/index.js)
      |
      +- /api/auth          -> server/routes/auth.js         (login/logout/register/me)
      +- /api/events         -> server/routes/events.js        (event CRUD)
      +- /api/sessions        -> server/routes/sessions.js       (session CRUD)
      +- /api/staff             -> server/routes/staff.js           (assign/unassign, my-sessions)
      +- /api/dashboard          -> server/routes/dashboard.js       (headline stats)
      +- /api/alerts              -> server/routes/alerts.js           (at-capacity list, dismiss)
      +- /api (registrations)      -> server/routes/registrations.js   (reserve/confirm/cancel/
                                                                          check-in, search, CSV
                                                                          import/export, timeline)
      |
      +- server/middleware/requireAuth.js   - verifies the JWT cookie, attaches req.user
      +- server/middleware/requireRole.js    - blocks organizer-only routes for staff
      +- server/utils/access.js               - canActOnSession() / visibleSessionIds():
      |                                            organizer = unrestricted, staff = assigned only
      +- server/utils/lifecycle.js              - expireStale(), activeCount(), recomputeFullness():
                                                     the capacity/expiry/alert logic in one place
      |
      v
server/db.js -> data.db (SQLite file, via better-sqlite3)
```

Every route that changes state does three things in order: (1) check permission
(`requireAuth`/`requireRole`/`canActOnSession`), (2) run `expireStale()` so no decision is made
against a stale reservation, (3) do the write and append a matching `registration_history` row in
the same call, so the audit trail can never drift from the data it describes.

## Project layout

```
event-registration/
├── package.json
├── data.db                    # created by `npm run seed` — gitignored, not committed
├── server/
│   ├── index.js                 # Express app: mounts routes, serves public/, runs the 60s expiry sweep
│   ├── db.js                     # schema (CREATE TABLE IF NOT EXISTS ...) + the SQLite connection
│   ├── auth.js                   # bcrypt hash/check, JWT issue/verify
│   ├── seed.js                     # wipes + repopulates data.db with demo users/events/sessions/regs
│   ├── middleware/
│   │   ├── requireAuth.js            # reads+verifies the JWT cookie, sets req.user
│   │   └── requireRole.js             # e.g. requireRole('organizer')
│   ├── routes/
│   │   ├── auth.js                      # POST /register, /login, /logout · GET /me
│   │   ├── events.js                     # GET/POST /events · GET/PUT /events/:id · archive/restore
│   │   ├── sessions.js                    # GET/POST /sessions · GET/PUT/DELETE /sessions/:id
│   │   ├── staff.js                        # POST assign/unassign · GET my-sessions, list
│   │   ├── registrations.js                 # the biggest file — full lifecycle, search, CSV import/export
│   │   ├── dashboard.js                      # GET / — all headline numbers + breakdowns
│   │   └── alerts.js                          # GET / · POST /:sessionId/dismiss
│   └── utils/
│       ├── lifecycle.js                        # expireStale, activeCount, recomputeFullness
│       └── access.js                             # canActOnSession, visibleSessionIds
├── public/
│   ├── index.html                # single shell page
│   ├── app.js                     # the entire frontend: router + every view + API calls
│   └── style.css                   # dark theme, no framework
└── docs/
    ├── architecture.md               # moving pieces, request path, what was cut
    ├── schema.md                       # every table, constraints, denormalisation, scale limits
    ├── decisions.md                      # 6+ real decisions incl. one reversed
    ├── plan.md                            # session breakdown template (fill in honestly)
    └── ai-prompts.md                       # prompt log template (fill in honestly)
```

## Database schema

Six tables. Full column-by-column detail with the reasoning behind each constraint lives in
`docs/schema.md` — short version:

| Table | Purpose | Key relationships |
|---|---|---|
| `users` | login accounts | `role` in (`organizer`, `staff`) |
| `events` | conferences/workshops | -> many `sessions` |
| `sessions` | one bookable slot inside an event | `event_id` FK; -> many `registrations`, `staff_assignments` |
| `staff_assignments` | who can act on which session | many-to-many join, `UNIQUE(user_id, session_id)` |
| `registrations` | one attendee's seat | `session_id` FK; `status` in (`Reserved`,`Confirmed`,`CheckedIn`,`Cancelled`,`Expired`) |
| `registration_history` | append-only audit trail | `registration_id` FK; every status change + free-text notes |
| `dismissed_alerts` | one row per dismissed at-capacity alert | `session_id` PK/FK |

Two columns worth calling out because they're not obvious from the brief:
`sessions.currently_full` and `sessions.last_full_at` are **denormalised** — both are derivable
from counting `registrations`, but storing them lets the alerts endpoint know exactly *when* a
session last transitioned into "full" (not just whether it's full right now), which is what makes
a dismissed alert correctly reappear only after a genuine empty-then-refill, not on every request.

## Registration lifecycle

```
                +-------------+
   (create) --> |  Reserved   |
                +------+------+
                       |
          +------------+-------------+
          v            v             v
   +-------------+ +---------+ +-----------+
   |  Confirmed  | |Cancelled| |  Expired  |  <- only the system's
   +------+------+ +---------+ | (system)  |     30-min hold-window
          |                     +-----------+     sweep can do this
     +----+----+
     v         v
+---------+ +-----------+
|CheckedIn| | Cancelled |
+---------+ +-----------+
```

Enforced by an explicit `ALLOWED_TRANSITIONS` map in `server/routes/registrations.js` — anything
not in that map (e.g. Reserved straight to CheckedIn, or un-cancelling something) is rejected with
a message naming the actual next legal states. `Expired` is reachable only through the automatic
sweep (`server/utils/lifecycle.js`), never through the manual status endpoint.

Capacity = count of `Reserved + Confirmed + CheckedIn` for a session. `expireStale()` always runs
immediately before that count is taken, so a request can never be blocked by a reservation that
should already have freed its seat.

## Roles and permissions

| Action | Organizer | Staff |
|---|---|---|
| Create/edit/archive events | Yes | No |
| Create/edit/delete sessions, set capacity | Yes | No |
| Assign/unassign staff to a session | Yes | No |
| Reserve/confirm/cancel/check-in a registration | Yes, any session | Yes, only sessions they're assigned to |
| Search/view registrations | Yes, all | Yes, only assigned sessions' registrations |
| Bulk CSV import | Yes | No |
| Export a session's check-in sheet | Yes | Yes, if assigned to that session |
| Dismiss an at-capacity alert | Yes | No |
| See "My sessions" list | — | Yes |

Enforced twice, deliberately: `requireRole('organizer')` middleware blocks the wrong role outright,
and `canActOnSession()` / `visibleSessionIds()` (in `server/utils/access.js`) additionally scope
*which* sessions a staff member can touch or see — so it's not just "staff vs organizer" but
"this specific staff member vs their actual assignments."

## Running it locally

```bash
npm install       # installs Express, better-sqlite3, bcryptjs, jsonwebtoken, cookie-parser,
                    # multer, csv-parse, csv-stringify
npm run seed       # creates data.db + demo users/events/sessions/registrations
npm start           # starts the server — http://localhost:3000
```

Demo accounts (created by `npm run seed`):

| Role | Email | Password |
|---|---|---|
| Organizer | `organizer@demo.test` | `password123` |
| Staff | `staff1@demo.test` | `password123` |
| Staff | `staff2@demo.test` | `password123` |

## Environment variables

All optional — sane defaults for local dev.

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `JWT_SECRET` | a dev placeholder | **Must** be set to a real random value in any real deployment |
| `HOLD_MINUTES` | `30` | Minutes a `Reserved` seat is held before auto-expiring |
| `DB_PATH` | `./data.db` | Where the SQLite file lives |

## API reference

All routes below are prefixed with `/api`. All routes except `/auth/login` and `/auth/register`
require the auth cookie (set automatically after login). Routes marked [organizer only] also
require the `organizer` role.

**Auth** (`server/routes/auth.js`)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Used by `seed.js`; no public signup in the UI |
| POST | `/auth/login` | `{email, password}` -> sets the auth cookie |
| POST | `/auth/logout` | Clears the cookie |
| GET | `/auth/me` | Returns the current user |

**Events** (`server/routes/events.js`)
| Method | Path | Notes |
|---|---|---|
| GET | `/events` | `?includeArchived=1` (organizer only) to see archived too |
| GET | `/events/:id` | Event + its sessions |
| POST | `/events` [organizer only] | Create |
| PUT | `/events/:id` [organizer only] | Edit |
| POST | `/events/:id/archive` [organizer only] | Hide from default views |
| POST | `/events/:id/restore` [organizer only] | Un-hide |

**Sessions** (`server/routes/sessions.js`)
| Method | Path | Notes |
|---|---|---|
| GET | `/sessions/:id` | Includes live `seats_taken`/`seats_left` |
| POST | `/sessions` [organizer only] | Create (validates `event_id`, `capacity > 0`) |
| PUT | `/sessions/:id` [organizer only] | Edit (blocks lowering capacity below seats already held) |
| DELETE | `/sessions/:id` [organizer only] | Delete |

**Staff** (`server/routes/staff.js`)
| Method | Path | Notes |
|---|---|---|
| POST | `/staff/assign` [organizer only] | `{user_id, session_id}` |
| POST | `/staff/unassign` [organizer only] | Same body |
| GET | `/staff/my-sessions` | Own assignments; organizer can pass `?user_id=` to check anyone's |
| GET | `/staff/list` [organizer only] | All staff accounts, for the assign UI |

**Registrations** (`server/routes/registrations.js`)
| Method | Path | Notes |
|---|---|---|
| POST | `/sessions/:sessionId/registrations` | Reserve a seat; 409 if at capacity |
| POST | `/registrations/:id/status` | `{status, note?}`; validated against `ALLOWED_TRANSITIONS` |
| POST | `/registrations/:id/notes` | Add a note without changing status |
| GET | `/registrations/:id` | Registration + full timeline |
| GET | `/registrations` | Search: `q`, `event_id`, `session_id`, `status`, `sort`, `dir`, `page`, `pageSize` — all server-side |
| POST | `/sessions/:sessionId/import` [organizer only] | Multipart CSV upload (`file` field, columns `name,email`); returns a per-row report |
| GET | `/sessions/:sessionId/export` | Downloads the session's check-in sheet as CSV |

**Dashboard / Alerts**
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | Headline numbers, by-status, by-session, 14-day check-in chart |
| GET | `/alerts` | Sessions currently at capacity and not (freshly) dismissed |
| POST | `/alerts/:sessionId/dismiss` [organizer only] | Dismiss until the session next refills from empty |

## Deploying it

This is a single Node service (API + static frontend together), so it's one web service to
deploy — no separate frontend host needed. Rough steps for a free-tier host like Render:

1. Push to GitHub (done — see your repo).
2. Create a new Web Service on Render (or similar), point it at the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Set `JWT_SECRET` to a real random value in the service's environment settings.
5. **Caveat:** most free-tier filesystems are ephemeral — `data.db` resets on redeploy/restart.
   Fine for a demo (re-run `npm run seed` after each deploy), but for real persistence swap
   `server/db.js` for a hosted Postgres — every query already goes through parameterised
   `db.prepare()` calls, so only the driver needs to change, not the query logic.

## Known limitations

- No automated test suite — verification of the lifecycle/capacity/expiry logic was manual code
  reading, not tests. Flagged honestly in `SUBMISSION.md` as the weakest part of the codebase.
- No email/notifications, no waitlist, no QR check-in — all on the brief's optional stretch list,
  not attempted, in favor of getting the required ten goals solid.
- SQLite's single-writer model means heavy concurrent writes (many check-in staff hitting the
  same event simultaneously, at 100x current scale) would eventually bottleneck — see
  `docs/schema.md` for the specifics and the Postgres migration path.

## Troubleshooting

**`Error: Cannot find module 'better-sqlite3'`**
`npm install` didn't finish, or was silently skipped. Check `node_modules/better-sqlite3` exists;
if not, re-run `npm install` and read the full output.

**`npm warn install-scripts ... better-sqlite3 ... had install scripts blocked`**
Newer npm versions block native-module install scripts by default. Run:
```
npm install-scripts approve better-sqlite3
npm install
```

**`gyp ERR! find VS` / "Could not find any Visual Studio installation" during install**
This means npm is trying to *compile* `better-sqlite3` from source because no ready-made binary
exists for your Node version — this hit on Node 24, since the older `better-sqlite3` v11 in this
project only ships ready-made binaries for versions that existed when it was published. Fix: bump
the dependency instead of installing Visual Studio. In `package.json`, change:
```
"better-sqlite3": "^11.3.0",
```
to
```
"better-sqlite3": "^13.0.0",
```
then:
```
rmdir /s /q node_modules   (Windows)   or   rm -rf node_modules   (Mac/Linux)
npm install
```
Version 13+ moved to N-API, which works across Node versions without needing a version-specific
prebuilt file — this is the actual fix that got this project running on Node 24.

**`'git' is not recognized as an internal or external command`**
Git for Windows isn't installed (or the installer was cancelled partway — check for a Windows
"allow this app to make changes" popup you may have dismissed). Install from
`git-scm.com/download/win`, click Yes on that permission popup, complete the installer to an
actual Finish screen, then close and reopen your terminal.

**`npm install` succeeds but `npm run seed` errors about missing bindings**
Same root cause as the Visual Studio issue above — the native module wasn't actually built.
Delete `node_modules` and reinstall after applying the `better-sqlite3` version fix.
