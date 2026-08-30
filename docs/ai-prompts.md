# AI prompts

> This file needs to be a truthful log of the prompts *you* actually sent, in the order you sent
> them, including at least one that produced something wrong. If most of this codebase came from
> a Claude conversation (as this scaffold did), the honest version of this file describes that
> conversation's real prompts and real corrections — not a reconstruction that makes the process
> look tidier than it was. Below is the format to fill in, with one worked example from this
> build to show the level of detail expected.

## Building the registration lifecycle and capacity rules

### Prompt
"Implement the registration status lifecycle: Reserved → Confirmed → Checked In, with cancellation
allowed from Reserved or Confirmed but not Checked In, and any other transition rejected by the
server with a message explaining why. Capacity should count Reserved+Confirmed+CheckedIn together."

### What you got
An `ALLOWED_TRANSITIONS` map and a `/registrations/:id/status` route enforcing it, plus a capacity
check on creation — first draft did **not** call the expiry sweep before checking capacity, so a
reservation that should have expired 3 hours ago could still count against the limit and block a
new reservation from a session that actually had a free seat.

### What you corrected
Added `expireStale()` as the first line of both the reservation-creation route and the search/
dashboard/alerts routes, so no capacity or count decision is ever made against stale data — see
`docs/decisions.md` (Decision 5) for why that's synchronous rather than cron-only.

---

## <What you were trying to achieve>

### Prompt

### What you got

### What you corrected

---

TODO — add one entry per significant prompt/exchange, grouped by what you were trying to
accomplish (auth, events/sessions CRUD, search & pagination, CSV import/export, dashboard,
alerts, frontend, deployment troubleshooting, etc.), in the order you actually used them.
