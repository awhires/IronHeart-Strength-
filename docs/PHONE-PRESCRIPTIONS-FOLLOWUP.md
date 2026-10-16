# Focused phone prescriptions and AI follow-up

This is a local implementation pass after 1.9-preview. No APK, GitHub push, Render deployment, production data edit, or database migration was performed.

## Findings and fixes

### Progression controls

The old `supportsCoachProgression` reused the automatic performance evaluator's fixed-pound **and RPE** eligibility. Strength Foundations supplied those fields. Normal accessories with `effortMode:none`, AI `athlete_selected` loads, and percentage prescriptions did not, so the native select was disabled on both desktop and Android. Grouped rows inherited the same restriction. This was not a z-index or touch issue in the reproduced states.

Coach configuration now accepts compatible external-load strength prescriptions independently of RPE. Fixed-pound repetition increases support 0–10%; percentage, athlete-selected and kilogram targets can use the new athlete-specific rule. Dynamic waves still require a single fixed-pound prescription. Bodyweight, static holds and cardio explain why they are not eligible. Existing automatic coach-review recommendations and legacy periodization retain their stricter performance requirements. No program-source special cases were added.

The user identified the six-week failure as occurring in **AI Draft Review**, before saving. The original phone draft/error and failing saved program were not available, so its exact historical cause cannot be proven. Regression fixtures mirror the reported states rather than claiming access to the physical phone data.

### Athlete-specific prescriptions

The optional exercise metadata is:

```json
{"adaptiveProgression":{"version":1,"enabled":true,"minPercent":5,"maxPercent":10}}
```

Choose **Generate following weeks → Athlete-specific · coach range**, review/apply, save, and assign. Existing assignments remain unchanged; coach template edits do not silently replace an athlete's current assignment. Grouped prescriptions retain each row and share the chosen rule. Single-week programs can also apply the rule.

`shared/adaptive-prescriptions.mjs` is a deterministic, pure projection reused by athlete logging, server save snapshots and the local preview. It does not mutate plans or use an AI call. Opening a workout prefills recommended actual loads and shows their baseline/provenance; athletes can change them. After saving, the next opened workout recalculates from refreshed history. Original `target`, actual `sets`, and server-computed `recommendations` remain separate. Saved recommendations are computed at receipt creation; an offline retry can therefore have a newer baseline than the one visible when the athlete initially opened the form. Actuals are never rewritten to match that recomputation.

Baseline sources:

- Dated, matching tested / coach-entered / estimated reference 1RM.
- Actual logged singles, 3RM/5RM and other NSCA-supported rep counts from assigned workouts or ad-hoc journal workouts, including assessment-named sessions and Week 1 when available.
- Recent comparable working sets for fixed/athlete-selected targets, even when those sets were too easy to infer a maximum.
- There is no new assessment workflow; assessment results use the existing reference-maximum editor or actual workout log.

Only the same athlete and exact exercise ID are used. Data must be within 90 days, on/before today and the scheduled workout date. Future data, warm-ups, incomplete sets, complexes, invalid loads/units and other athletes are excluded. A rep-max estimate requires a supported NSCA rep count and a single, RPE at least 8, or RIR at most 2; known easy sets do not become maxima. NSCA calculations and Progress graphs are unchanged.

Calculation:

- Percentage target: baseline 1RM × coach percentage.
- Other load targets: use recent matching-rep actual load; if only a maximum is available, use 90% of its NSCA target-rep estimate.
- A workout at least seven days after the selected baseline can take **one** weekly step. The minimum coach percentage is used normally; the maximum requires two separate comparable sessions meeting reps/load/effort with readiness at least 4. No compounding through unperformed weeks.
- Round conservatively to the existing increment. Use a valid increment within the range when possible; hold rather than exceed the maximum when rounding cannot satisfy the range. Unsupported/out-of-range loads produce an explanation, not an invented number.
- Recent pain, readiness at most 2, near-maximal effort, or explicit deload/speed/max-effort phases require coach review. Without a usable baseline, keep the original target and request a baseline.

Cardio personalization is deferred. Its future resolver can use the same separate recommendation/provenance structure with comparable cardio benchmarks, without changing actual logs.

### AI review and multiweek generation

Open questions, missing (not invalid) reference maxima, equipment preferences and other programming advisories remain visible and require explicit warning acknowledgement. That acknowledgement is now checked again by the authenticated save service and preserved as accepted warning codes in program provenance. Edits invalidate approval. Missing weeks, invalid reference objects, unknown exercise IDs, corrupt fields, contradictory loads and invalid modality metrics remain blockers.

Generation now recognizes explicit numeric/spelled block lengths from the prompt (not training-day counts), supports one-week drafts, and attempts one bounded complete regeneration when a structurally valid response omits weeks. It does not invent or clone missing AI weeks. Unresolved movement IDs can remain in every generated week for review. A second incomplete response remains reviewable, with the exact received/requested week count, a clear completion error and a regenerate action. Specific unmatched exercise names, weeks and sessions are reported. Truncation, timeout and network failures are explicit; no partial program is saved.

A live test exposed a **strict schema/validator conflict**: non-null `paceUnit` was required for every cardio exercise, while the existing validator correctly allowed that field only for running. RowErg could therefore fail approval even with the correct library ID. The v2 field now permits null, instructions explicitly require null outside running, and the existing adapter drops null optional fields before the unchanged cardio validator. Wrong non-null rowing pace units still fail. This is a reproduced blocker relevant to mixed Jiu-Jitsu conditioning; it is not proof that it caused the original phone's Week-1-only draft.

## Model integration

Official model documentation confirms `gpt-6.1-sol`, Responses, structured output, and low reasoning effort: https://developers.openai.com/api/docs/models/gpt-6.1-sol

The provider keeps strict JSON Schema, `store:false`, application validation, server-only credentials and coach approval. It uses `reasoning.effort=low` for this exact model. No fallback to another model is silently attempted. `OPENAI_PROGRAM_MODEL` selects the program model separately; legacy `OPENAI_MODEL` is preserved for rollback and scanning. Logs contain provider/model, duration, attempt count, safe error codes and numeric input/output/total token usage, never prompts, athlete records, credentials or provider error bodies. Existing optional development-only debug remains separate and is disabled in production.

Live verification uses synthetic requests, not athlete private data. Initial seed-only test context omitted installed cardio library entries; those drafts correctly retained unresolved IDs and complete weeks. Full-library retesting found and fixed the pace-unit conflict. See the verification results below for final outcomes.

## Files

- `shared/adaptive-rules.mjs`, `shared/adaptive-prescriptions.mjs`: optional rule validation and deterministic resolver.
- `server/progression.mjs`, `src/ProgressionGenerator.jsx`: eligibility, coach range, grouped preservation.
- `shared/prescriptions.mjs`: validate additive rule metadata.
- `src/AssignedWorkout.jsx`, `src/main.jsx`: recommendations, actual override, single-week editor and generation connection errors.
- `server/index.mjs`, `src/local-demo.mjs`: separately persisted recommendation snapshots.
- `server/ai/openai.mjs`, `server/ai/generation.mjs`: Sol support, telemetry, completion retry, explicit length recognition.
- `shared/ai/contract.mjs`, `shared/ai/conditioning-contract.mjs`: one-week support and nullable non-running pace unit.
- `shared/ai/validate.mjs`, `shared/ai/draft-state.mjs`, `shared/ai/convert.mjs`, `src/AIDraftReview.jsx`: warning acknowledgement, approval provenance and actionable findings.
- `tests/adaptive-prescriptions.test.mjs`, `tests/ai-phone-regressions.test.mjs`, `tests/ui/phone-prescriptions.browser.mjs`: new regressions.
- `tests/ai-draft.test.mjs`, `tests/focused-prescriptions.test.mjs`, `tests/gemini-provider.test.mjs`, `tests/prescriptions.test.mjs`: update expectations for intentionally broadened coach controls/advisories.
- `docs/PHONE-PRESCRIPTIONS-FOLLOWUP.md`, `docs/AI-PROVIDER-SETUP.md`: implementation/operations documentation.

## Deployment and limitations

No database migration or destructive rewrite. Optional JSON metadata is stored in existing records; old records lacking it keep their behavior. A future deployment must include both backend and frontend changes. For program generation set server-only `OPENAI_PROGRAM_MODEL=gpt-6.1-sol`, `AI_TIMEOUT_MS=180000`, and `AI_MAX_OUTPUT_TOKENS=32768`, keeping the existing OpenAI key and legacy model configuration. No key is added to client code.

Phone-sized touch-browser tests do not substitute for testing a newly packaged physical Android APK. No APK has been built in this pass. Larger requested programs can still hit the provider/time/output-size limits; the app reports the failure instead of silently saving a partial block. Existing unknown library movements must be matched before saving. AI-generated static-hold-specific draft editing is not expanded by this pass. Recommendations require explicit opt-in and sufficient recent data; they are suggestions, not an autonomous progression system. Build emits a non-blocking >500 kB chunk warning; no unrelated bundling rewrite was made.

## Verification

- Complete automated suite: **193 passed, 0 failed** (15 new tests), including HTTP API authorization/save receipts and local preview persistence.
- Complete browser/mobile suite: **33 passed, 0 failed** (4 new phone-state scenarios plus their suite entry). Existing strength, grouped logging, cardio intervals, Metcons, calendar, goals, Progress graphs and crash-recovery scenarios pass.
- Production web build: **passed**, 1,645 modules. Non-blocking bundle size warning noted above.
- Security scan: **passed** across 26 changed/new source, test and documentation files plus three client build artifacts. No known local credentials, token patterns, private key blocks or forbidden secret/database/APK/signing files found. Private local environment settings remain ignored. This is a source/artifact check, not an exhaustive security audit.
- Verified local effective configuration: program model gpt-6.1-sol; legacy/scanning model gpt-4.1-mini retained; timeout 180,000 ms; output cap 32,768. The model switch occurred only after successful live validation. Restart local development with pnpm dev:ai to load these environment settings. Production configuration was not changed.

| Live request | Complete weeks | Validation errors | Duration | Input / output / total tokens |
|---|---:|---:|---:|---:|
| Strength | 1 | 0 | 28.7 s | 4,402 / 1,827 / 6,229 |
| Conditioning (corrected full-library schema) | 3 | 0 | 64.1 s | 5,630 / 4,599 / 10,229 |
| Hybrid strength + Metcon | 4 | 0 | 78.1 s | 4,392 / 5,739 / 10,131 |
| Jiu-Jitsu (corrected full-library schema) | 6 | 0 | 125.1 s | 5,663 / 9,348 / 15,011 |

Warnings/questions still require coach acknowledgement; zero errors does not mean automatic approval. The first strength/hybrid cases used the seed library, and the conditioning/Jiu-Jitsu final cases used the complete installed library. Intermediate failed semantic checks were retained for diagnosis; validation was not bypassed.

Artifacts: output/qa/focused-pass-regression.txt, focused-pass-browser.txt, focused-pass-build.txt, focused-pass-security.json, gpt-6.1-sol-verification.json, gpt-6.1-sol-pre-fix-verification.json, and gpt-6.1-sol-full-library-verification.json. All are local ignored QA output. Synthetic live draft JSON is also retained locally for inspection.
