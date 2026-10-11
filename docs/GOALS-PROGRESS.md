# Goals & Progress

The athlete's actual logs remain the source of truth across assigned programs and independent journal workouts. Goals & Progress is reachable by both roles from navigation, and by athletes from Home, More and the bottom Progress tab. Existing volume, cardio and Metcon analytics remain available from this page and their existing sidebar entry.

## Files

- `shared/strength-progress.mjs`: versioned NSCA method, set eligibility, actual records, monthly estimates, axis and goal validation.
- `src/StrengthProgress.jsx`, `src/strength-progress.css`: exercise/athlete/year selection, 1/3/5/10RM graph, goals, actual records and source-workout links.
- `src/main.jsx`, `src/AthletePrograms.jsx`: navigation integration.
- `server/index.mjs`, `src/local-demo.mjs`: goal save/read permissions and storage; account deletion includes owned goals.
- `shared/exercise-library.mjs`, `server/store.mjs`: additive, duplicate-aware Zercher Squat library update.
- `tests/strength-progress.test.mjs`, `tests/strength-goals-api.test.mjs`, `tests/ui/strength-progress.browser.mjs`: calculations, storage, ownership, restart durability and desktop/mobile behavior.
- `tests/ui/athlete-experience.browser.mjs`: updated navigation assertions.

## Data and ownership

No SQL table/schema changes or rewrites of workout records. Goals use the existing `records` table with kind `strengthGoal` and athlete owner. Each version-1 goal contains athleteId, exact exerciseId, repMax, targetLb, comparison `estimated`, method `nsca-chart-v1`, and updatedAt. Its deterministic ID is the JSON tuple of athlete/exercise/rep-max, so updates replace the same goal rather than create duplicates. `POST /api/strength-goal` validates input and the athlete's existence. Athletes can read/write only their own goals; coaches use the application's existing single-workspace access to all athletes. This does not introduce multi-tenant coach ownership.

Phone preview uses an additive `strengthGoals` collection in existing local storage. Zercher Squat is inserted once using a new library metadata marker; existing matching IDs/names win. Existing goals prevent deletion of the referenced exercise. Existing athlete/account deletion removes athlete-owned goals, as it already does their other records.

## Estimates and provenance

Source: https://www.nsca.com/contentassets/61d813865e264c6e852cadfe247eae52/nsca_training_load_chart.pdf

The explicit chart uses reps 1,2,3,4,5,6,7,8,9,10,12 at 100,95,93,90,87,85,83,80,77,75,70 percent. Estimated 1RM = actual pound load / chart fraction for completed reps. The requested rep max = estimated 1RM × that target rep's fraction. For example, 185 × 5 remains actual 185 × 5; its estimated 1RM is approximately 212.6 lb. There is no AI call, interpolation, formula blending or RPE-based adjustment to percentages. A named/versioned method registry leaves room for independently identified Epley/Brzycki methods later; those formulas are not currently enabled.

Actual strength sets must have positive finite external load, a known lb/kg unit, and positive integer completed reps. Marked warmups, incomplete sets, complexes and nonstrength measurements are excluded. Estimates additionally require a chart-supported rep count. If effort was recorded it must be RPE 8–10 and/or RIR 0–2; missing effort remains eligible for historical compatibility, explicitly marked in source rows. This is a transparent eligibility policy, not an NSCA claim about RPE. Historical sets with no warmup/effort metadata cannot be reliably classified as maximal; estimates can understate capacity. Performed records remain available independently of estimated-set eligibility.

Monthly aggregation filters by athlete and exact exercise ID, without grouping names or movement families. Within each calendar month it chooses the highest unrounded estimated 1RM, using the later date on ties. That same set supplies all four rep-max values. Results retain method/source and actual log ID, exercise index, set index, date, load/unit/reps, and recorded effort. These are computed views of durable logs rather than duplicate snapshots that could become stale after a corrected/deleted workout. UI rounding is to one decimal; calculations remain unrounded.

Months are separated by year. Missing months have no invented data; connecting lines across gaps are dashed. The axis normally starts at 10 lb (0 for smaller values) and reaches the highest plotted estimate + 100 lb, extending further when required to display a goal. Each rep-max target is separate. Trends describe only the change between recorded monthly estimates, without prediction or claiming that an estimated goal was actually performed.

Loads are external recorded loads. Weighted pull-ups/dips remain separate IDs and do not invent body mass or total-system-load estimates. Metcon movement repetitions are not treated as maximum-strength sets. Legacy unit/date handling reuses the existing history conventions.

No production deployment, database migration/deletion, or APK rebuild is part of this change.

## Verification

- Full Node test suite: 147 passed, 0 failed (`output/qa/strength-all-tests.txt`).
- Existing browser coverage: enrollment, navigation, AI modality selection, scanned prescriptions, library selector, cardio, mixed blocks, substitutions and retry all passed. New Goals & Progress scenarios passed at 1440px and 390px, including refresh persistence, rep selection, actual/estimated separation, coach access and opening actual workout history. Nine browser scenarios total across the existing and new suites; final new-suite evidence: `output/qa/strength-browser-final.txt`.
- Production Vite build passed (1,628 modules).
- Mobile screenshot reviewed; chart scroll stays inside its panel and document width fits the viewport. Screenshots: `output/qa/strength-progress-390.png` and `output/qa/strength-progress-1440.png`.

Assumptions: unknown historical effort is allowed rather than requiring an assessment or losing legacy data; externally loaded bodyweight exercises use external load only. Goal editing is available to the athlete and existing workspace coaches. Monthly estimates are recomputed from saved history with traceable source references, not written into a second history table.
