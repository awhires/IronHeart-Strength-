# Iron Heart Strength 1.9-preview

APK: `output/apk/Iron-Heart-Strength-1.9-production-preview.apk`

Package: `com.ironheartstrength.app`. Android version: `1.9-preview`, code **12** (previous 1.8.1 code 11). Existing preview signing configuration and Capacitor HTTPS storage origin are preserved.

Backend embedded in Android: `https://ironheart-strength-1.onrender.com`. Standalone demo is disabled; no local development server is selected.

## Verification

- Complete automated suite: **178 passed**, zero failures/skips.
- Complete browser/mobile suite: **28 test entries passed**, zero failures/skips, including 360px/390px and desktop coverage.
- Production web build and hosted-backend production web build: passed, 1,643 modules.
- Capacitor Android sync and Gradle `assembleDebug`: passed. The existing production-preview workflow intentionally uses the preview-signed debug build variant.
- APK metadata confirms package, `1.9-preview`, and code 12.
- APK signature verifies and signer SHA-256 exactly matches the saved 1.8.1-preview APK: `826cd6aa585cc6baa84618ea0c679b304fd3455ba7f03a739d4b617bd48d86bd`.
- Credential scan plus expanded APK inspection: **446 entries passed**. No environment files, database files/content, keystores/private keys, configured API/coach secrets, credential patterns, or server provider implementations detected. Hosted backend appears in the application bundle.
- Repository candidate scan found no secrets or sensitive artifacts. Existing public Android debug passwords remain unchanged in native build configuration; the private signing keystore is ignored and not packaged. The publication index contains no sensitive filenames.
- Existing compatibility regressions passed: legacy programs/history, grouped prescriptions, cardio intervals, receipts/retry, Goals & Progress, and runtime recovery. No stored application data was deleted or migrated.

APK SHA-256: `ce54030e0f5378a93fa6b5d749e254772e26b66537890bb855bea8968f3a883b`

Logs: `output/qa/1.9-regression.txt`, `1.9-browser.txt`, `1.9-web-build.txt`, `1.9-android-final.txt`, `1.9-credential-scan.txt`, `1.9-apk-verification.txt`, and `release-1.9-repository-scan.json`.

The initial Android attempt encountered a stale copied Gradle cache and unavailable offline dependencies. Only the temporary staged cache was set aside; downloading public dependencies resolved the build. No app source or signing changes were needed. Non-fatal flatDir, SDK XML and Java unchecked-operation warnings remain.

## Phone testing and backend coordination

Install this APK over the existing 1.8.1 preview; do not uninstall or clear storage. Matching package/certificate and the higher version code support an in-place update. The physical device's installed certificate and installation were not independently verified in this run; the comparison was against the saved previously delivered APK.

**A matching Render backend deployment is required for full testing of the new shared validation/progression behavior, particularly multi-set duration-based assigned logging.** A fresh APK does not update Render. The hosted service's currently deployed revision was not inspected or changed. Calendar UI can be tested immediately, but an older backend can reject new timed logs or retain old progression eligibility.

No new environment variables, database migrations, database path changes or persistent-disk changes are required. Keep the existing production credentials server-side and retain `/var/data/iron-heart.sqlite` and its disk configuration.

Legacy plank breath counts remain preserved, not converted into seconds; coaches must explicitly enter duration where missing. Grouped coach increases preserve individual rows; dynamic-effort waves and automatic history-driven changes remain intentionally restricted for grouped prescriptions. See `docs/FOCUSED-PRESCRIPTIONS.md` for scope and adaptive architecture recommendations.

Adaptive athlete prescriptions remain future work. No GitHub push, Render deployment or production data modification was performed. Live AI calls and physical Android installation were not tested.
