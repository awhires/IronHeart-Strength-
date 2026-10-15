# Calendar, progression and timed prescriptions

## Scope and compatibility

This pass changes calendar composition, coach progression eligibility and measurement handling only. It does not change NSCA calculations, Progress graph behavior, storage schema, authentication, hosting, Android packaging or AI generation. No deployment or environment-variable changes are introduced by this pass. A future hosted release must include the shared server validation/progression changes as well as the frontend.

## Findings and implementation

- Calendar previously built its events solely from assignment plans. `shared/calendar-events.mjs` combines those events with actual logs. Athlete + assignment + week + session is the match key, never the title. Linked completion replaces the scheduled card and uses the actual workout date (falling back to the existing local created-at conversion); a different scheduled date remains visible. Journal/orphaned logs remain visible and open the existing history dialog. Deleting a log restores the scheduled event. Athlete filtering is applied to both sources. Home statistics are unchanged.
- Mobile athlete calendar now uses compact day rows instead of seven tall horizontally scrolling columns. Coach scheduling keeps its existing grid. The existing Training → Calendar route remains, and the no-program Training state also exposes Calendar so journal-only athletes can access it.
- `supportsLoadProgression` rejected explicit `trackingType: strength` and every `setBlocks` prescription. Modern manual/grouped prescriptions therefore lost controls that legacy Foundations rows could use. The existing generator now recognizes explicit strength. A separate coach eligibility check accepts compatible grouped fixed-pound/RPE rows; repetition increases each row independently without flattening reps or sets. Dynamic-effort waves remain unavailable for grouped rows because they replace the set/rep scheme. Automatic history recommendations and generic periodization still hold grouped rows. Percentage, athlete-selected, non-strength and incompatible rows retain their targets with an explanation. Existing 0–5% coach increase limits remain unchanged.
- Forearm Plank had a strength-shaped legacy template whose reps meant controlled breaths. It was already timed in part of the journal, while assigned logging and the prescription editor incorrectly sent all non-strength profiles through cardio intervals. A read-only movement adapter and reusable movement metrics component now separate holds/carries from cardio and strength. Assigned holds require the prescribed number of actual duration sets. Static hold recognition is conservative and exact; shoulder taps, up-downs, side bends and leg raises remain rep-based. The library profile editor uses the resolved measurement profile.
- Legacy breath/repetition values are never guessed as seconds. Displays identify missing duration and preserve old counts; a coach can explicitly enter duration in the editor. Stored legacy program/history objects are not migrated. Older clients can still submit legacy rep/breath records against a legacy target; new clients log timed actuals. New explicit timed targets require positive durations. Existing logs keep their original snapshots.

## Adaptive prescriptions: architecture recommendation (not implemented)

### Already available

- `shared/prescriptions.mjs`: validated exercise-specific reference maxima with date/source/unit, percentage load calculation, rounding, suggested load display and editable initial actual load.
- `shared/strength-progress.mjs`: unchanged NSCA chart estimates for 1/3/5/10RM, actual performances, log/set provenance, warmup/completion filters and effort qualification. Actual records and estimates are distinct. Monthly graph maxima are presentation data, not automatically a current training baseline.
- `server/progression.mjs` and `src/ProgressionGenerator.jsx`: coach-authored week-one targets, per-exercise saved progression rules, review/apply generated weeks, manual overrides, conservative readiness/pain/RPE recommendations. Pain requests review; low readiness/high effort can suggest reduction. Recommendations do not silently apply themselves.
- Assigned and journal logs preserve actual performance separately from targets; saved receipts and the workout outbox support deduplication and retry. Goals are separate aspirational targets, not evidence of capacity.
- `shared/cardio-stats.mjs`: unit conversion, repeated distance/duration comparisons, interval/incline context, performance trends and benchmarks.

### Missing / gaps

- Current recommendation endpoint excludes tracker history, and compares assigned exercises mostly by exercise ID/fixed load. It is not yet a general athlete baseline resolver.
- No dedicated assessment-result model/workflow was found. Do not force a new assessment when adequate logged data exists.
- No unified freshness/confidence policy, baseline priority, coach min/max progression-range contract, prescription revisions or approved recommendation audit record exists. Existing weekly accessory increases cap at 5%; a proposed 5–10% range would require an explicit, separate guardrail change.
- Readiness, pain and effort are available in some logs; soreness and compliance are not consistently normalized inputs. Missing signals must remain unknown, not be treated as positive readiness.

### Safest extension

1. Add a pure, deterministic baseline resolver over existing assigned **and** journal logs. Match athlete, exercise/variant, units, set context and recency. Prefer an explicit valid coach reference, then recent qualifying actual/estimated history; preserve source IDs, dates, estimation method and confidence. Never use goals as baselines. Return “baseline needed” when insufficient. Optional week-one/assessment inputs can join the same resolver later.
2. Add a pure prescription projection over the existing target and baseline. Reuse percentage rounding and NSCA calculations unchanged. RPE alone must not be converted into a fabricated exact weight. Cardio recommendations require comparable modality, distance/duration and interval/incline context; preserve pace units.
3. Keep a recommendation separate from the template, assignment and historical target snapshot. Suggested shape: `version`, athlete/session/exercise identity, target revision, rule revision, baseline references, recommended value/unit, reason, confidence, status, timestamps. Resolve under the authenticated athlete/coach boundary on the server; the phone consumes suggestions without provider keys.
4. Extend saved coach rules explicitly: enabled metrics, allowed increment/range, rounding, upper/lower bounds, recovery constraints and review policy. Unknown or incompatible rules hold. Initially every changed assigned target requires coach review/approval; approval checks the target/rule revision to prevent applying stale suggestions.
5. After an acknowledged workout save, recompute a **proposal** for future work using actuals and available recovery data. Retry receipts must not generate duplicate proposals. Athlete overrides update actual performance only; they do not rewrite the approved target or earlier logs.
6. Add focused baseline, provenance, stale-approval, ownership and replay tests before any recommendation endpoint/UI rollout. Begin with fixed/percentage strength, then compatible grouped rows, then cardio. Add persistent proposal/approval records only when that stage is approved, through an additive migration with backup/recovery planning.

No autonomous AI system, new recommendation storage, schema migration or assessment workflow was implemented in this pass.

## Files for this pass

- `shared/calendar-events.mjs` — combined calendar projection.
- `shared/movement-prescriptions.mjs` — non-mutating hold/carry adapter.
- `shared/tracking.mjs` — exact static measurement recognition and legacy count labels.
- `shared/prescriptions.mjs` — duration display, validation and assigned actual recording.
- `server/progression.mjs` — explicit strength and grouped coach generation.
- `server/seed.mjs` — explicit Forearm Plank library profile and duration cues for fresh data; existing stored records are not rewritten.
- `src/MovementMetrics.jsx` — shared duration/load/distance inputs.
- `src/PrescriptionEditor.jsx`, `src/AssignedWorkout.jsx` — dedicated movement controls.
- `src/ProgressionGenerator.jsx` — eligible controls, explanations and grouped preview.
- `src/main.jsx`, `src/AthletePrograms.jsx`, `src/iron-heart-mobile.css` — calendar integration, history/profile display and compact layout.
- `tests/focused-prescriptions.test.mjs`, `tests/ui/focused-prescriptions.browser.mjs` — regression coverage.

Validation output is in `output/qa/focused-regression.txt`, `output/qa/focused-browser-full.txt` and `output/qa/focused-build.txt`. The mobile calendar screenshot is `output/qa/focused-athlete-calendar.png`.

Final results: **178/178 automated tests**, **28/28 browser test entries**, zero failures/skips; production Vite build passed (1,643 modules). Eight new automated tests and three focused browser scenarios (plus their parent test entry) cover identity/date merging, ownership, legacy preservation, grouped progression, hold classification, validation and save/reload. The complete existing suites also verify cardio structures, grouped logging, runtime recovery, Goals & Progress and mobile navigation clearance. No physical-device build or test was performed.

Browser regression also exposed that a new strength session previously defaulted to the first alphabetical library item, which can be a hold. New strength sessions now select a strength-profile exercise by default; adding a hold explicitly uses the duration editor. This preserves the existing fast strength-creation workflow.

No GitHub push, Render deployment or APK packaging was performed.
