# AI Workout Builder v1 foundation

Update: the next stage added the server-side provider adapter and AI Program Builder. See [current provider setup and verification](AI-PROVIDER-SETUP.md). The descriptions below document the foundation/infrastructure stage.


This stage provides a provider-independent draft contract, validation, revision approval, conversion, and a coach review prototype. There is no model connection or database migration. The subsequent infrastructure stage added a coach-approved save-as-new path into the normal program system; see [prescription infrastructure](PRESCRIPTION-PIPELINE.md). Assignment remains separate. Open **Coach view → AI Draft Review**. Samples and edits live in component memory; refreshing, signing out, or closing the page discards them.

## Flow and ownership

Future coach text/voice → provider → structured draft → Iron Heart validation → coach edits → approval of exact revision → save as a new program → separate assignment.

The review starts at structured sample data and supports JSON preview or explicit save as a new program after approval. Requirements are supplied separately as trusted fixture data; the app does not yet extract requirements from natural language. Model-supplied status and validation findings are never accepted as proof of approval or validity. Review state belongs to the application.

## Files

- `shared/ai/contract.mjs`: authoritative JSON Schema (`AI_DRAFT_SCHEMA`), enums, unit helpers, nullable number input helper.
- `shared/ai/validate.mjs`: non-mutating structural, prescription, exercise-library, and intent checks; reference calculation; duration estimate.
- `shared/ai/draft-state.mjs`: create/edit/approve review revisions and reject stale approval.
- `shared/ai/convert.mjs`: pure approved-review to program adapter.
- `shared/ai/fixtures.mjs`: valid, invalid/unresolved, and percentage samples; sample requirements.
- `src/AIDraftReview.jsx`, `src/ai-review.css`: scoped coach-only prototype.
- `tests/ai-draft.test.mjs`: focused module tests and isolated local-demo compatibility test.

The initial stage added a coach navigation item and review component. The later infrastructure stage extends the existing server, editor, assignment, logging, and progression boundaries; its complete file list is in the prescription infrastructure document.

## Version 1 contract

All listed properties are required; nullable values explicitly represent unknown or absent data. Unknown properties are rejected, including a program ID that could accidentally target an update.

| Level | Fields |
| --- | --- |
| Draft | `schemaVersion: 1`, `status`, `athleteId: string/null`, `sourceProgramId: string/null`, `originalRequest`, `assumptions: string[]`, `questions: string[]`, `validationFindings`, `program` |
| Program | `name`, `goal`, `description`, `weeks: integer/null`, `coachNotes`, `progressionInstructions`, `plan` |
| Week | `week`, `sessions` |
| Session | `name`, `day`, `maxDurationMinutes: number/null`, `coachNotes`, `exercises` |
| Exercise | `exerciseId: string/null`, `exerciseName`, `sets`, `reps`, `load: number/null`, `loadMode`, `loadUnit`, `percent1RM: number/null`, `reference1RM: object/null`, `effortMode`, `rpe: number/null`, `rir: number/null`, `rest`, `tempo: string/null`, `increment`, `notes`, `progressionInstructions` |
| Reference 1RM | `exerciseId`, `value`, `unit`, `type`, `date` (YYYY-MM-DD) |
| Finding | `code`, `severity`, `message`, `path` (JSON Pointer), optional `suggestedResolution` |

Enums are defined centrally:

- Load mode: `fixed`, `percentage`, `bodyweight`, `athlete_selected`.
- Effort mode: `none`, `rpe`, `rir`.
- Units: `lbs`, `kg`; fixtures default to pounds.
- Status: `draft`, `needs_review`, `approved`.
- Reference type: `tested`, `estimated`, `coach_entered`.
- Severity: `error`, `warning`, `info`.

Tempo is eccentric - bottom pause - concentric - top pause. `3-1-X-0` means three seconds down, one-second bottom pause, intentionally explosive concentric, no top pause. Only the concentric position supports `X`. A null tempo is valid.

## Validation

The validator supports the JSON Schema keywords used by this contract; it is not a general-purpose JSON Schema engine. It returns findings, severity counts, and `canApprove`. It does not coerce input, silently repair prescriptions, create exercises, or modify the draft.

Errors include malformed fields, unsupported enums/schema versions, unresolved exercise IDs, missing fixed loads, invalid or missing reference maximums, conflicting load/effort modes, invalid RPE/RIR/percentage/tempo, invalid days, missing/incomplete/duplicate weeks, empty sessions, and unresolved questions.

Current application limits are retained: 3/4/6/8/9/12 weeks, 1–7 sessions/week, 1–15 exercises/session, 1–12 sets, 1–50 integer reps, rest 0–600 seconds, increment 0.25–25. RPE is 1–10, RIR 0–10, and percentage 1–100. Loads and references cannot exceed the equivalent of 1200 lbs. Day uses Sunday=0 through Saturday=6. Every planned week must be present and sequential.

`load: null` never becomes zero or bodyweight. Fixed loading requires a positive weight. Athlete-selected loading requires null. Bodyweight is only explicit bodyweight mode and accepts null or zero external weight. Standard sets/reps use effort mode `none` with null RPE and RIR. RPE and RIR each require their own target and exclude the other target.

Percentage calculation requires a positive maximum, matching known exercise ID, valid unit/source/date, percentage, and increment. It converts the reference to the prescription unit, multiplies by percentage, and rounds to the nearest increment. Missing or invalid reference data yields no calculated weight and blocks approval. An explicitly entered percentage load must agree with the calculation.

Warnings include exercise name/ID mismatch, duplicate weekdays, assumptions, requested training-day/frequency mismatch, primary lifts missing the requested RPE mode, and estimated sessions above the requested limit. Frequency counts distinct weekdays, not duplicate rows. Duration estimates include 10 minutes warm-up, two minutes setup per exercise, work, and rest between sets. Unknown tempo assumes four seconds per rep; explosive action assumes one second. These are planning estimates, not guarantees.

## Approval and conversion

Errors block approval. Warnings require an explicit acknowledgement. Approval records coach, time, revision, and a canonical snapshot of draft content, library IDs/names, and requirements. Every edit clears approval and the converted preview. Library or requirement changes also invalidate the snapshot. A supplied `status: approved` alone grants nothing.

The snapshot is an in-memory stale-review guard, not cryptographic authorization. Hosted saving must enforce coach authorization, revision matching, and independent revalidation on the server.

`toIronHeartProgram(review, library, requirements)` requires valid approval, clones the program, preserves additive fields, calculates valid percentage loads, and adds provenance. It supplies legacy `sessions` using the same array as `plan[0].sessions`; Week 1 is never separately edited. JSON serialization repeats this compatibility projection, so future persistence must continue to treat `plan` as authoritative.

The converter creates no ID, writes nothing, never reads or changes an existing program, and never invokes progression. `sourceProgramId` is only provenance. The isolated local-demo integration test verifies that a full converted plan is copied into an assignment without legacy periodization and that saving a new copy leaves its source unchanged. The UI now has a separate server-authorized save-as-new path; assignment remains an independent normal coach action.

## Existing architecture limits and next stage

The rich prescription infrastructure stage resolved the original numeric load/RPE compatibility limit with additive JSON fields and shared validation. No database migration was needed. AI drafts still require valid references for approval; live manual programs can preserve an unresolved percentage reference and display a warning. Hosted Supabase access, trusted athlete context, durable multi-instance approval state, and provider integration remain future stages. See [current implementation and next steps](PRESCRIPTION-PIPELINE.md).

## Verification

`node --test tests/*.test.mjs`: 44 passing tests, including the AI foundation, rich prescription pipeline, and original app tests. Normal Vite production build and standalone phone-preview Vite build pass. The existing APK was not rebuilt or replaced.

Browser checks cover approval blocking, warning acknowledgement, explicit exercise matching, percentage preview, approval invalidation after editing, JSON preview, and phone layout at a measured 390 CSS-pixel viewport without horizontal overflow. The review screen is coach-only; save requests go through authenticated coach approval and save endpoints.
