# Plan

> This file is meant to be an honest record of your own working sessions — a reviewer will match
> it against the actual commit timestamps in `git log`. Below is the structure to fill in, plus
> the shape the initial build (this conversation) actually took, which you can use as your first
> 1-2 sessions if that's really how you worked, and should otherwise replace with what you did.

## How did you break the work into sessions?

TODO — e.g. "Session 1: schema + auth + role middleware. Session 2: events/sessions CRUD.
Session 3: registration lifecycle + capacity + expiry (the trickiest part). Session 4: search,
bulk CSV import/export. Session 5: dashboard + alerts. Session 6: frontend wiring. Session 7:
deploy + docs + seed data + polish."

## What order did you build in, and why that order?

The build in this repo went: **schema & auth → events/sessions CRUD → registration lifecycle
(reserve/confirm/cancel/check-in + capacity enforcement + expiry) → staff assignment & visibility
→ search/filter/pagination → bulk CSV import/export → dashboard → alerts → frontend → docs/seed**.

The reasoning: everything else depends on knowing what a "registration" is and what states it can
be in, so that lifecycle was built and manually reasoned through before anything that *reads*
registrations (search, dashboard, alerts) — building the read-heavy features first would have
meant redoing them once the status rules solidified. Frontend came last on purpose, once every
API contract it needed to call already existed and had been exercised.

TODO — replace with your own actual order if you built it differently, or confirm this matches.

## What did you estimate versus what it actually took?

TODO — this needs your own numbers. Be specific: which of the 10 goals took longer than expected,
and why (the registration lifecycle + capacity race + alert-reappearance logic is the most likely
candidate — it's the one place where getting the rules exactly right required re-reading the brief
several times).

## What did you cut when you ran short?

TODO — if you ran out of time, say what you deliberately left thin (e.g. limited UI polish,
no automated test suite, no email notifications from the stretch list) and why that was the right
thing to cut rather than one of the 10 required goals.
