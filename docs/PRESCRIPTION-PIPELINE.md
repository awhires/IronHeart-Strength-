# Rich prescription infrastructure

Update: the next stage added the server-side provider adapter and AI Program Builder. See [current provider setup and verification](AI-PROVIDER-SETUP.md). The descriptions below document the foundation/infrastructure stage.


Manual and AI-created programs now use the same prescription validation, storage, assignment, display, and logging system. No AI provider is connected. Existing SQLite JSON records support the additive fields without a migration.

## Live semantics

| Mode | Canonical prescription | Athlete display |
| --- | --- | --- |
| Fixed | Numeric `load`, explicit unit | `185 lb` or `80 kg` |
| Percentage | `percent1RM`, optional structured reference, unit and increment | `75% 1RM · Suggested: 170 lb`, or `75% 1RM · Reference max needed` |
| Bodyweight | Explicit `loadMode: bodyweight`, null or zero external load | `Bodyweight` |
| Athlete selected | `loadMode: athlete_selected`, `load: null` | `Choose load` |

Effort is independently `none`, `rpe`, or `rir`. RPE is required only for RPE mode, RIR only for RIR mode. Other targets must be null. Tempo is optional and uses four-part syntax such as `3-1-X-0`. Notes, progression instructions, and existing fields are preserved.

Fixed zero remains valid for old zero-load records; it is displayed as `0 lb` and is never inferred to mean bodyweight. Unknown values remain null. The live model accepts percentage prescriptions without a usable reference as a warning. The AI draft validator remains stricter and blocks draft approval until its reference issue is resolved.

## Legacy compatibility

`normalizePrescription` returns a copy. Missing load mode becomes fixed when a numeric load exists; missing effort mode becomes RPE when numeric RPE exists. Units default to lbs. It fills missing additive fields without changing explicit values. API data responses and UI boundaries normalize copies; simply reading programs, assignments, or history does not rewrite stored records. Explicit saves store normalized records.

Existing limits remain: supported block lengths, weekday values, exercise/set/rep counts, rest, increments, and weight limits. The 1200 lb limit is checked in pound equivalents for kg prescriptions and actuals. Existing zero-load records are not reclassified as bodyweight; coaches can explicitly select bodyweight when editing them.

## Percentage calculation

`calculatePercentageLoad` in `shared/prescriptions.mjs` is a pure utility with percentage, reference value/unit, output unit, and increment inputs. It returns separate `raw`, `rounded`, and `unit` fields. For 225 lb × 75%, raw is 168.75 lb; a 5 lb increment yields 170 lb.

`suggestedLoad` additionally checks reference exercise ID, positive value, unit, source (`tested`, `estimated`, `coach_entered`), and real calendar date. Invalid or absent references yield no suggestion. No maximum is inferred. The percentage remains canonical; any stored calculated load is a derived value, not a replacement for percentage/reference metadata. Editing percentage-related fields in the normal editor clears that derived load, and displays calculate it afresh. A supplied derived load must match the valid calculation.

Reference data is coach-supplied per prescription. Assignment copies it; coaches should review its suitability for each athlete and can edit the athlete's assigned session. This stage does not fetch individual maximums from history.

## Assignment and history

Full plans are cloned exactly on assignment, preserving every additive exercise field and session notes, along with program coach notes and progression instructions. A complete plan bypasses legacy periodization. Editing a template does not update prior assignments.

Logged actuals contain actual weight, weight unit, reps, and actual RPE. The current exercise/set-count logging flow remains intact. Actual RPE is required for an RPE target and optional for other effort modes; actual RIR entry remains a later feature. A percentage target does not substitute for actual weight used, and athlete-selected weights start blank.

Each logged exercise receives a cloned, normalized target from the authoritative assignment, not from client-supplied target data. The snapshot includes load mode, load/unit, percentage/reference, effort mode, RPE/RIR, tempo, notes, and progression instructions. Later assignment or template edits do not change it. History displays the snapshot separately from actual sets; old actuals without units display in lbs.

The legacy deterministic progression engine continues supporting fixed-pound/RPE prescriptions. Other loading/effort modes and kg targets are held for coach-directed progression. The week generator preserves these targets when its method is Hold and rejects incompatible automatic load rules. Recommendations also reject incompatible history/units instead of treating unknown targets as zero.

## Approved draft to saved program

1. Coach approves an exact review revision. Local independent validation checks structure, intent, warnings, and exercise library.
2. Authenticated coach-only `POST /api/ai/approve` verifies the review and issues an application-owned receipt.
3. `POST /api/ai/programs` requires that receipt, matching coach, review content and requirements, valid approval, and current library validation. It revalidates immediately before conversion/save.
4. A fresh ID is generated; `sourceProgramId` remains provenance. The full plan is authoritative and legacy `sessions` derives from Week 1. No source program is updated and no assignment is created.
5. The new template appears in Programs and uses the normal editor and separate Assign action.

Receipts last 30 minutes, are bounded in memory, and expire on server restart or recreation of the standalone adapter. The UI asks for approval again when a receipt expires. Repeating a successful save with the same receipt returns the original result, avoiding accidental duplicate programs. A failed storage write does not consume successful-save state. Edits invalidate approval and the receipt. Ordinary manual saves remain normal authenticated coach operations; AI provenance records the original AI approval, not later manual edit approval.

This is a single-process, single-coaching-organization implementation. Before hosted multi-instance deployment, persist approval/revision/idempotency state transactionally and enforce organization/athlete ownership in the hosted backend.

## Files

Added:

- `shared/prescriptions.mjs`
- `shared/ai/save-service.mjs`
- `src/PrescriptionEditor.jsx`
- `tests/prescriptions.test.mjs`
- `tests/rich-pipeline.test.mjs`
- `docs/PRESCRIPTION-PIPELINE.md`

Modified:

- `server/index.mjs`, `server/progression.mjs`
- `shared/ai/validate.mjs`, `shared/ai/convert.mjs`
- `src/main.jsx`, `src/local-demo.mjs`, `src/AIDraftReview.jsx`, `src/ProgressionGenerator.jsx`
- `src/styles.css`, `src/ai-review.css`
- `tests/local-demo.test.mjs`
- `README.md`, `docs/AI-WORKOUT-BUILDER.md`

The existing storage-failure test now supplies a valid program because phone-preview saves use the live validator. Its storage-failure assertion is retained. A small role-switch fix returns sign-out to Overview so an athlete does not inherit the coach's Programs screen.

## Verification

- 44 automated tests pass, including all existing tests and 10 new tests.
- New coverage exercises both the real HTTP/SQLite API and the standalone adapter: save/retrieve/assign/log, all load modes, kg actuals, optional RPE, RIR, tempo, missing references, immutable snapshots, new IDs, source protection, stale approval rejection, and exact weekly-plan assignment.
- Pure tests cover raw/rounded unit conversion, validation, read-only legacy normalization, progression guards, receipt expiry, coach/library binding, retries, and storage failure.
- Browser QA in a separate disposable database verified approval → save → normal editor → separate assignment → athlete display → workout logging → history. A measured 390 CSS-pixel layout showed no horizontal overflow.
- Web and standalone phone-preview Vite builds pass. No APK was rebuilt or replaced by this stage.

## Before connecting a provider

Keep providers behind a server endpoint with no storage or assignment tools. Add authentication/rate/cost limits, output size limits, structured-output validation, and representative evaluation fixtures. Establish trusted requirement extraction and explicit missing-information handling. For Supabase, implement organization-scoped access and durable approval/version checks first; only then provide scoped athlete history/readiness context. Keep all provider results entering the existing draft validation and coach approval path.
