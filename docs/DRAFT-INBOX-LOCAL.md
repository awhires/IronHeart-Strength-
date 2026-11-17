# Durable coach Draft Inbox — local development

This phase uses the existing ChatGPT JSON format and AI Draft Review. It does not connect ChatGPT, OAuth, or MCP.

## Local enablement

Set `DRAFT_INBOX_ENABLED=true` when starting the Node server. Use an isolated `DB_PATH` and test accounts for verification. The switch defaults off in all environments; production must explicitly opt in. When enabled in production, the API still requires the existing signed-in coach session for every inbox operation. Athlete accounts do not receive the inbox UI or endpoint access. No existing environment files are changed by this feature. Do not enable it on a production service until the release is reviewed and intended for use.

Coach Mode → AI Draft Review → ChatGPT Drafts opens the inbox. Import from ChatGPT accepts the same documented v1 envelope containing a v2 program, including complete multiweek programs. The ordinary copy/paste importer remains available without persistence when the inbox is closed or disabled.

## Authenticated local API

- `POST /api/external-drafts`: v1 import envelope (or `{draft}` for the existing internal adapter), with an `Idempotency-Key` of 8–128 characters.
- `GET /api/external-drafts`: the coach's latest 100 draft summaries.
- `GET /api/external-drafts/:id`: owned draft, revision, and freshly computed validation findings.
- `PUT /api/external-drafts/:id`: `{revision, draft}`; compare-and-swap update. Status must remain draft. Stale updates return 409 without replacing either stored content or entered browser values.
- Existing `POST /api/ai/approve` and `POST /api/ai/programs` accept an `inbox: {id, revision}` context. They check ownership and exact saved content before using existing validation and approval receipts.

The inbox enforces a 500,000-byte submission and normalized-draft limit (approval/save envelopes allow up to 2 MB because the existing approval signature repeats draft content) and 1,000 drafts per coach. Same-key/same-payload retries return the original submission; conflicting reuse returns 409. Use a fresh key only for a deliberately new submission. Transport submission errors retain the pasted JSON for retry. Incomplete or semantically invalid but structurally readable programs are kept as needs-review drafts; malformed structure is rejected with findings. Existing exercise mapping and validators remain authoritative.

## Persistence and review

`external_drafts` is additive: coach ID, request key, original submission hash, draft JSON, status, timestamps, revision, and saved program ID. Earlier local prototype tables gain only missing columns. No program, assignment, or workout record is migrated.

Save draft edits persists the editable draft. Approval also persists edits first. Every actual content change increments the stored revision and invalidates prior approval. Unsaved browser edits still require Save draft edits before leaving or refreshing. A stale review keeps entered values and provides an explicit Reopen saved draft action; reopening replaces the visible draft with its saved version.

Saving an approved draft creates the program and marks the inbox entry saved in one SQLite transaction. The saved program ID prevents duplicate program creation on retry, including after server restart. Saved inbox entries are read-only. Approval receipts retain their existing 30-minute lifetime and expire on restart; unapproved drafts and saved-program links remain durable. Assignment is a separate action.

Review links use `/?draft=<id>` and are resolved only after an authenticated coach session. A link does not grant access. External OAuth/MCP prototype files remain unwired. Only `tests/mcp-drafts.test.mjs` is excluded from the release test runner; inbox API and browser tests are now included.
