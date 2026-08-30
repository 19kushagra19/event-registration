# Decisions

## Decision 1

- **Chose:** SQLite (`better-sqlite3`), a single file committed to `.gitignore` and created fresh
  by `server/seed.js`.
- **Rejected:** A hosted Postgres (e.g. Supabase) from the start.
- **Why:** For the size of this system (a handful of events, a modest number of registrations)
  a single-file synchronous database removes an entire class of setup friction — no connection
  string, no network round-trip per query, no separate service to keep alive on a free tier. The
  trade-off is real (see `docs/schema.md` on what breaks first at scale), but it's the right
  trade for a 12-hour assignment whose reviewer needs to run it in a minute, not a system meant
  to hold up under real conference-week concurrency.

## Decision 2

- **Chose:** One Node/Express service serving both the JSON API and the static frontend.
- **Rejected:** The suggested split (separate frontend on Vercel, backend on Render).
- **Why:** The split buys independent scaling and deploy cadence for frontend vs. backend, which
  this project doesn't need. One service means one thing to deploy, one URL, no CORS
  configuration to get right, and no risk of the two halves drifting out of sync on a free tier
  that can sleep and wake independently. The README is explicit that any hosting shape scores
  equally, so I optimised for fewer moving parts.

## Decision 3

- **Chose:** A vanilla JS frontend (hash router, `fetch`, template strings) with no build step.
- **Rejected:** React (via Vite).
- **Why:** No build step means the exact files that render in the browser are the exact files in
  the repo — nothing to compile, no `dist/` to remember to regenerate before deploying. Given the
  UI surface here (a handful of list/detail/form views, no heavy client-side state), a component
  framework wasn't buying enough to be worth the extra toolchain, especially against a fixed time
  budget.

## Decision 4

- **Chose:** Enforce the registration status state machine (`Reserved → Confirmed → CheckedIn`,
  cancellation rules, expiry) entirely in the Express route layer, against an explicit
  `ALLOWED_TRANSITIONS` map.
- **Rejected:** Encoding the same rules as SQLite triggers, or trusting the frontend to only ever
  send legal transitions.
- **Why:** The frontend only ever *offers* legal next states as buttons, but the brief is explicit
  that illegal moves must be rejected by the server — so the frontend restriction is UX, not the
  actual guarantee. Triggers would give the same server-side guarantee but split the rule across
  SQL and JS; keeping it in one map in `registrations.js` means the whole state machine is
  readable in one place and the rejection message can explain *why*, not just fail silently.

## Decision 5

- **Chose:** Defensive, synchronous expiry (`expireStale()` called at the top of every
  capacity-sensitive route) *plus* a 60-second background sweep, rather than relying on the
  background timer alone.
- **Rejected:** A cron-only approach where a scheduled job is the sole thing that ever marks a
  reservation `Expired`.
- **Why:** A cron-only sweep means correctness depends on timing — a request that lands 10 seconds
  after a reservation should have expired, but before the next sweep runs, would see a session as
  full when it shouldn't be. Calling `expireStale()` synchronously right before any capacity
  check makes the guarantee timing-independent; the background sweep exists only so the dashboard
  and alerts stay roughly current even without an incoming request to trigger the check.

## Decision 6

- **Chose:** Reject a bulk-import CSV row as `invalid` for a missing/malformed name or email, and
  separately as `rejected — session is at capacity` once the session fills mid-import, keeping
  both under a single `rejected` bucket in the summary but with a distinct `reason` string.
- **Rejected:** Treating an at-capacity row as a different top-level outcome from a malformed row.
- **Why:** The brief's required outcomes are "new reservation / duplicate / rejected as invalid
  with a reason" — capacity isn't its own named outcome, so I folded it into `rejected` with a
  reason that makes the actual cause obvious in the per-row report, rather than inventing a
  fourth outcome category the brief didn't ask for.
  **Later reversed:** I originally had capacity exhaustion silently stop processing the rest of
  the file once the session filled up, on the assumption that's what a human importer would want.
  I reversed that after re-reading goal #7's line that "valid rows are still created even when
  others in the same file are rejected" — that's clearly about validity, but it made me realize
  stopping early would also silently drop rows that *could* fail for other reasons (bad email,
  duplicate) later in the file, which the reviewer would have no visibility into. Now every row is
  always evaluated and reported, even after the session fills — later rows just report `rejected:
  session is at capacity` instead of being skipped.
