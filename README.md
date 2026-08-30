# Event Registration

A registration system for multi-day conferences and workshops: organizers create events and
sessions with real seat capacity, check-in staff manage the door, and unconfirmed reservations
free themselves automatically. Built for the Assignment 12 brief — see `docs/` for the design
write-up and `SUBMISSION.md` for links/credentials/checklist.

## Stack

Node.js + Express + SQLite (`better-sqlite3`) on the backend, a dependency-free vanilla JS
single-page app on the frontend, served from the same process. See `docs/decisions.md` for why.

## Run it locally

```bash
npm install
npm run seed    # creates data.db and demo accounts/data
npm start        # http://localhost:3000
```

Demo accounts (created by `npm run seed`):

| Role | Email | Password |
|------|-------|----------|
| Organizer | organizer@demo.test | password123 |
| Staff | staff1@demo.test | password123 |
| Staff | staff2@demo.test | password123 |

Environment variables (all optional, sane defaults for local dev):

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | dev value | **Set a real secret in production** |
| `HOLD_MINUTES` | `30` | How long a `Reserved` seat is held before auto-expiring |
| `DB_PATH` | `./data.db` | SQLite file location |

## Deploying (free tier)

This is a single Node service (API + static frontend together), so it deploys as one web
service — no separate frontend host needed. On Render (or any similar platform):

1. Push this repo to GitHub.
2. Create a new Web Service on Render, point it at the repo.
3. Build command: `npm install`. Start command: `npm start` (or `node server/index.js`).
4. Set `JWT_SECRET` to a real random value in the service's environment variables.
5. **SQLite caveat:** Render's free-tier filesystem is ephemeral — `data.db` will reset on
   redeploy/restart. That's fine for a demo (re-run `npm run seed` after each deploy, or add a
   one-off deploy hook that runs it), but if you want data to persist across restarts, swap
   `server/db.js` for a hosted Postgres connection (e.g. Supabase) instead — every query in this
   codebase already goes through parameterised `db.prepare()` calls, so the query logic itself
   doesn't need to change, just the driver.

## Project layout

```
server/
  index.js          # express app, mounts routes, serves public/
  db.js              # schema + connection
  auth.js            # password hashing, JWT issue/verify
  seed.js             # demo data
  middleware/         # requireAuth, requireRole
  routes/              # auth, events, sessions, staff, registrations, dashboard, alerts
  utils/                # lifecycle.js (expiry/capacity/fullness), access.js (visibility rules)
public/
  index.html, app.js, style.css   # frontend SPA, no build step
docs/
  architecture.md, schema.md, plan.md, decisions.md, ai-prompts.md
```
