# Iron Heart mobile logging and progress update

Completed on the existing 1.7 codebase. No GitHub push, Render deployment, database migration, or new APK was performed.

## Data model and compatibility

Repeated cardio prescriptions now support ordered segments inside each repeated block:

```json
{
  "exerciseId": "rowerg",
  "trackingType": "erg",
  "intervalCount": 10,
  "intervals": [{
    "rounds": 5,
    "segments": [
      {"label": "Easy", "metrics": {"durationSeconds": 40, "paceSeconds": 120}},
      {"label": "Hard/Max", "metrics": {"durationSeconds": 20, "paceSeconds": 85}}
    ],
    "recovery": {"durationSeconds": 120}
  }]
}
```

Each segment has independent supported metrics: time, distance/unit, pace/unit, speed, incline, power, cadence, calories and RPE, according to the modality. Time remains seconds internally and M:SS in controls. The example produces ten work segments and four between-round recoveries; recovery is excluded from work duration.

Prescriptions stay in existing exercise/target JSON. Actual results stay in `sets`, separately from targets. Completed scans retain their structural description in `intervals` without inventing a target. The UI shows a compact repeated block with expandable actual rounds. Limits: 20 blocks, 30 rounds per block, 10 segments per round, 300 performed segments. Arbitrary recursive loops are not supported.

Grouped strength uses one exercise table with Sets, Reps, Weight, RPE, copy/remove and Add Row. Coach prescriptions reuse `setBlocks`; journal rows use existing `count` blocks and expand into actual `sets` on save. Assigned-workout rows also expand into sets. An explicit `actualSetGroups` submission flag permits changed performed set counts while preserving the original prescription. Existing limits remain: 12 prescribed strength sets and 30 actual sets per exercise. Volume and NSCA calculations continue using actual sets.

No SQLite schema migration or new environment variables are required. Legacy work/recovery intervals, strength sets/setBlocks, history, AI v1/v2 contracts, assignments, scheduling/enrollment, save receipts, retry queues, Metcon scaling/substitutions and Goals & Progress remain covered by passing regressions. No production data was changed.

The hosted backend will need a matching deployment when this update is released because validation and scanner behavior changed. Deployment and Android packaging remain pending as requested.

## Scanner and effort controls

Shared scan schema/instructions preserve independent segment targets, labels, rounds and recovery. Consecutive exact-matched strength movements merge into one exercise with multiple rows. Coach and athlete use the same interpretation service and reusable photo input.

Coach scans create an editable, unsaved prescription review. The coach confirms review, adds prescriptions to the session, then saves normally. Athlete scans require review confirmation before save. Neither path automatically saves or assigns a scan. Existing authentication, ownership, rate limiting and server-side provider credentials remain.

RPE stays active. Normal RIR controls are removed from new programming/logging, and live AI schema/validation rejects new RIR prescriptions. Historical RIR contracts and data remain supported.

## Visual changes

`src/iron-heart-mobile.css` provides near-black backgrounds, charcoal translucent panels, restrained blur, thin borders, white/gray typography, compact spacing and red actions/selections. Real Iron Heart logo assets are retained.

Updated surfaces: athlete Home (Today, summary, week, recent progress), persistent Home/Training/Log/Progress/More navigation, program/week cards, expandable tracker cards, grouped strength tables, repeated cardio blocks, exercise-library bottom sheet/modal, coach programming/scanning, AI Builder/review and Goals & Progress. The library selector supports keyboard focus, Escape/close and a blocking backdrop.

### Five-month strength graph

The graph displays two months before through two months after the current local calendar month. Current month is centered, highlighted and labeled CURRENT. Years are shown for clear boundaries: October 2026 gives Aug/Sep/Oct/Nov/Dec; January 2027 gives Nov 2026 through Mar 2027.

Only historical/current points in that window are plotted; future months stay empty. The goal reference line ends at the current month. Calendar state refreshes while open and on visibility changes. The 1RM/3RM/5RM/10RM selectors, NSCA percentages, actual-versus-estimated distinction and dynamic Y-axis function are unchanged. All monthly source history remains available below the graph, including months outside the plotted window.

## Tests and build

- Complete model/backend suite: **168 passed, 0 failed**. Includes 21 added test entries covering repeated segments, different targets, recovery, grouped rows, scan conversion, volume/NSCA compatibility, persistence/deduplication, role permissions, RIR restrictions and calendar windows.
- Complete browser suite: **18 passed, 0 failed** (14 scenarios plus four parent entries). Headless Edge at 360/390 px phone sizes and 1440 px desktop.
- Browser coverage includes prescribed/completed cardio scans, grouped actuals, coach review/save, library selection, navigation/enrollment, Metcon substitutions, pending-save retry, AI modality controls, goals, five-month centering and year boundaries. Scenarios assert no uncaught page errors.
- Clean screenshot reruns: compact workflows **6/6**, strength progress **3/3**.
- Production Vite build: **passed**, 1,637 modules; CSS 74.36 kB, JS 488.94 kB (147.83 kB gzip). Local validation uses same-origin API configuration; Android production configuration was not changed.
- Logs: `output/qa/mobile-phase-unit.txt`, `output/qa/mobile-phase-browser.txt`, `output/qa/mobile-phase-build.txt`, `output/qa/mobile-phase-new-browser.txt`, `output/qa/mobile-chart-screenshots.txt`.

## Screenshots

Screenshots use isolated test/demo data, not production athlete records.

- [Home](../output/qa/mobile-redesign/home.png)
- [Training](../output/qa/mobile-redesign/training.png)
- [Grouped strength](../output/qa/mobile-redesign/grouped-strength.png)
- [Assigned strength](../output/qa/mobile-redesign/assigned-strength.png)
- [Repeated cardio](../output/qa/mobile-redesign/cardio-summary.png)
- [Exercise library](../output/qa/mobile-redesign/library.png)
- [Five-month progress graph](../output/qa/mobile-redesign/progress-five-months.png)
- [Coach programming](../output/qa/mobile-redesign/coach-programming.png)
- [AI Builder](../output/qa/mobile-redesign/ai-builder.png)
- [More menu](../output/qa/mobile-redesign/more.png)

## Remaining verification and limits

Live OCR/provider calls were not made; structured scan fixtures exercised interpretation, review and saving. Real photo quality/provider adherence still needs a live scan check. Coach scan import of holds/complexes currently requests manual entry; existing athlete hold/complex workflows remain available. No native Android runtime or physical phone was tested, and no APK was built. Design screenshots are ready for review before packaging.

## Files changed

Source/test inventory compared with the published 1.7 checkout follows. This report is also new. Generated build assets and QA outputs are excluded from this inventory.

- Modified src/AIDraftReview.jsx
- Modified src/AIProgramBuilder.jsx
- Modified src/AssignedWorkout.jsx
- Modified src/AthletePrograms.jsx
- Modified src/CardioIntervals.jsx
- Modified src/CardioMetrics.jsx
- Added src/CardioStructureEditor.jsx
- Added src/CoachScanReview.jsx
- Modified src/ExercisePicker.jsx
- Added src/GroupedSetTable.jsx
- Added src/iron-heart-mobile.css
- Modified src/main.jsx
- Modified src/PrescriptionEditor.jsx
- Added src/ScanPhoto.jsx
- Modified src/StrengthProgress.jsx
- Modified src/WorkoutBlocks.jsx
- Modified src/WorkoutTracker.jsx
- Modified shared/ai/programming-options.mjs
- Modified shared/cardio-logging.mjs
- Modified shared/cardio-prescriptions.mjs
- Added shared/cardio-structure.mjs
- Added shared/grouped-sets.mjs
- Modified shared/journal-measurements.mjs
- Modified shared/prescriptions.mjs
- Modified shared/scan-workout.mjs
- Added shared/strength-chart-window.mjs
- Modified shared/tracking.mjs
- Modified server/ai/generation.mjs
- Modified server/ai/openai.mjs
- Modified server/ai/scan.mjs
- Modified server/index.mjs
- Added tests/compact-workouts.test.mjs
- Added tests/strength-chart-window.test.mjs
- Modified tests/tracker-api.test.mjs
- Modified tests/ui/athlete-experience.browser.mjs
- Modified tests/ui/cardio-scan.browser.mjs
- Added tests/ui/compact-mobile.browser.mjs
- Modified tests/ui/conditioning.browser.mjs
- Modified tests/ui/strength-progress.browser.mjs
