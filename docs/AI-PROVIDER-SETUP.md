# Iron Heart AI v1: first provider

The OpenAI adapter and AI Program Builder are implemented. Live generation requires a server-side API key. No key was configured during implementation, so verification used mocked responses and made no paid calls. Real model output quality and account access still need a first-generation check.

## Gemini alternative (free-tier project)

Gemini is an additional server adapter, selected through the same generation service. The existing contract, validation, review, approval, save and assignment flow are unchanged. No new dependency, database migration or client change is required.

To choose Gemini, put these settings in the ignored server file `.env.ai.local`, then restart with `pnpm dev:ai`:

```dotenv
AI_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_FREE_TIER_PROJECT_KEY_HERE
GEMINI_MODEL=gemini-3.6-flash
```

Obtain the key from [Google AI Studio](https://aistudio.google.com/apikey) for a project on the **free tier, without billing enabled**. Do not link billing or upgrade the project. Never paste the key into chat or client code. Google lists free input/output for this model in its [pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.6-flash). The project's tier determines charges; an API request cannot force a billing-enabled project to use the free tier. Free-tier data may be used to improve Google's products; keep identifying/sensitive athlete information out of prompts.

`server/ai/gemini.mjs` uses GenerateContent with JSON Schema structured output and server-header authentication. It reuses existing instructions, schema normalization and safe errors without refactoring OpenAI. Existing timeout, token and rate controls apply. Quota failures return to the coach without automatic retries or provider fallback. No billing settings are accessed. Setup status checks configuration presence only; live access has not been verified. Automated Gemini tests use mocked transport, with no external API calls.

## OpenAI: first real generation, exact local steps

1. Create an API key in your OpenAI API project, using the [official developer quickstart](https://developers.openai.com/api/docs/quickstart). Ensure the project has billing and access to the configured model. The app uses your API project, not the Codex chat session's credentials.
2. In the project root (`C:\Users\austi\OneDrive\Documents\ChatGPT\fitness app`), create a file named **`.env.ai.local`** in a text editor. Use the following content, replacing the placeholder with your actual key **in that local file only**:

   ```dotenv
   AI_ENABLED=true
   AI_PROVIDER=openai
   OPENAI_API_KEY=YOUR_API_KEY_HERE
   OPENAI_MODEL=gpt-4.1-mini
   AI_TIMEOUT_MS=120000
   AI_MAX_OUTPUT_TOKENS=24000
   AI_REQUESTS_PER_HOUR=6
   AI_DEBUG=false
   ```

   Do not paste the key into chat, the workout request field, React code, or Android configuration. `.env.ai.local` is ignored by Git. `.env.example` contains placeholders only. Do not copy the production database/bootstrap settings from `.env.example` into a local demo configuration unintentionally.
3. Stop the existing preview server. From a terminal in the project directory, run:

   ```powershell
   pnpm dev:ai
   ```

   This command loads `.env.ai.local` on the Node server. If port 4173 is already in use, stop the earlier server before restarting. Changes to credentials or server configuration require a restart.
4. Open `http://localhost:4173/`, sign in using **Coach view**, and open **AI Program Builder**. Click **Check connection** if it was previously open. Availability confirms configuration is present; it does not perform a paid provider health check.
5. For a small first test, request: “Create a 3-week strength block with 2 training days per week. Use bench, squat and row from the library. Use athlete-selected loads with RPE 7 for main lifts. Keep sessions under 60 minutes.” Set matching confirmed checks if desired, then click **Generate Draft**.
6. Inspect the complete weekly plan, assumptions, questions, errors, and warnings in **AI Draft Review**. Resolve questions/errors, acknowledge warnings, and approve only when satisfied. **Save as new program** creates a template; **Assign** is a separate action in Programs.
7. Try **Regenerate Draft**. Review or edit the request in the builder and submit again. The **Open draft** selector retains earlier drafts, including their edits/approvals, until refresh or sign-out.

The default model is configurable and supports the Responses API and Structured Outputs: [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Model access depends on the API project. This is an initial integration default, not a claim that it is the newest or best model for every programming task.

## Architecture and endpoints

`AIProgramBuilder → POST /api/ai/program-draft → generation service → provider adapter → schema validation → independent Iron Heart validation → AI Draft Review → explicit approval → save as new program → separate assignment`.

The adapter implements `generateProgramDraft(request, context)`. Provider-specific request/response handling is isolated in `server/ai/openai.mjs`; input validation, context assembly, limits, metadata and draft checking are in `server/ai/generation.mjs`. Neither module imports storage, program mutation, approval receipts, or assignment operations. No provider tools are supplied.

Coach-only endpoints:

- `GET /api/ai/status`: safe configuration status, model/provider, development-debug availability, and configuration guidance. Never returns credentials.
- `POST /api/ai/program-draft`: accepts `request`, optional `athleteId`, and optional `requirements`. Returns `generationId`, `draft`, independent `validation`, confirmed `requirements`, and safe `metadata`. It performs no database writes.

Confirmed requirements support `programWeeks`, `trainingDaysPerWeek`, `maxSessionMinutes`, `exerciseFrequency`, `primaryExerciseIds` (RPE checks), and `unavailableEquipment`. They are coach supplied, not accepted from model interpretation as authoritative checks. Prose-only constraints still require the coach's review. Program length/frequency discrepancies produce findings, and unavailable equipment blocks approval.

## Structured output and validation

The adapter calls `https://api.openai.com/v1/responses` using `text.format: {type: "json_schema", strict: true, ...}` and `store: false`. This uses the [official Structured Outputs mechanism](https://developers.openai.com/api/docs/guides/structured-outputs), not JSON-mode-only prompting. A provider-facing schema derives from `AI_DRAFT_SCHEMA` v1, makes all object properties required, and adapts unsupported constraints. Iron Heart's unchanged contract semantics and additional validation remain authoritative.

The server rejects malformed/incomplete/refused/oversized output and structural contract mismatches before sending anything to the renderer. Structurally valid but unresolved prescriptions, unknown exercises, missing reference maximums, and intent mismatches return an editable draft with findings. It discards provider claims of approval, validation results, source linkage and rewritten prompts; status and findings are application-owned. Athlete selection and original request come from authenticated input.

If a request lacks program length, instructions ask the model to return null weeks, a provisional first week, and an explicit question. Missing references must not be invented. The coach can regenerate with the missing information. The prompt asks for complete weeks when length is known, valid modes, restrained progression proposals, known library IDs, explicit unresolved names, and no invented injury/history/testing data.

## Context and privacy

Library entries sent to the provider contain only `exerciseId`, `name`, `region`, `equipment`, and `movementPattern`. The current direct-context limit is 300 entries and 60,000 context characters; large-library retrieval is deferred.

For a selected athlete the server checks the athlete exists in the current coaching workspace, then sends **sport only**. It does not send the athlete's ID, name, email, workout history, readiness, pain flags, current programs, or maximums. The app currently has one coaching organization; multi-tenant hosted use needs organization-scoped authorization first. Coach-written requests are sent as entered, so include only relevant training information.

The provider has no API key in its input body: authentication is an HTTPS server header. No provider environment variables, endpoint implementation, or credential code appear in web or standalone client bundles. API error bodies and hidden reasoning are neither logged nor returned. Credentials are not written to browser storage or SQLite. `store:false` is a request setting, not a guarantee about every provider retention policy.

## Failure handling and limits

Useful error codes distinguish missing configuration, invalid input, generation busy, hourly limit, provider rate limit, authentication failure, provider unavailability, timeout, refusal, incomplete response, invalid output, and contract mismatch. Messages state that no program was changed or saved; raw upstream errors are discarded. There is no automatic paid retry.

- One generation per coach at a time; two total concurrent generations per server process.
- Default six attempts/hour/coach; failures count once a provider attempt starts.
- Default 120-second timeout; configured range 1–180 seconds.
- Default 24,000 output tokens; configuration bounded to 1,000–32,768.
- Request length 10–2,000 characters; returned draft at most 80,000 UTF-8 bytes.
- Ten open generated drafts per browser session; no silent eviction.

These are single-process limits, not durable billing controls. Use provider-project spend limits and shared rate/approval state before public multi-instance deployment. Long or dense plans may exceed the output cap and should be requested in smaller blocks. Actual generation latency and output quality were not measured without credentials.

## Builder and review behavior

The new coach page provides a large request field, sample request, optional athlete selection, optional confirmed checks, Generate Draft/Regenerate Draft, clear configuration errors, and an indeterminate “Building your program…” status. No fabricated percentage progress is shown.

Successful responses append a new generation identity and automatically open the existing review screen. Earlier review components remain mounted, preserving edits and approval state when switching drafts. Regeneration never replaces or approves a previous draft. Sign-out clears the review session; late generation responses cannot repopulate it. Provider/model/time/schema-version/duration metadata accompanies the returned draft. The original request remains on the draft and enters saved provenance through the existing converter.

Set `AI_DEBUG=true` only on the development server to show a separate collapsed **Development diagnostics** panel. It includes the request, normalized structured response, validation findings, and elapsed duration. It is disabled on the production server even if the variable is true. It never includes raw provider envelopes, credentials or hidden reasoning.

## Environment and phone preview

Server configuration: `AI_ENABLED`, `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_REQUESTS_PER_HOUR`, `AI_DEBUG`. `.env.example` documents defaults. `pnpm dev:ai` is the local convenience launcher; a hosted deployment should use its environment/secret settings.

The standalone Android preview intentionally disables live generation with a clear hosted-server message. Practice drafts, existing save/assignment and logging continue to work locally. To enable live generation on a future connected Android build, point the normal client API at an authenticated hosted HTTPS Iron Heart server (`VITE_API_URL`) and configure the AI key on that server only. Do not use the device-only standalone adapter for live generation. This stage did not rebuild the APK.

## Verification and files

57 automated tests passed (44 existing plus 13 generation tests). Tests mock provider transport and also exercise the authenticated real HTTP endpoint against an isolated SQLite database. Coverage includes valid output, malformed JSON, schema mismatch, unknown exercises, missing references, confirmed requirements, timeouts/refusals/errors, limits, original-request preservation, separate regeneration identities, unchanged program/assignment records, and credential non-disclosure.

Web production and standalone phone-preview builds passed. Bundle scans found no OpenAI API credential variable or provider request implementation in either artifact. Git ignore verification confirmed `.env.ai.local` is excluded.

Browser verification of this stage was blocked: the in-app browser refused the isolated preview URL, and the existing preview did not advance through sign-in. Consequently the new screen's visual and interaction behavior is not browser-verified in this run. No real paid generation was attempted because credentials were not configured.

Added:

- `server/ai/openai.mjs`
- `server/ai/generation.mjs`
- `shared/ai/generation-history.mjs`
- `src/AIProgramBuilder.jsx`
- `tests/ai-generation.test.mjs`
- `tests/ai-generation-api.test.mjs`
- `docs/AI-PROVIDER-SETUP.md`

Modified:

- `.env.example`, `.gitignore`, `package.json`
- `server/index.mjs`
- `shared/ai/validate.mjs`
- `src/main.jsx`, `src/AIDraftReview.jsx`, `src/local-demo.mjs`, `src/ai-review.css`
- `README.md`, `docs/AI-WORKOUT-BUILDER.md`, `docs/PRESCRIPTION-PIPELINE.md`

The test fixture provider is only enabled with the explicit `--test-server` flag and `AI_TEST_FIXTURE` file path. Normal server startup refuses this setting; no mock provider can be selected through the browser or a normal production configuration.
