# Schema

## Tables

**users** — `id` PK, `email` TEXT UNIQUE NOT NULL, `password_hash` TEXT NOT NULL,
`name` TEXT NOT NULL, `role` TEXT NOT NULL CHECK IN ('organizer','staff'),
`created_at` TEXT (ISO datetime, default now).

**events** — `id` PK, `name` TEXT NOT NULL, `description` TEXT, `start_date` TEXT NOT NULL,
`end_date` TEXT NOT NULL, `venue` TEXT NOT NULL, `archived` INTEGER NOT NULL DEFAULT 0,
`created_at` TEXT.

**sessions** — `id` PK, `event_id` INTEGER NOT NULL FK → events(id) ON DELETE CASCADE,
`title` TEXT NOT NULL, `start_time` TEXT NOT NULL, `duration_minutes` INTEGER NOT NULL,
`location` TEXT NOT NULL, `capacity` INTEGER NOT NULL CHECK (capacity > 0),
`last_full_at` TEXT NULL, `currently_full` INTEGER NOT NULL DEFAULT 0, `created_at` TEXT.

**staff_assignments** — `id` PK, `user_id` INTEGER NOT NULL FK → users(id) ON DELETE CASCADE,
`session_id` INTEGER NOT NULL FK → sessions(id) ON DELETE CASCADE, `created_at` TEXT,
UNIQUE(user_id, session_id).

**registrations** — `id` PK, `session_id` INTEGER NOT NULL FK → sessions(id) ON DELETE CASCADE,
`attendee_name` TEXT NOT NULL, `attendee_email` TEXT NOT NULL,
`status` TEXT NOT NULL CHECK IN ('Reserved','Confirmed','CheckedIn','Cancelled','Expired'),
`reserved_at` TEXT NOT NULL default now, `updated_at` TEXT NOT NULL default now.
Indexed on `session_id`, `status`, `attendee_email`.

**registration_history** — `id` PK, `registration_id` INTEGER NOT NULL FK → registrations(id)
ON DELETE CASCADE, `old_status` TEXT NULL, `new_status` TEXT NOT NULL, `changed_by` TEXT NULL
(email of the actor, or `'system'` for auto-expiry), `note` TEXT NULL, `changed_at` TEXT.
Append-only: no route ever issues an UPDATE or DELETE against this table.

**dismissed_alerts** — `session_id` INTEGER PK, FK → sessions(id) ON DELETE CASCADE,
`dismissed_at` TEXT NOT NULL default now. One row per session, upserted on each dismissal.

## Relationships

- One-to-many: `events → sessions`, `sessions → registrations`, `sessions → staff_assignments`
  (from the session side), `registrations → registration_history`.
- Many-to-many: `users (staff) ↔ sessions`, resolved through the `staff_assignments` join table
  with a `UNIQUE(user_id, session_id)` constraint so a double-assignment is a database error, not
  something the app has to remember to check.

## Constraints: database vs. application

**In the database:** foreign keys with `ON DELETE CASCADE` (deleting an event or session cleans
up its children rather than leaving orphans); `CHECK` constraints on `role`, `status`, and
`capacity > 0` (a bad enum value or a zero-capacity session is rejected at the storage layer, not
just by whichever route happened to validate it); the uniqueness of `(user_id, session_id)` in
`staff_assignments` and of `email` in `users`.

**In application code:** the registration status *transition* rules (`Reserved → Confirmed →
CheckedIn`, cancellation only from Reserved/Confirmed, etc.) — SQLite's `CHECK` can validate that
a value is one of five strings, but not that the *previous* value made a given new value legal.
Same for the capacity check (`active count < capacity`) and the organizer-vs-staff visibility
rule — both need to read other rows to decide, which is squarely business logic, not a column
constraint.

I drew the line there because a `CHECK` constraint that only validates static shape is cheap and
free of race conditions, while anything that needs "compare against other rows" logic has to run
inside the same request that's about to write, where I can also write the matching
`registration_history` row atomically. Pushing that into a trigger would work too, but would
split the business logic across two languages (SQL triggers + JS) for no real benefit at this
scale.

## What I deliberately denormalised

`sessions.currently_full` and `sessions.last_full_at` are redundant — both are derivable at any
moment from `COUNT(*) ... WHERE status IN (...)` against `registrations`. I stored them anyway
because the alert-reappearance rule (goal #10) needs to know *when* a session last transitioned
into "full," not just whether it's full right now, and recomputing that from history on every
`/alerts` request would mean scanning `registration_history` for transition points on every page
load. Trading a small amount of write-time bookkeeping (updated in `recomputeFullness()`
whenever a registration's status changes) for a cheap read was the right side of that trade for a
value that's read far more often than it changes.

## What would break first at 100x the data

`better-sqlite3` opens a single file with one writer at a time — reads are cheap and concurrent,
but writes serialize. At 100x the registration volume, and if check-in staff at multiple sessions
are writing simultaneously during the same event window, that single-writer model becomes the
bottleneck before anything else does (the query patterns themselves are all indexed and would
still be fast). The fix is a straightforward swap to a real client-server database — Postgres —
which is why every query in this codebase goes through parameterised `db.prepare()` calls rather
than anything SQLite-specific in shape; the harder part of a 100x migration would be re-pointing
`server/db.js` at a Postgres client, not rewriting the query logic.

The `LIKE '%...%'` search over `attendee_name`/`attendee_email` in the "find registrations" list
would also degrade — it can't use the existing index at that scale — and would need a proper
full-text index before 100x.
