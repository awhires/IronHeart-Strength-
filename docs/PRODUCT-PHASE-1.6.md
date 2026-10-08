# Iron Heart product phase — October 8, 2026

This phase extends the existing React/Capacitor app, Node backend, SQLite JSON record store, assignments, AI review receipts and workout logging. It does not replace authentication, branding, workout prescriptions or the production database.

## Changes

- AI Builder starts with Strength, Hypertrophy / Bodybuilding, Running, Metcon / Conditioning and Hybrid cards. A large natural-language prompt remains required. Optional modality preferences supplement it; existing confirmed requirements remain independent checks. Regeneration retains modality preferences.
- Versioned, allowlisted programming context feeds the existing provider service and structured draft contract. The selected modality is bound to approval receipts and carried into saved program metadata. Programs still require coach approval and a separate assignment action.
- Athlete Programs has My Programs and Discover. Discover is coach-controlled availability, not a public marketplace. It is disabled by default; coaches can make a template available to all their athletes or selected athletes.
- Program Details includes description, goal, weeks, frequency, modality, level and a sample week using existing strength/cardio/Metcon components.
- Start Program opens four setup steps: start date, available training days, relevant coach-defined day preferences, then a full schedule review including rest days. Only confirmation persists an assignment/schedule. Newly assigned programs created through the coach UI default to athlete setup; existing API clients retain immediate scheduling unless they request setup.
- Move Workout is available on the athlete home, calendar and plan. It updates athlete dates without recreating sessions, changing prescriptions or deleting logs. It rejects conflicts within the assignment, changes to session order, violations of explicit recovery requirements and moves of completed sessions. Other workouts on the selected date trigger a visible warning without automatic changes to those programs.
- Athlete Home emphasizes today's sessions, a weekly completed/scheduled/rest row and completion-based program progress. Logging and receipt/outbox behavior remain the existing implementation.
- Mobile athlete navigation uses Home, Training, Log, Progress and More. More exposes Programs, Exercise Library, My Stats & PRs, account/settings, help and sign-out. Coach navigation remains separate. The real Iron Heart assets remain in use, including the mobile athlete header.

## Additive data model

No SQL table changes, destructive migrations or production-data changes.

Existing `records` JSON bodies gain optional fields:

```js
program.modality // strength | hypertrophy | running | metcon | hybrid
program.level // optional text
program.discover = { enabled: false, athleteIds: [] }
// Empty athleteIds means all athletes in this coaching workspace.

session.scheduleRole // explicit role such as long_run, intervals, heavy_lower
session.minRecoveryHours // minimum recovery AFTER this session; date-level scheduling

assignment.enrollment = { source: 'coach' | 'discover', status: 'pending' | 'active' }
assignment.schedule = {
  version: 1, startDate: 'YYYY-MM-DD', availableDays: [1, 3, 6],
  preferences: { long_run: 6 },
  dates: { '1:0': 'YYYY-MM-DD' } // week:session index -> athlete date
}
```

Assignments copy relevant program description/modality/level. Athlete dates never replace the master program's session weekdays. Existing assignments without `schedule` retain their original Monday-based weekday calendar behavior. Existing assignments without enrollment metadata remain active. Existing program visibility remains private. Existing session/log identities are unchanged.

Enrollment uses consecutive seven-day training weeks starting on the selected date. It walks the coach's session array in order, using available weekdays and only explicit role/recovery constraints. Infeasible preferences return an actionable error instead of silently changing the program. Enrollment is prevented after logs exist; individual moves are then used. Repeated Discover enrollment cannot create another assignment for the same athlete/program. Completed status still comes from the original assignment/week/session log linkage.

AI requests gain optional `programming: { version: 1, modality, options }`. The provider receives explicit Iron Heart principles and this allowlisted context. Draft v1/v2 schemas remain unchanged. Approval receipts include the programming context, preventing a modality change between approval and save. Saved provenance adds methodology version and modality; raw preference fields are not automatically published as program metadata.

## Changed files

- `src/AIProgramBuilder.jsx`, `src/AIDraftReview.jsx`: modality controls and approval-bound metadata.
- `src/AthletePrograms.jsx`, `src/athlete-experience.css`: details, enrollment, home, move UI and mobile styling.
- `src/main.jsx`, `src/local-demo.mjs`: integration and local-preview parity.
- `shared/program-schedule.mjs`: validation, availability, scheduling, moves, review and progress.
- `shared/ai/programming-options.mjs`, `shared/ai/save-service.mjs`: versioned guidance and approved metadata persistence.
- `shared/prescriptions.mjs`: optional metadata validation and Discover normalization.
- `server/index.mjs`, `server/ai/generation.mjs`: authenticated availability, preview/enroll/move routes, pending-log protection and AI context.
- `tests/program-schedule.test.mjs`, `tests/enrollment-api.test.mjs`, `tests/enrollment-preview.test.mjs`, `tests/ui/athlete-experience.browser.mjs`, `tests/ui/conditioning.browser.mjs`: regression coverage and updated navigation checks.
- `android/app/build.gradle`: version code 7, version 1.6-preview; same package and preview signing key.
- `scripts/build-production-preview-apk.ps1`, `scripts/verify-preview-apk.ps1`: production-backend preview build and configurable credential scan.
- This report. Capacitor sync also regenerates native web assets/configuration.

## Verification

- Full automated suite: **130 passed, zero failures**. Includes legacy coach assignments, strength, cardio, Metcons, AI v1/v2, SQLite save receipts, duplicate protection, retry/outbox and new hosted/local enrollment tests.
- Browser suite: **8 passed, zero failures** (two parent suites and six desktop/mobile scenarios). Covers selector addition, M:SS, mixed blocks, cardio logging, Metcon substitution, response-loss/retry/reopened history, enrollment review/confirmation, move without duplicates, completion/progress and mobile navigation, plus all five AI modalities and natural-language generation into review.
- AI provider requests were mocked; no live model quality or paid generation is claimed.
- Production web build passed both for same-origin hosted web and for the Android hosted-backend configuration.
- Browser screenshots/logs are in `output/qa/`.
- APK verification is recorded in `output/qa/product-apk-verification.txt`; build output is in `output/qa/product-android-build.txt`.
- Final APK: `C:\Users\austi\OneDrive\Documents\ChatGPT\fitness app\output\apk\Iron-Heart-Strength-1.6-production-preview.apk`.
- Android Gradle build passed. Package `com.ironheartstrength.app`, version code **7**, version name **1.6-preview**. Valid APK v2 signature; signer matches the earlier production 1.5 APK (code 6). Package and HTTPS Capacitor storage origin are preserved, supporting installation over that existing app without uninstalling.
- Credential scan passed across **446 archive entries**. It checked provider credential patterns, configured local provider/coach secret values, credential markers and prohibited config/key files. Packaged assets contain the hosted Render URL and the current builder/enrollment/move code, with no localhost:4173 backend. No physical-device installation was performed.
- APK SHA-256: `8679bbd5acfdc162a9f4872f547c36954eae7724cf4a957dce1b09dd7683b4ce`.

## Deployment and deliberate limits

The new backend routes and AI context/save changes must be published to the existing GitHub/Render service before server-connected use of these features. This phase does not push or deploy, create a Render service, touch billing, view production credentials or migrate/delete data. Retain the production settings you reported: persistent disk `/var/data`, `DB_PATH=/var/data/iron-heart.sqlite`, `DEMO_MODE=false`, `NODE_ENV=production`, private coach/provider credentials, Render PORT and HOST=0.0.0.0. Keep the successful production install/build configuration and `npm start`/`--production` behavior. Back up SQLite consistently before deployment.

The APK uses `https://ironheart-strength-1.onrender.com`; it is an update preview, not a Play Store release. Backend deployment is required for the new server-connected flows. Browser verification uses isolated test databases; physical-phone behavior against the deployed service is not claimed.

Deferred: payment processing, a public marketplace, individualized research rule engines, automatic coach-style learning, a five-metric PR dashboard, calendar swaps, and automatic changes to other training modalities. My Stats & PRs links to existing Exercise Progress with a clearly labeled future focus-card foundation. Coach-defined session order is intentionally enforced, so a swap that would reorder sessions is not offered.
