# Build plan and delivery notes

## How I split the work

I worked in focused local-development sessions of roughly 3–4 hours per day. I deliberately built the data model and server rules before the interface, because the registration lifecycle and capacity rules are the most important correctness risks in this assignment.

1. **Project setup and data model.** Set up Node/Express, SQLite, the schema, seed data, and email/password login with organizer and staff roles.
2. **Core event operations.** Built event and session CRUD, then staff-to-session assignments and server-side access checks.
3. **Registration lifecycle.** Added reservation, confirmation, check-in, cancellation, expiry, capacity counting, and append-only history.
4. **Operational features.** Added registration search, server-side pagination and filters, CSV import/export, dashboard metrics, and capacity alerts.
5. **Frontend and verification.** Connected the SPA to every API flow and tested the seeded organizer and staff accounts locally.
6. **Deployment and documentation.** Pushed the local project to GitHub and deployed the same app to Render. I completed this final deployment stage on the final day.

## Why I used this order

The state machine and capacity rule were built before search, dashboard, import, and alerts because all of those features depend on a reliable definition of an active registration. Building the UI after the API also meant the browser could stay a thin client: it displays fresh server results rather than deciding permissions, capacity, or lifecycle transitions itself.

## Estimate versus actual effort

The brief suggested about 12 hours. I spent more than that, working 3–4 hours daily while learning and building side by side. I did not keep a precise feature-by-feature time log, so I do not want to invent one after the fact. The parts that took noticeably longer than expected were the local environment setup and deployment: resolving the `better-sqlite3` compatibility issue with Node 24, understanding npm install-script approval, setting up Git on Windows, and configuring Render to seed demo data on service startup.

## Scope I deliberately left out

I prioritised the ten required goals over stretch features. I did not build email notifications, QR badges, a waitlist, a public registration site, speakers, sponsors, payments, or post-event surveys. I also cut an automated test suite because of time; this is the first improvement I would make next, especially around expiry, capacity, and alert reappearance.
