# Conditioning and mixed workout blocks — Android 1.4 preview

## Data and compatibility

No SQL table migration or replacement of user data is required. The existing JSON records in SQLite and the phone's existing local-storage key remain in use. Strength prescriptions, `setBlocks`, AI draft contracts and assignment copying retain their original formats.

Sessions may now contain an ordered `blocks` array. Strength, Hypertrophy, Cardio, Accessory and Mobility / Recovery blocks reference the canonical `session.exercises` array with `exerciseIndexes`. Metcon blocks contain a `metcon` definition directly. Each exercise belongs to exactly one block. Sessions without blocks render as legacy strength sessions. An all-Metcon session may have an empty exercises array. No duplicate strength prescriptions are stored inside blocks.

Example:

```json
{
  "name": "Mixed day",
  "day": 1,
  "exercises": ["existing squat prescription", "existing accessory prescription"],
  "blocks": [
    {"id":"a","type":"Strength","exerciseIndexes":[0]},
    {"id":"b","type":"Metcon","metcon":{"name":"Custom benchmark","scoreType":"Rounds for Time","rounds":3,"repScheme":[],"movements":[{"exerciseId":"rowerg","exerciseName":"RowErg","distance":200,"distanceUnit":"m"}],"notes":""}},
    {"id":"c","type":"Accessory","exerciseIndexes":[1]}
  ]
}
```

The example's exercise strings are placeholders for normal prescription objects.

Cardio prescriptions add `trackingType` and `metrics`. Duration and pace remain numeric seconds; the shared time input and formatter display M:SS. Distance retains its unit; erg pace is per 500 m, swim pace per 100 m/yd, running pace per selected distance unit. Existing raw-second logs require no rewrite.

## Metcons and scores

Definitions store a name, scoring type, shared rep scheme, ordered movements, optional rounds, duration, time cap, work/rest intervals and notes. Movements reference the existing exercise library and may include reps, distance/unit, calories, load/unit, EMOM minute and notes. Shared rep schemes appear once.

Logging presents fields for the selected score type: completion time, rounds plus additional reps, completion and successful minutes, or load with optional reps/time. Capped workouts can record incomplete rounds/reps. RX/scaled is explicit; scaling requires descriptive notes. Actual load can be retained alongside time. Blank values never become a fabricated score.

Logs add `blockResults`, each containing `blockId`, an immutable Metcon definition snapshot and a validated score. Editing a program or assignment cannot rewrite these snapshots. Journal logs can contain normal exercise entries plus Metcon results; exercise entries may carry a block-type label.

Metcon comparison keys use structure, movement order, targets, normalized loads/distances, rep scheme, intervals, duration/cap and instructions. Names alone never establish comparability. RX/scaled, scaling notes and actual loads are separated. AMRAP scores rank lexicographically by rounds then reps. For-Time scores rank by lower completion time; EMOM by successful minutes; load events by higher normalized load. Incomplete time-cap results remain in history without being treated as completed time PBs.

## Cardio analytics

Exercise Progress switches from strength volume to cardio metrics for cardio profiles. It reads existing assigned/journal logs without changing them. It shows session count, distance/duration totals, latest and average comparable performance, PBs by distance, distance PBs at fixed duration, changes against previous/baseline, history and session/week/month charts. Cycling retains power/cadence; stairs support steps/floors per minute. Missing metrics remain unavailable rather than inferred.

Distance comparisons use a 0.5% tolerance (minimum 0.1 m); fixed durations use one second. Exercise identity, interval structure, incline and level remain separate contexts. A one-mile run is not ranked against a five-mile run. Paired distance/time determines normalized speed; supplied pace/speed can be used when totals are unavailable. Complete totals are required before dividing total distance by total duration. Improving/declining uses a 1% band against the first comparable performance and is descriptive, not a physiological assessment. More duration alone does not imply improvement.

## Files changed

- New shared modules: `shared/time.mjs`, `shared/cardio-stats.mjs`, `shared/workout-blocks.mjs`, `shared/metcon-stats.mjs`, `shared/conditioning-library.mjs`.
- Updated shared modules: `shared/tracking.mjs`, `shared/journal-measurements.mjs`, `shared/workout-tracker.mjs`, `shared/prescriptions.mjs`.
- New UI: `src/TimeInput.jsx`, `src/CardioMetrics.jsx`, `src/ExercisePicker.jsx`, `src/WorkoutBlocks.jsx`, `src/AssignedWorkout.jsx`, `src/ConditioningProgress.jsx`.
- Updated UI: `src/PrescriptionEditor.jsx`, `src/WorkoutTracker.jsx`, `src/ExerciseProgress.jsx`, `src/main.jsx`.
- Persistence/integration: `src/local-demo.mjs`, `server/index.mjs`, `server/store.mjs`, `server/progression.mjs`.
- Android version: `android/app/build.gradle`; generated Capacitor web assets refreshed by the preview build.
- Tests: `tests/conditioning.test.mjs`, `tests/blocks-api.test.mjs`, `tests/ui/conditioning.browser.mjs`.

The existing library picker is shared by prescription editing, the journal and Metcon movements. The broken button referenced `newPrescription` without importing it; that import is fixed. A one-time catalog addition supplies common conditioning movements without replacing custom exercises or existing history.

## Verification

`node --test tests/*.test.mjs`: 98 tests pass, including the original 82 regression tests. `node --test tests/ui/conditioning.browser.mjs` passes at 1440 px and 390 px (three test-runner results including the parent). The UI test uses Playwright; set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE when using the bundled runtime. It verifies picker opening, category filtering, selection, M:SS conversion and mixed-block persistence.

`pnpm build` succeeds. The Android build uses `scripts/build-preview-apk.ps1`, the existing signing key and package `com.ironheartstrength.app`, version code 5 / 1.4-preview. Install over the previous preview to retain phone data; do not uninstall first. Local phone data still does not automatically synchronize with hosted data. AI provider keys remain server-only. Physical-device installation is a separate user check.
