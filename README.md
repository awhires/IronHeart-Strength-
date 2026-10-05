# Iron Heart Strength

A working first version of a coach-to-athlete strength app, inspired by Relay Athletic's programming workflow, with original Iron Heart branding. The user's supplied PDF artwork is centered without redrawing the logo.

## Preview

Requires Node.js 24 and pnpm 11.

```powershell
pnpm install
pnpm dev
```

Open http://localhost:4173. Choose **Coach view** or **Athlete view** on the sign-in screen. The local demo uses fictional athletes and persists your edits in `data/demo.sqlite`. Sign out to switch roles. The preview is only available while this computer's server is running; it is not a public download link.

For phone AI testing on trusted local Wi-Fi, run `pnpm dev:ai`. This loads `.env.ai.local` and explicitly listens on `0.0.0.0:4173`, overriding local `HOST`/`PORT` values for this preview command. On the phone, use `http://<PC-LAN-IP>:4173` as the API address (not `0.0.0.0` or `localhost`). Keep the server running. Production (`pnpm start`) retains its existing bind settings and rejects the `--lan-preview` flag. Provider keys remain server-only.

## Installable Android preview

`output/apk/Iron-Heart-Strength-preview.apk` is the separate phone preview. Transfer it to an Android phone, open it, and allow installation from the chosen file app if prompted. Choose **Coach view** or **Athlete view**. It works without this computer; YouTube videos still require internet. Programs and logs save only on that phone and do not sync with the computer demo. Uninstalling or clearing storage removes them. This version starts with sample data and does not copy the computer database.

Rebuild with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-preview-apk.ps1`. See `ANDROID-RELEASE.md` for build prerequisites, preview signing, and production release steps. The supplied wordmark now excludes the phone number.

## Included

- Coach administration and private athlete accounts, invitation redemption, password reset via a new coach invitation, and server-enforced role/ownership checks.
- Reusable program templates with 3, 4, 6, 8, 9, or 12 week blocks, up to seven sessions per week, weekday selection, exercise prescriptions, notes, and duplication.
- **Generate following weeks**: start with Week 1, select Westside-inspired methods per exercise, preview, apply, and manually edit every generated week. Undo generation restores the previous draft. Save the program to persist overrides; assignments copy the exact saved block.
- Individual program assignments: changing an athlete's plan does not change the template or other athletes.
- Monday–Sunday calendar, athlete filtering, previous/next week, rescheduling, session removal and restoration.
- Searchable exercise library with coaching cues, editable YouTube IDs/links, embedded privacy-enhanced demonstrations, and external video fallback.
- Per-set workout logging (load, reps, RPE), readiness, pain flag, and feedback.
- Confirmed deletion of templates, athletes, assignments, unused exercises, and logs. Delete a workout log to redo it. Deleting a template preserves assigned copies; deleting an assignment preserves recorded history. Athlete/account deletion removes their records.
- Rule-based periodization and explicit coach-approved progression recommendations.
- Responsive browser interface, SQLite persistence, and a generated Capacitor Android project.

## AI Workout Builder prototype

Open **Coach view → AI Draft Review** to edit structured samples, resolve findings, approve an exact revision, and **Save as new program**. Saved templates use the normal editor and separate assignment flow. Manual and AI programs support fixed, percentage, bodyweight, and athlete-selected loads; optional RPE/RIR; tempo; and lbs/kg units. The AI Program Builder now has a server-side OpenAI adapter; configure credentials using [AI provider setup](docs/AI-PROVIDER-SETUP.md) before live generation. Generated drafts require the same review and approval. Unsaved drafts disappear on refresh or sign-out. See [prescription infrastructure](docs/PRESCRIPTION-PIPELINE.md) and [draft contract](docs/AI-WORKOUT-BUILDER.md). The existing APK has not been rebuilt with these changes.

## Progression logic

`server/progression.mjs` is deterministic and unit-tested. The explicit week generator implements a limited **Westside-inspired** approach, not an official or complete Westside program. Coaches choose each exercise's method and supply a reference maximum for dynamic-effort exercises. Week 1 remains untouched. Generated squat waves use the introductory 50/55/60% bar-weight and 10/8/6 sets of two pattern; bench uses the published 45/50/55% bar-weight component with nine triples, adapted without accommodating resistance. Bands/chains are not included. Waves repeat after three weeks instead of accumulating indefinite weight increases. The coach selects variations and recovery weeks manually. Max-effort prescriptions remain coach-set; accessory percentages are optional coach choices, not a claimed Westside rule. Everything remains editable in each week's editor, including load, sets, repetitions, exercise, notes, and weekday.

Sources: [Westside introductory dynamic effort](https://www.westside-barbell.com/blogs/the-blog/introducing-dynamic-effort-beginners), [Westside dynamic effort guide](https://www.westside-barbell.com/blogs/the-blog/the-wsbb-guide-to-dynamic-effort-training), and [variation scheduling](https://www.westside-barbell.com/a/blog/standard-bench-variations).

Legacy templates without an explicitly generated block retain the original three-loading-weeks/one-deload assignment behavior. Existing assignments are not changed by editing or regenerating a template. The chart shows relative planned load of the first exercise, not measured athlete performance or readiness. This is a programming aid, not AI or a clinically validated prescription.

An increase is suggested only after two sessions at the current prescribed load meet all set, rep, and effort targets. It uses the configured weight increment and blocks increments over 10%. Missing data, missed targets, bodyweight movements, or deload weeks hold progression. Pain requests a coach review. Low readiness or very high effort suggests a reduction from the last logged target. Already-reduced loads are not repeatedly reduced by the same feedback. No recommendation is applied automatically.

Sample starting weights are examples. Coaches must adjust them for each athlete. New prescriptions support pounds (lbs) and kilograms (kg). Legacy kilogram loads, progression increments, and logged targets are converted once to the nearest 0.25 lb when the database opens. Workout history stores a snapshot of the targets used at the time of logging. Editing a future prescription never rewrites completed logs.

Research reference: [ACSM progression position stand](https://pubmed.ncbi.nlm.nih.gov/19204579/). The implemented rules are conservative product defaults and have not been clinically validated.

## Validation

```powershell
pnpm test
pnpm build
```

Tests cover periodization, bodyweight loads, insufficient history, failed targets, pain/readiness flags, repeated reduction protection, auth boundaries, invitation redemption, independent assignments, weekday validation, cancelled sessions, duplicate log rejection, deletion, and redo.

## Production backend

This is a single coaching organization. Coaches can access the organization roster; athletes can access only their own assignments and logs. Multi-organization tenancy is not implemented.

Use a **new database**, not the demo database. Configure `.env.example` values in your hosting environment. The server intentionally refuses demo mode or a demo database in production. `.env` is a reference; the server reads process environment variables (Node can load the file with `--env-file=.env`). Vite reads `VITE_API_URL` during client builds.

```powershell
pnpm build
node --env-file=.env server/index.mjs --production
```

Set a unique `COACH_EMAIL` and 12+ character `COACH_PASSWORD` for first initialization; remove the bootstrap password from the environment after initialization. Put the app behind HTTPS, set `HOST=0.0.0.0` only on the intended host, and configure `ALLOWED_ORIGINS` with exact web origins plus `https://localhost` for Android. Keep the SQLite directory on a persistent volume, restrict filesystem access, and back it up with a SQLite-aware process. Do not run multiple replicas against separate databases. A Dockerfile is included; the runtime uses only Node built-ins and serves the built client.

Passwords use salted scrypt. Session and invitation tokens are stored as hashes. Browser sessions use HttpOnly, SameSite=Strict cookies and Secure in production. Native sessions use an in-memory bearer token; restarting the native app requires sign-in again. Login and invitation endpoints are rate limited per directly connected IP; configure a suitable edge limit when deploying behind a proxy.

Before a public release, supply an operator/contact and public privacy/deletion-request page, review the exercise demonstrations and coaching defaults, test with real devices, configure backups and recovery, and complete Google Play review. There is no email delivery, billing, push notification, offline logging, or public cloud deployment in this version. Invitations are copied and shared manually by the coach.

## Android

See [ANDROID-RELEASE.md](ANDROID-RELEASE.md). An installable device-only preview APK was built in an earlier stage; this stage verifies its web build but does not replace that APK. A hosted HTTPS API URL, Android SDK, suitable Java/Android Studio, signing key, and Play Console account are still required.

## Main files

- `src/main.jsx`, `src/styles.css`: coach and athlete interface.
- `server/index.mjs`, `server/store.mjs`: API, authorization, persistence.
- `server/progression.mjs`: progression rules.
- `server/seed.mjs`: starter exercise and program library.
- `android/`: Capacitor Android project.
- `output/pdf/Iron-Heart-Logo-Centered.pdf`: centered original artwork.

The supplied PDF remains unchanged. YouTube embeds depend on the uploader's availability and permissions. Replace unavailable videos using the library editor.
