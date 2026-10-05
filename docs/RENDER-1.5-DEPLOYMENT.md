# Render 1.5 deployment review — October 5, 2026

Existing service: IronHeart-Strength--1 (`srv-db1i5b6gekts73dunse0`).
URL: https://ironheart-strength-1.onrender.com
Repository: https://github.com/awhires/IronHeart-Strength-
Branch: main. Runtime: native Node. Compute: Free.

## Observed configuration

- Build: `npm install; npm run build`.
- Start: `node server/index.mjs` (missing `--production`).
- HOST confirmed `0.0.0.0`; PORT is consumed from Render's environment by the application.
- Server environment names: AI_ENABLED, AI_PROVIDER, HOST, OPENAI_API_KEY, OPENAI_MODEL. No key values were exposed.
- No DB_PATH, DEMO_MODE, COACH_EMAIL or COACH_PASSWORD is configured; no linked environment groups were present.
- Disk page says persistent disks are unavailable on Free compute. There is no persistent database disk.
- Earlier main commits automatically deployed. The live commit before this publication was 4905a848b5a0846e9b9981047dffa1578dc9a734.

The current start command runs development mode. With DEMO_MODE unset, the code selects the demo workspace and default `./data/demo.sqlite`. Neither Dockerfile environment settings nor its VOLUME declaration apply to this native Node service. A redeploy, restart or idle spin-down can lose SQLite data. The receipt table also needs durable storage; it cannot prevent duplicates across filesystem loss.

## Protected publication

Publish the verified 1.5 source to main with `[skip render]` in the commit message. Render documents this marker as suppressing auto-deployment of that commit. Do not manually deploy, restart, switch database paths, alter accounts, upgrade billing or attach a disk during this review. Those actions could replace the current ephemeral database before it is backed up.

## Required settings before real athlete use

1. Preserve current data first. Obtain a consistent SQLite backup of the current database and verify it can be restored. Do not copy only the live `.sqlite` file while ignoring outstanding WAL data. Upgrading/adding a disk can trigger a deploy; take the backup before any such change. Free services lack shell access, so contact Render support if a full backup cannot be obtained from the current instance. Any app-level export is not a full backup of accounts/password hashes/sessions.
2. Upgrade this same service to a paid compute plan that supports disks, with user approval for recurring charges. Do not create another service.
3. Attach a persistent disk on the same native Node service at `/var/data`. Set `DB_PATH=/var/data/iron-heart.sqlite`. Restore only approved compatible production data; the existing demo database cannot be silently relabeled or migrated into production because production intentionally rejects demo accounts.
4. Configure a real coach account/invitations. Set `DEMO_MODE=false` and `NODE_ENV=production`; use `npm start` or `node server/index.mjs --production`. Keep HOST=0.0.0.0 and let Render supply PORT. Node 24 is required by package.json and node:sqlite.
5. Keep existing AI variables server-side. Do not use VITE-prefixed keys or put provider credentials in the APK. Retain appropriate coach initialization credentials only in Render's environment; initialization requires a coach password of at least 12 characters when the database has no users. Credential entry must be done privately by the user.
6. Set health-check path `/api/health`. After approved storage/account setup, manually deploy the latest verified main commit, verify health, then save/reopen/retry a test workout. Re-enable normal auto-deploy only after disk durability has been established.

Do not rely on this Free service for real athlete history. Preview 1.5 can be tested on a physical phone in phone-only mode with disposable data. Server-connected 1.5 testing must wait for the deployment and storage/account work above. No production records or accounts were deleted or migrated by this publication.

## Verification

116 automated tests passed; production Vite build passed. Additional browser checks cover desktop/mobile selectors, RowErg intervals, substitutions and a server-accepted save with its response lost, followed by reload/retry without duplicates. The feature tests cover receipts, backend storage reopening, RX/Scaled/Modified, original/performed snapshots, cardio/Metcon data, AI draft v2 approval/save/assignment and legacy v1/strength data. These checks validate the implementation, not the durability of Render's ephemeral filesystem.

References: https://render.com/docs/disks , https://render.com/docs/free , https://render.com/docs/deploys#skipping-an-auto-deploy
