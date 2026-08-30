# Architecture

## Moving pieces

- **A single Node.js/Express service** (`server/`) that serves both the JSON API (under `/api/*`)
  and the static frontend (`public/`) from one process.
- **SQLite** (`data.db`, via `better-sqlite3`) as the database, accessed synchronously and
  exclusively through the Express process — nothing else talks to the DB file directly.
- **A vanilla JS single-page app** (`public/app.js`) with a hash router (`#/events`,
  `#/sessions/12`, etc.), talking to the API with `fetch` and an `httpOnly` cookie for auth.

They talk to each other over plain HTTP: the browser calls `/api/...` endpoints, the server
reads/writes SQLite through prepared statements in `server/routes/*.js` and shared helpers in
`server/utils/` (`lifecycle.js` for expiry/capacity/fullness, `access.js` for the
organizer-vs-staff visibility rule).

## Where each piece runs

Everything — API and static frontend — runs in one Node process, so it deploys as a single
service (see `docs/decisions.md` for why I didn't split frontend/backend hosting). The browser
is the only other runtime involved, and it holds no state beyond the current page; every
authoritative read (capacity, status, visibility) is re-fetched from the server, never trusted
from a previous response.

## Request path: reserving a seat

1. Staff member clicks "Reserve seat" on a session page → `POST /api/sessions/:id/registrations`
   with `{attendee_name, attendee_email}`, cookie sent automatically.
2. `requireAuth` middleware verifies the JWT in the cookie and attaches `req.user`.
3. The route handler calls `access.canActOnSession(req.user, sessionId)` — for staff this checks
   `staff_assignments`; organizers pass unconditionally.
4. `lifecycle.expireStale()` runs first, so any Reserved row past the hold window is flipped to
   `Expired` *before* the capacity count is taken — otherwise a session could look full when a
   held seat should already have been freed.
5. `lifecycle.activeCount(sessionId)` counts Reserved+Confirmed+CheckedIn rows; if it's already
   at `capacity`, the request is rejected with 409 before any row is written.
6. Otherwise a `registrations` row is inserted with status `Reserved`, and a matching
   `registration_history` row is appended in the same SQLite transaction-adjacent call so the
   audit trail can never drift from the row it describes.
7. `lifecycle.recomputeFullness(sessionId)` updates `sessions.currently_full` /
   `last_full_at` if this reservation just filled the last seat — this is what feeds the alerts
   list.
8. The response returns the new registration; the frontend re-renders the session view, which
   re-fetches the registrations list and the seat count from the server rather than
   incrementing a local counter.

## What I decided not to build

- **No email/notification system.** Reminders and confirmation emails are on the stretch list,
  not the required ten, and would need a real mail provider + retry handling that wasn't worth
  the time against the required goals.
- **No separate admin-vs-organizer role split** beyond organizer/staff — the brief only asks for
  two roles, and adding a third would be unrequested scope.
- **No client-side caching/state library.** Every view re-fetches from the server on navigation;
  for the data volumes this system deals with (a handful of sessions, hundreds of registrations)
  that's simpler and safer against race conditions than reconciling local and server state.
- **No queueing/locking layer for the expiry sweep.** `better-sqlite3` is synchronous and
  single-connection by design, so writes are naturally serialized within the process — a
  separate lock would be solving a problem this setup doesn't have (see `docs/schema.md` for
  where that stops being true).
