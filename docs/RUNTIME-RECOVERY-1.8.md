# Iron Heart 1.8 runtime fixes — local verification

## Reproduced failures

These failures were reproduced with isolated local fixtures in a 390px Edge viewport using the production web bundle. The user's actual production records and physical Android device were not accessed.

1. **Progression program switch:** `TypeError: Cannot read properties of undefined (reading 'name')`. The selected assignment changed immediately, while recommendations still belonged to the previous assignment. The renderer indexed the new assignment's sessions with an old recommendation's session/index. A strength assignment with two sessions followed by a one-session running assignment reproduced it. Uncancelled asynchronous responses could also arrive out of order. The chart additionally assumed that plan/session/exercise arrays were present.
2. **Repeat rounds:** `Error: Use 1–30 rounds per block.` Clearing the numeric field was coerced through `Number('')` into zero. The editor called `initialCardioActuals` inside a React state updater, which called `prescribedCardioIntervals` and strict `validateIntervalShape`. Its exception escaped during React's state processing and unmounted the app. Out-of-range or fractional intermediate values had the same failure path. Every valid keystroke also rebuilt the structure and reset the unsaved actuals.

The two failures have different immediate causes: stale asynchronous state versus prematurely validated editing state. Neither requires deleting or rewriting existing records.

## Fixes

- Recommendation responses are scoped to the selected assignment object and week. Effect cleanup ignores superseded responses. A read-only helper validates session, exercise index and exercise identity before rendering or allowing Apply. Weeks are resolved by their actual week number. Missing plan/first-exercise data no longer crashes the Progression chart.
- Shared `NumericInput` keeps the editable draft separate from numeric domain state. Blank required fields and invalid numbers remain editable and block form submission through native validity. Optional blanks retain null semantics. No non-finite value is emitted.
- Repeat rounds commits on blur or Enter, after integer/range validation. Whole interval structures are validated before publishing them or allocating actual rows. Invalid structure changes are reported inline. Re-focusing and leaving an unchanged round count does not reset actuals.
- The tracker calculates initial actuals before its state updater, so domain errors can be handled at the input boundary.
- The shared component covers grouped sets/reps/load/RPE, prescription fields, tracker metrics, cardio distance/speed/incline/power/cadence and progression inputs.
- `TimeInput` retains the in-progress M:SS text while focused rather than replacing each valid prefix with formatted output. Parsing/calculations are unchanged.
- Older progression-generator options receive a default rules object and hold mode when absent.

## Numeric audit

Assigned grouped sets previously discarded invalid intermediate counts in a catch handler, making blank-and-retype awkward. Cardio/complex count handlers also eagerly coerced blanks to zero. Several metric fields already handled optional blanks, but shared finite/range validation now keeps invalid drafts out of calculations. Time fields reformatted valid prefixes during typing. These were addressed without reintroducing RIR or changing prescription meaning, NSCA calculations, graph behavior, or grouped-set expansion.

## Recovery behavior

An app-level React error boundary displays a recovery panel for unexpected render/lifecycle/state-update errors. Return to Home remounts the app and reloads authenticated data. Reload app is also available. Neither action clears storage, the workout outbox, database records or saved history. Unsaved component edits can be lost, and the panel says so. The console records the exception and component stack without explicitly logging records or credentials.

The boundary does not prevent native WebView/process failures or catch arbitrary asynchronous/event-handler exceptions. Expected input validation is handled at the relevant input boundary rather than relying on this fallback.

## Files

- `src/main.jsx`: scoped recommendation lifecycle, safe view access, root boundary.
- `shared/progression-view.mjs`: read-only legacy-compatible view helpers.
- `src/AppErrorBoundary.jsx`: recoverable render fallback.
- `src/NumericInput.jsx`: shared draft/validated-number separation.
- `src/CardioStructureEditor.jsx`: validated structural editing.
- `src/WorkoutTracker.jsx`: prevalidated actual-row rebuild and numeric fields.
- `src/CardioMetrics.jsx`, `src/GroupedSetTable.jsx`, `src/PrescriptionEditor.jsx`, `src/ProgressionGenerator.jsx`: shared input usage.
- `src/TimeInput.jsx`: stable M:SS drafts during typing.
- `tests/progression-view.test.mjs`: legacy and stale-index helper coverage.
- `tests/ui/runtime-recovery.browser.mjs`: program switches, delayed responses, numeric editing, nested save/reload and recovery.
- `tests/ui/athlete-experience.browser.mjs`: fixes the browser clock to match the existing October 5 fixture, avoiding a time-dependent “This Week” assertion.

## Verification results

- Complete Node regression suite: **170 passed, 0 failed** (`output/qa/runtime-regression.txt`). Includes legacy 1.7 history, goals, grouped-set and nested cardio persistence.
- Complete browser suite: **24 passed, 0 failed**, including desktop, 390px and 360px layouts (`output/qa/runtime-browser-all.txt`). The final run uses `--test-concurrency=1` after a parallel run encountered a local `ECONNRESET` during test setup.
- Production web build: **passed**, 1,640 modules. CSS artifact is unchanged (`index-CXEjIUHU.css`); JavaScript is `index-BY_7mHAS.js` (`output/qa/runtime-build.txt`). Test build uses same-origin local API configuration.
- Original failure traces: `output/qa/runtime-before.txt`.
- No physical-device verification was performed; a future APK is needed to test these fixes on the phone.

## Deployment implications

No server handler, database schema, data migration or environment-variable changes. The new shared helper is imported only by the frontend. The Android fixes require a newly built APK after approval. The hosted browser UI requires a later deployment to serve the updated frontend; these fixes do not require a backend API change for the native app.

No push, Render deployment, Capacitor sync, APK packaging or production data mutation was performed. Existing saved history, local pending saves and prescription semantics remain intact. Editing a cardio prescription still resets that exercise's unsaved actuals as the existing UI states; temporary numeric drafts no longer trigger that reset.
