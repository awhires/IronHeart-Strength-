# Iron Heart Strength preview 1.5

## Changes

Workout saves now use a durable, account- and connection-scoped device outbox. Metcons have an Iron Heart whiteboard presentation, movement scaling/substitutions and separate performed snapshots. Cardio targets support multiple efforts with recovery, optional RPE and calculated pace/speed. AI draft v2 carries cardio and Metcon structures through review, approval, save and assignment; draft v1 remains supported.

## Persistence and diagnosis

The phone-only preview and a connected server have separate histories. Switching between them never migrates or deletes either history. The connected app's bearer session is held in memory, so reopening requires sign-in before server history can reload. These architectural facts can look like lost history; this investigation did not establish that an actual stored workout was deleted on the user's physical phone.

Before POSTing `log` or `tracker`, the client persists the payload and a UUID `clientRequestId` in `iron-heart-workout-outbox-v1:<connection>`. Queued workouts survive page/app reload; Account & settings offers explicit retry and confirmed discard for the signed-in owner. Only an acknowledged response removes the queue entry. A successful save followed by a failed history refresh is reported as saved, preventing a misleading resubmission.

SQLite adds `workout_receipts(user_id, request_id, request_hash, log_id)` with an account-scoped primary key. Receipt and log commit in one transaction. A repeated request returns the existing record; reusing an ID with different content returns 409. Retrying a deliberately deleted record returns 410 instead of resurrecting it. Existing clients without IDs retain their existing behavior. Assigned-session duplicate protection remains in place. The phone-only store has matching durable receipt behavior inside its existing JSON storage.

The API remains authenticated with existing ownership checks. No passwords, API keys or session tokens are added to persistent client storage. Phone-only history stays under its original storage key; the Android HTTPS origin, application ID and signing key are retained.

Hosted persistence requires deploying this backend and using a persistent disk for `DB_PATH`. With the existing Docker configuration, mount persistent storage at `/app/data` and retain `/app/data/iron-heart.sqlite` including SQLite WAL/SHM files. An ephemeral host filesystem cannot guarantee persistence across redeploys. Render disk configuration and the deployed service were not verified or changed. This is not full offline server-data synchronization: after reopening without a connection, queued payloads remain stored, but fresh server assignments/history still require authentication and network access.

## Data model

Existing `session.exercises`, strength prescriptions, `setBlocks` and ordered `session.blocks` are retained. Non-Metcon blocks continue to reference canonical `exerciseIndexes`. Metcons stay inline in `block.metcon`, with name, score type, shared rep scheme, ordered movements, optional rounds/duration/work/rest/time cap and notes. `Chipper` and `Intervals` are additional score types. For Time/Chipper score completion time; AMRAP/Rounds + Reps score rounds and additional reps; EMOM/Intervals score completion and successful minutes/intervals; capped results retain completion or rounds/reps; load events preserve load/unit and optional time/reps.

Optional movement `scalingOptions` hold coach-suggested alternatives. `blockResults[].metcon` is the original immutable prescribed snapshot; `blockResults[].score.performedMovements` is an ordered actual snapshot with exercise ID or custom movement name, optional reps/rep scheme/load/distance/calories/notes. Division supports RX, Scaled and Modified. The server rejects changed movements marked RX. History shows Programmed and Performed. Analytics compare matching programmed structure, division, performed structure and event load; legacy scaled scores still use exact scaling notes. The new Single Unders library entry is added once, without resetting the library or restoring later intentional deletions.

Cardio prescriptions use `trackingType`, `intervalCount` (default 1), `restSeconds` (default 0) and modality-specific `metrics`, with notes/progression instructions. Example:

```json
{
  "exerciseId": "rowerg",
  "trackingType": "erg",
  "intervalCount": 6,
  "restSeconds": 90,
  "metrics": { "distance": 250, "distanceUnit": "m", "paceSeconds": 102 }
}
```

Each performed interval is stored in the existing actual `sets` array as a measurement row, not as strength reps/load. Row/Ski pace uses seconds per 500m internally and M:SS in the UI; running uses the selected distance unit; swimming uses 100m/100yd. Cycling calculates mph and retains watts/cadence. Cardio RPE is optional. Paired distance/time calculates UI pace/speed and fills missing calculated values on save. Existing explicitly logged measurements are preserved. Comparable cardio analytics include effort count, resistance/interval context and prescribed recovery; a continuous 1000m row is not compared with four recovered 250m sprints. Strength volume remains excluded from cardio metrics.

## AI compatibility and approval

`shared/ai/conditioning-contract.mjs` adds v2 without replacing the v1 contract. Exercise schemas are a strictly validated union of existing strength targets or typed cardio targets. Sessions include ordered blocks and may be Metcon-only. Irrelevant provider metric fields are nullable and removed at conversion. General `anyOf` validation checks complete branches rather than assuming nullable reference objects. Library/profile matching, target bounds and block coverage are checked before approval. Cardio expressed as strength reps is rejected; ambiguous legacy rows are preserved for coach review rather than guessing that reps mean meters.

OpenAI and Gemini use the shared v2 schema and instructions. Existing test providers and v1 drafts remain supported. Coach review renders appropriate cardio/Metcon editors. Every edit invalidates approval; saving requires an exact approved revision and creates a new program. Assignment remains explicit. Live provider calls were not made during these checks.

## Files changed

- UI: `src/main.jsx`, `src/AssignedWorkout.jsx`, `src/PrescriptionEditor.jsx`, `src/CardioMetrics.jsx`, `src/WorkoutBlocks.jsx`, `src/WorkoutTracker.jsx`, `src/ConditioningProgress.jsx`, `src/AIDraftReview.jsx`, `src/ServerConnection.jsx`, `src/styles.css`, `src/local-demo.mjs`.
- Shared data/validation: `shared/cardio-prescriptions.mjs` (new), `shared/workout-outbox.mjs` (new), `shared/workout-blocks.mjs`, `shared/prescriptions.mjs`, `shared/journal-measurements.mjs`, `shared/cardio-stats.mjs`, `shared/metcon-stats.mjs`, `shared/conditioning-library.mjs`.
- AI contract/conversion: `shared/ai/conditioning-contract.mjs` (new), `shared/ai/validate.mjs`, `shared/ai/convert.mjs`, `server/ai/openai.mjs`, `server/ai/generation.mjs`.
- Backend: `server/workout-receipts.mjs` (new), `server/index.mjs`, `server/store.mjs`.
- Tests: `tests/conditioning-v2.test.mjs` (new), `tests/tracker-api.test.mjs`, `tests/blocks-api.test.mjs`, `tests/ai-generation.test.mjs`, `tests/gemini-provider.test.mjs`, `tests/ui/conditioning.browser.mjs`.
- Android: `android/app/build.gradle` versionCode 6/versionName 1.5, plus generated Capacitor assets from the existing build script.
- Documentation: this report and `ANDROID-RELEASE.md`.

## Validation

- Full automated suite: **116/116 passed** (18 new regression tests; prior 98 remain passing).
- Browser suite: **4/4 passed**, including desktop 1440px, mobile 390px, exercise selector, mixed builder, assigned RowErg intervals, substitution, a save accepted by the server with its response lost, retry after reload without duplicate records, and reopened history.
- Production Vite web build: **passed**.
- Existing strength validation/logging, legacy drafts, percentages, RPE/RIR, setBlocks, assignment/history, analytics and deletion/redo checks passed.
- Android Gradle build: **passed**. APK Signature Scheme v2 verification: **passed**. Credential scan: **passed (447 entries)**, with no configured provider keys, environment files or server provider implementations found. Package remains `com.ironheartstrength.app`, versionCode 6/versionName 1.5-preview.
- Installable APK: `C:\Users\austi\OneDrive\Documents\ChatGPT\fitness app\output\apk\Iron-Heart-Strength-1.5-preview.apk`.
- No physical Android device or hosted Render deployment was exercised by this test run.

## Remaining operational steps

Deploy the current backend and web code together, confirm a persistent database disk, and install the rebuilt APK over the existing app. Sign in to the same hosted account/connection to see shared history. Supabase, permanent native sign-in, full offline sync, and Play Store distribution remain separate work; no insecure fallback or automatic transfer of phone-only history was introduced.
