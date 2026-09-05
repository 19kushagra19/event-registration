# AI assistance record

## Accuracy note

I used AI as a learning and troubleshooting aid while building this project locally. I did not retain a complete verbatim export of every chat, so I will not present reconstructed wording as an exact transcript. The entries below record the real areas where I used assistance, the guidance I received, and what I changed or verified afterwards. The retained screenshots show the dependency, Render, and JWT setup guidance described below.

## Native dependency setup: `better-sqlite3`

### What I asked for

Help resolving the `better-sqlite3` installation problem on Node 24 without installing Visual Studio build tooling.

### What I got

The guidance explained that the older `better-sqlite3` version did not provide a suitable ready-made binary for my Node version and recommended changing the dependency from v11 to v13, then reinstalling dependencies.

### What I did and verified

I updated `package.json` to `better-sqlite3` v13, reinstalled dependencies, and confirmed the local application could use SQLite. This corrected the earlier environment approach: changing the dependency was more appropriate than trying to alter my Visual Studio setup.

## Render deployment

### What I asked for

Guidance for deploying the locally working Node application to Render with consistent demo data.

### What I got

The setup guidance specified a Node service, `npm install` as the build command, and `npm run seed && npm start` as the Render start command so the ephemeral free-tier filesystem is reseeded after a restart.

### What I did and verified

I pushed the project to GitHub, configured Render with that start command, and verified the deployed application using the seeded organizer and staff credentials. I also documented the free-tier wake-up time and reset behaviour in `SUBMISSION.md`.

## JWT configuration

### What I asked for

How to configure a secure signing secret for the login token in Render.

### What I got

The guidance recommended adding a `JWT_SECRET` environment variable with a long random value, rather than using a real password or committing a secret into the repository.

### What I did and verified

I configured the variable in Render and kept secrets out of version control through `.gitignore`.

## Lifecycle and capacity review

### What I asked for

How to model the registration lifecycle: Reserved → Confirmed → Checked In; cancellation from only Reserved or Confirmed; capacity based on Reserved, Confirmed, and Checked In; and expiry of old reservations.

### What I got

An explicit server-side transition map and capacity check. An early version did not run the expiry sweep before every capacity-sensitive calculation, which could leave an expired reservation holding a seat too long.

### What I corrected

I added `expireStale()` before capacity-sensitive reads and writes, plus a background sweep. I then manually checked the seeded full session, illegal status transitions, and the cancellation flow.

## What I learned

AI was most useful for narrowing down environment and deployment errors and for explaining unfamiliar configuration steps. I still tested locally, read the code paths involved, and made the final choices about the deployed configuration and scope.
