# Rolling strength and automatic athlete prescriptions

Local implementation following physical 1.10 testing. No APK, GitHub push, or Render deployment.

## Diagnosis

The reproducible 1.10 failures were in rule resolution and baseline selection, not the existing SQLite save mechanism:

- Recommendation generation required per-exercise `adaptiveProgression`. Existing `progressionOptions.rules` repetition/adaptive controls were not resolved by the athlete recommendation path. Generating another plan was effectively a hidden opt-in.
- Candidates were sorted by newest date and selected with `find`: the first qualifying set could beat a stronger later set, and a newer weaker session could replace stronger evidence.
- Unknown-effort multi-rep sets could not establish an NSCA maximum for a different rep prescription.
- The weekly step depended only on seven elapsed calendar days, not completed assignment-week identity. A late Week 1 save could fail that check.
- The resolver used 90 days. Progress independently selected monthly bests, so a new month's weaker single could lower its displayed estimate.
- `/api/data` did not return athlete recommendations; the workout dialog computed them independently.

These paths are reproduced in regression tests, including an authenticated fresh athlete. No production database or original failing phone program was downloaded, so this does not claim forensic confirmation of that particular saved record.

## Corrected data flow

Actual sets -> existing validated/idempotent log save -> SQLite JSON log -> `/api/data` -> shared rolling strength profile -> assignment's explicit coach rule -> separate `assignment.recommendations["week:session"]` overlay -> Android/web AssignedWorkout load prefill.

The API derives overlays on refresh. Local phone preview uses the same projection. The dialog consumes the API overlay and retains a fallback for legacy/local responses. Saves snapshot recommendations separately from the original target. Athlete overrides are actual results; master plans and old history are not rewritten.

Rules support existing explicit repetition increases, adaptive ranges, and explicit generic percentage options. Hold, max-effort and speed selections remain authoritative; no settings are inferred from free-text instructions. Unconfigured programs remain coach-directed. Assignment snapshots remain independent of later template edits.

## Rolling evidence and NSCA

`athleteStrengthProfile` and `strengthProgress` share evidence collection and `activeStrengthEvidence`. Exact athlete and exercise IDs are required. The active window includes today and evidence up to 56 days old; future evidence is excluded. All valid actual history remains available.

Qualifying sets have positive external load, a supported NSCA rep count, a valid weight unit, and completed non-warmup status. Known effort must be RPE 8–10 or RIR 0–2; unknown effort is allowed but marked lower certainty. Pain/low readiness and explicitly tagged deload, recovery, technique or speed phases do not establish estimates. Cardio and complexes are excluded. Latest pain/low readiness can withhold a recommendation even when a historical estimate remains valid.

Evidence is ranked by strongest NSCA-derived 1RM, with recency only breaking ties. Thus 155x8 beats 135x8, 165x8 supersedes 155x8, and a newer 205x1 cannot erase an active 205x5 estimate. When the strongest evidence expires, the active estimate may decrease or become unavailable; no history is deleted.

NSCA percentages and calculation formulas are unchanged. Different-rep recommendations retain the existing conservative 90% of estimated rep-max working-load factor. Percentage targets use the selected maximum directly. Rounding and coach bounds remain in force. A narrow exact percentage may hold a load when no available plate increment fits its bounds. Only one unperformed weekly step is applied; future weeks are not compounded as though completed.

Assessment workout results, existing journal/assignment history and ordinary Week 1 sets use the same pipeline. A newly assigned compatible program can immediately reuse existing evidence. Typed, dated reference maxima remain separate provenance (`tested`, `estimated`, `coach_entered`); a training single is never automatically labelled a tested maximum. References are supplied by the existing prescription, not a new global assessment registry.

Progress uses rolling evidence as of each historical month end and today for the current month. Current estimates expire independently of retained graph/history points. Actual performed records stay distinct. Five-month centering, rep-max selectors, goals, and dynamic axis remain intact.

## Open-ended reps

Additive optional `repMode: "fixed" | "max"`. Legacy missing mode means fixed. Intentional max reps requires `repMode: "max", reps: null`; missing fixed reps remains an error. Grouped rows can independently carry the mode. No database migration is required.

The existing manual editor, AI v1/v2 contract/review/conversion, scan extraction/review, assignment, display, and logging use this representation. Provider prompts explicitly request the mode. Max-rep targets retain the coach load rather than inventing a fixed target rep count for adaptive translation. Actual reps are always numeric: 14/12/10 are three independent results. The existing NSCA chart supports 12 and 10 but not 14; unsupported rep counts remain history without interpolation.

## Changed implementation files

- shared/strength-progress.mjs
- shared/adaptive-prescriptions.mjs
- shared/prescriptions.mjs
- shared/ai/contract.mjs
- shared/ai/validate.mjs
- shared/scan-workout.mjs
- server/index.mjs
- server/progression.mjs
- server/ai/openai.mjs
- src/local-demo.mjs
- src/AssignedWorkout.jsx
- src/PrescriptionEditor.jsx
- src/GroupedSetTable.jsx
- src/AIDraftReview.jsx
- src/StrengthProgress.jsx

Tests: tests/rolling-strength.test.mjs (new), tests/adaptive-prescriptions.test.mjs, tests/ui/phone-prescriptions.browser.mjs.

## Regression coverage

Ten new automated cases cover Week 1/2, strongest set, stronger follow-up, submaximal single, deload, 56-day expiration/future exclusion, new-program reuse, explicit max reps/AI validation, 14/12/10 actuals and scan conversion, identity/rule isolation, and distinct reference provenance. Existing low-effort expectations were updated to use qualifying shared evidence. A new mobile test creates and authenticates a fresh athlete, edits/saves a max-rep target, logs Week 1, verifies the Week 2 API overlay, and checks the recommended weight in the mobile dialog.

## Deployment and limitations

No new environment variables, SQL tables, migrations, or stored-history rewrites. A future matching backend deployment and frontend/APK release are needed to bring these changes to a physical phone; neither is performed here.

No live paid AI calls or physical Android tests were performed. Scan and AI support were verified through contracts/fixtures and existing review paths. Offline pending saves cannot affect hosted recommendations until successfully synchronized. Rules must exist in the assigned program; editing an unrelated master template does not silently rewrite an old assignment. Data refresh/reopening recalculates future recommendations; an already-open logging form retains its initial values to protect unsaved edits.

Profiles are derived on demand rather than persisted/cached. Very large athlete histories may warrant measured caching later. Explicitly typed reference maxima remain prescription-scoped. Unsupported NSCA rep counts are never extrapolated.

## Final verification

- Complete automated suite: 203 passed, zero failed.
- Complete browser/mobile suite: 34 passed, zero failed (including parent test entries); desktop and 360/390px mobile viewports.
- Production Vite build: passed, 1,645 modules. Non-failing warning: main JS bundle is approximately 511 KB before gzip.
- Changed-source whitespace check: passed.
- Logs: output/qa/rolling-regression.txt, output/qa/rolling-browser.txt, output/qa/rolling-web-build.txt.
