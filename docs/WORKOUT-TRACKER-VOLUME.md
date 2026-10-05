# Workout Tracker, exercise volume and 5 lb defaults

This additive update keeps AI draft validation, coach approval, program assignment and planned workout logging in place. No database schema migration or rewriting of existing prescriptions is required.

## Default increments

Previously defaulting to 2.5, now 5 for pounds:

- `src/PrescriptionEditor.jsx`: the new-prescription factory now re-exports the shared factory in `shared/prescriptions.mjs`, which starts manual prescriptions at 5 lb.
- `shared/prescriptions.mjs`: missing-increment normalization and percentage-load rounding use 5 lb, or the unchanged 2.5 kg default. Explicit increments remain authoritative; normalization only returns copies.
- `src/ProgressionGenerator.jsx`: new generator settings begin with `roundTo: 5`. Existing saved generator settings are used as supplied.
- `server/progression.mjs`: generic and Westside generator defaults and the `periodize` fallback now use 5. An explicit generator rounding setting wins; otherwise a prescription's explicit increment is respected. Recommendation input is normalized so missing increments get the same default.
- `server/ai/openai.mjs`: shared OpenAI/Gemini generation instructions request 5 lb or 2.5 kg unless the coach specifies another increment. The contract still accepts explicit 2.5 increments.

Intentionally unchanged: explicit 2.5 values in existing records, AI practice fixtures, legacy seed templates, user-selectable rounding options, and the unrelated 2.5% progression rate. There is no bulk data update.

## Athlete tracker

Athlete navigation now includes **Workout Tracker**. Enter a name, keep today's default date or pick another date, search the library, add exercises and manually enter completed sets. Each set records reps, optional external load, lb/kg and optional RPE. Add notes, then save to **Workout history**, labeled **Journal workout**. Sets/exercises can be removed before saving; the existing log deletion flow handles mistakes after saving. V1 supports 1–15 exercises and 1–30 sets each. It does not infer or fabricate a plan.

`POST /api/tracker` is athlete-only. A shared validator is used by both the Node API and device-only adapter. Identity and ownership are assigned by the server/adapter, never accepted from the request. The stored record uses the existing `log` collection (SQLite JSON on the server, `logs` in phone storage):

```json
{
  "id": "application-generated-id",
  "athleteId": "authenticated-athlete",
  "source": "tracker",
  "sessionName": "Saturday strength",
  "workoutDate": "2026-10-03",
  "createdAt": "application-generated-timestamp",
  "notes": "Felt good",
  "exercises": [{
    "exerciseId": "bench",
    "exerciseName": "Barbell Bench Press",
    "sets": [{"reps": 5, "load": 200, "loadUnit": "lbs", "rpe": 7}]
  }]
}
```

There is no assignmentId, week, session index, prescribed target, fabricated readiness or pain value. Existing ownership filtering, history, deletion and account removal apply. Independent logs are deliberately excluded from assigned-program progression recommendations so that logging an unrelated workout does not change the existing coaching signal.

## Exercise Progress

Athletes and coaches have **Exercise Progress** in navigation. Coaches select an athlete; both roles select an exercise and display unit. The screen includes a today hero card, latest and previous session totals, percent change, best session, Monday-to-today total, a chart of the last 12 sessions and clickable session history.

Volume is `sum(actual reps × actual external load)` for all matching exercise entries in a workout. Units convert before summing; legacy sets without units use the target unit or pounds. Journal and assigned logs both count, filtered by athlete. Journal dates use workoutDate; older assigned logs use the local date of createdAt (the completion date, not an invented scheduled date).

Blank, missing, nonnumeric, negative or non-finite loads and invalid reps are excluded and counted as excluded sets. Zero external load contributes zero; body mass is never estimated. An exercise with no usable sets shows “—”, not a fabricated zero. Percent comparison is unavailable when the prior session is missing/invalid or zero. Volume is derived on read, not stored separately.

## Changed files

Added:
- `shared/workout-tracker.mjs`
- `shared/volume-stats.mjs`
- `src/WorkoutTracker.jsx`
- `src/ExerciseProgress.jsx`
- `src/workout-journal.css`
- `tests/tracker-volume.test.mjs`
- `tests/tracker-api.test.mjs`
- `docs/WORKOUT-TRACKER-VOLUME.md`

Updated:
- `shared/prescriptions.mjs`
- `src/PrescriptionEditor.jsx`
- `src/ProgressionGenerator.jsx`
- `server/progression.mjs`
- `server/ai/openai.mjs`
- `server/index.mjs`
- `src/local-demo.mjs`
- `src/main.jsx`
- `android/app/build.gradle` (version 1.2-preview, versionCode 3; same package/signing configuration)

Generated outputs include `dist`, Android bundled web assets, the preview APK, SHA256 file and the mobile preview screenshot.

## Verification

73 automated tests pass, including all 65 prior tests and 8 new tests. Coverage includes defaults, explicit legacy increments, kg rounding, manual sets, journal persistence and history, failed phone storage, API authorization/input validation, assigned workout coexistence, recommendation isolation, mixed-unit volume, excluded loads, trends and athlete isolation.

The production web build passes. Browser verification used an isolated device-preview origin, saved two bench sets of 5 × 200 lb, checked the journal history entry and verified 2,000 lb volume. A 390 px viewport showed no horizontal page overflow. Test workout data remains on that isolated preview origin and is not shipped in the APK or written to the normal coaching database.

Phone-preview web assets, Capacitor sync and Gradle assembleDebug all pass. The APK signature verifies, and the credential scan of all 447 APK entries found no configured API keys or provider implementations. Version is 1.2-preview (versionCode 3), package `com.ironheartstrength.app`, using the existing preview signing key. The APK is `output/apk/Iron-Heart-Strength-preview.apk`; SHA256 is in `output/apk/SHA256.txt`. Installation on a physical Android device was not performed. Live AI remains server-only.
