# Iron Heart Strength 1.7 release

## Publication and manual Render deployment

Repository: https://github.com/awhires/IronHeart-Strength- ; branch main.
This release adds cardio target/actual separation, compact mobile intervals, structured recovery, running/erg pace support and structured handwriting review. The commit uses [skip render] to suppress automatic Render deployment. The owner can later choose Manual Deploy > Deploy latest commit on the existing service.

No new dependency, environment variable, SQL migration, database path, account reset or disk change is required. server/store.mjs is unchanged from 1.6. New optional fields are stored in existing JSON records; saved historical values remain compatible. Keep the existing DB_PATH and persistent disk. No application or production database was deleted, reset or modified during release preparation.

Production requirements remain Node 24, build npm install --include=dev && npm run build (or existing equivalent), start npm start, HOST=0.0.0.0, Render-provided PORT, DEMO_MODE=false, and the existing production credentials/origin settings. Prior 1.6 notes record DB_PATH=/var/data/iron-heart.sqlite and a /var/data disk based on owner-provided configuration. The live Render dashboard could not be checked during this task because browser automation failed. Deployment readiness is verified for the code, not for the current live disk/environment configuration. Retain a consistent backup before deploying; do not switch database paths.

The repository retains its existing legacy Flutter native project. This publication updates web/backend/shared/test and release-script sources, consistent with prior publications. The signed Capacitor APK was built from the local Android project; its signing key and generated artifacts are excluded from GitHub.

## Android update

APK: output/apk/Iron-Heart-Strength-1.7-production-preview.apk
Package: com.ironheartstrength.app
Version: 1.7-preview ; versionCode 8 (previous 1.6: 7)
Backend: https://ironheart-strength-1.onrender.com
Signer SHA-256: 826cd6aa585cc6baa84618ea0c679b304fd3455ba7f03a739d4b617bd48d86bd

APK signature verification passed and the signer matches the previous 1.6 production-preview APK. The package ID and Capacitor HTTPS storage origin also match. This supports installation over the prior APK while retaining its app data. Installation on the actual phone was not performed, and its installed certificate was not independently read. Install as an update; do not uninstall or clear storage. Server-connected scanner/new backend validation requires the matching manual backend deployment. Signing uses the existing preview key, not a Play Store release/upload key.

SHA256 is saved alongside the APK. APK inspection confirms the latest interval UI and existing hosted backend URL; the credential scan passed.

## Verified checks

- 139 unit/API tests passed on both local and publication sources.
- 9 desktop/mobile browser tests passed.
- Production web build passed.
- Isolated production smoke test passed: startup, /api/health, HTML and compiled assets.
- Android Gradle assembleDebug passed (93 tasks), APK v2 signature passed.
- Existing Android dependency/SDK tooling warnings were emitted; no compilation failure.
- No physical phone install, live handwriting API call, or Render deployment was performed.
