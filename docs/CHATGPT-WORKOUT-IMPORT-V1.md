# Iron Heart Strength — ChatGPT workout copy/paste format v1

This is a local, deterministic import into **Coach Mode → AI Draft Review → Import from ChatGPT**. It does not call an AI provider, create a database record, save a program, assign an athlete, or approve a draft. The coach can map unmatched exercise names, edit the draft, review findings, then use the existing explicit approval/save workflow.

## Prompt for ChatGPT

Copy this prompt, describe the workout you want, and ask ChatGPT to return one JSON object only:

> Create a workout program for Iron Heart Strength using the exact JSON contract and example in `docs/CHATGPT-WORKOUT-IMPORT-V1.md`. Return one JSON object only, with no Markdown fences or commentary. Set `format` to `iron-heart-strength-workout`, `version` to `1`, and the embedded draft `schemaVersion` to `2`. Include the complete requested number of weeks, every session, and progression instructions. Use only the documented fields and enum values. For strength, cardio, timed movement, grouped-set, superset, and Metcon prescriptions, match the examples and fields in the contract. Use exact names from the Iron Heart exercise library; set IDs to `null` unless you know the current ID. Never invent exercise IDs, actual athlete results, a reference maximum, an athlete assignment, or a completed approval. Keep `status` as `draft`, `athleteId` and `sourceProgramId` as `null`. Do not omit required structure or add fields that are not in the contract. Coach review is required before saving or assigning.

Add the coach's request after the prompt, for example: “Create a six-week hybrid program with two strength days and one interval-running day per week. Keep sessions under 75 minutes.”

## Contract envelope

The import is capped at 500,000 characters and must be a JSON object with exactly these top-level keys:

```json
{
  "format": "iron-heart-strength-workout",
  "version": 1,
  "draft": { "schemaVersion": 2, "status": "draft", "athleteId": null, "sourceProgramId": null }
}
```

The full draft follows the current `AI_DRAFT_SCHEMA_V2` and workout-block contract. The complete, importable six-week hybrid example is [chatgpt-hybrid-6-week-v1.json](examples/chatgpt-hybrid-6-week-v1.json). It includes six weeks, two training days per week, separate strength and cardio prescriptions, a grouped strength prescription, a superset, AMRAP scoring, running intervals with a 0.75 work-to-recovery ratio, and an assessment-derived pace method. Replace its sample requests and progression notes before actual use. IDs are null so the app must match names from its current library; no sample athlete identity is included.

## Supported fields and rules

- **Program:** `name`, `goal`, `description`, `weeks`, `coachNotes`, `progressionInstructions`, and `plan`.
- **Weeks/sessions:** sequential `week` values and session `name`, Sunday-based numeric `day` (`0`–`6`), optional `maxDurationMinutes`, `coachNotes`, `exercises`, and v2 `blocks`. Programs can include up to 12 weeks, 7 sessions/week, 15 exercises/session, and 20 blocks/session, subject to current Iron Heart validation.
- **Strength prescriptions:** current exercise fields such as `sets`, `reps`, `repMode`, `load`, `loadMode`, `loadUnit`, `loadDelta`, `percent1RM`, reference exercise/1RM, effort (`none`, `rpe`, `rir`), rest, tempo, increment, notes, progression instructions, and optional `setBlocks`. A grouped exercise's parent `sets` must equal the sum of its block sets. Every set block uses the same supported prescription fields.
- **Load methods:** `fixed`, `percentage`, `bodyweight`, `athlete_selected`, `previous_performance`, or `none`. Only include related fields for that method. A percentage target is not an actual weight: never invent a reference maximum. Previous Performance ± uses `loadDelta`; it does not invent history when no qualifying actual workout exists.
- **Supersets and workout blocks:** non-Metcon blocks use `id`, supported `type` (`Strength`, `Hypertrophy`, `Cardio`, `Accessory`, `Mobility / Recovery`), `name`, `exerciseIndexes`, optional `superset`, `supersetNotes`, and `restSeconds`. Indexes refer to that session's `exercises` array and each exercise belongs to exactly one non-Metcon block. A superset needs two or more strength exercises. Metcon blocks use `type: "Metcon"`, `id`, `name`, and a `metcon` object.
- **Cardio/intervals:** `trackingType` must match the selected library exercise profile. Use `metrics` only for supported distance, duration, pace, speed, watts, cadence, calories, RPE, etc. Optional `intervals` can describe repeated work and recovery using `rounds`, `work`, `segments`, `recovery`, `recoveryAfterFinal`, and `recoveryRule`. A ratio rule has `preset` (`threshold` or `custom`), `recoveryPerWork`, and `workDurationSeconds`. Do not count a recovery as work. Assessment pace uses a `paceMethod` with `type: "assessment"`, source (`six_minute`, `mile`, `four_hundred`, or `benchmark`), category (`easy`, `threshold`, `vo2Intervals`, `shortIntervals`, or `observed`), and unit (`mi` or `km`). Benchmark methods require a real `benchmarkId`; use only when known. These are recommendations, not completed performance.
- **Metcons:** use supported `scoreType` values (`For Time`, `AMRAP`, `EMOM`, `Rounds for Time`, `Rounds + Reps`, `Time Cap`, `Load`, `Chipper`, `Intervals`), optional scoring mode/format/benchmark, prescribed movement targets, rounds/time caps/work/rest fields, and notes. Each movement must match an exercise-library item. Scoring is a prescription, not an actual result.
- **Library matching:** exact case-insensitive names are matched locally. Unknown names are shown for coach mapping; no fuzzy substitution occurs. An absent library exercise must be added to the library or the import corrected before approval.
- **Versioning and safety:** only envelope version 1 with embedded draft schema version 2 is accepted. Extra or unsupported keys, assigned athlete IDs, source program IDs, approved statuses, invalid structure, and incompatible values are rejected or surfaced for correction. The importer never writes athlete data or calls the AI provider.

This contract intentionally does not carry workout results, completed sets, athlete identifiers, database IDs for program/assignment records, AI approval receipts, or undocumented application fields.
