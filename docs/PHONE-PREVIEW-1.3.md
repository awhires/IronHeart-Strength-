# Iron Heart 1.3 phone preview — implementation report

## Changes and files

New modules: `shared/tracking.mjs`, `shared/journal-measurements.mjs`, `shared/scan-workout.mjs`, `shared/api-connection.mjs`, `server/ai/scan.mjs`, `src/ServerConnection.jsx`, `src/glass-theme.css`, `tests/journal-expansion.test.mjs`, `scripts/start-lan-preview.ps1`, and `android/app/src/debug/AndroidManifest.xml`.

Extended existing files: `shared/workout-tracker.mjs`, `shared/volume-stats.mjs`, `shared/prescriptions.mjs`, `server/store.mjs`, `server/index.mjs`, `server/progression.mjs`, `server/ai/openai.mjs`, `src/local-demo.mjs`, `src/WorkoutTracker.jsx`, `src/main.jsx`, `src/PrescriptionEditor.jsx`, `src/ExerciseProgress.jsx`, `src/AIProgramBuilder.jsx`, `tests/tracker-api.test.mjs`, `scripts/build-preview-apk.ps1`, `scripts/check-android.mjs`, and `android/app/build.gradle`. Android generated web assets are refreshed by Capacitor sync.

## 1. Storage and backward compatibility

No SQL table changes or destructive migrations. The existing records JSON and phone storage remain in place. A one-time `tracking-library-v1` catalog update adds missing exercises by ID/name and does not resurrect later deletions. Existing Front Squat and Forearm Plank keep their IDs. No loading increments are rewritten: new pound defaults remain 5 lb, explicit 2.5 lb records and kg behavior are preserved.

Journal entries can additionally contain `setBlocks`, `trackingType`, `complex`, `complexText`, `volumeEligible`, `intervals`, and exercise `notes`. Actual sets remain the canonical source for volume. New non-strength sets contain only appropriate metrics. The phone package, signing key, HTTPS WebView storage origin and localStorage key are retained for upgrade compatibility.

## 2. Grouped logging

Enter a set count, reps and load once per block. Add another block for a different prescription. Saving expands each block into actual sets while keeping the block summary. Blocks can be edited/deleted; “Edit individual sets” expands them before saving for per-set corrections.

Verified example: 5 × 1 × 210 + 3 × 3 × 160 = **2,490 lb**, eight actual sets. Editing the first load to 215 gives 2,515 lb; deleting the first block leaves 1,440 lb. No double counting of the retained block summary.

## 3. Olympic library and complexes

Olympic Weightlifting includes Clean, Power Clean, Snatch, Power Snatch, existing Front Squat, Overhead Squat, Box Clean, Box Power Clean, Box Snatch and Box Power Snatch. New default catalog total: 86 exercises (25 new entries; existing Front Squat reused).

The complex editor adds component movements and repetitions, with optional pause, hang, high hang, low hang, above/below knee, blocks, tempo or complex modifiers. Tempo details can be written in exercise notes. Three sets of “2 pause Power Clean + 1 Power Clean” at 185 lb retain the full description, three completed sets and nine underlying reps. Same-base complexes count toward that base lift's volume. Mixed-movement complexes keep their raw components but are excluded from a misleading single-lift volume total.

Matching supports exact names and BP, PC, BS, FS, OHS and RDL. Ambiguous or unknown names remain unresolved for correction; they are never silently assigned a guessed ID.

## 4. Core and measurement profiles

Added Push-Up Plank, Weighted Plank, dumbbell/kettlebell Suitcase Carry, dumbbell/kettlebell Farmer Carry, Side Bend, Hanging Leg Raise, Hanging Knee Raise and L-Sit. Forearm Plank remains available. Added Back Rack Barbell Hold in Isometric.

Workout Tracker profiles:

| Profile | Fields |
|---|---|
| Strength | Sets, reps, optional load, RPE and RIR |
| Timed | Sets and duration |
| Loaded hold | Sets, load and duration |
| Carry | Sets, load, distance, optional duration |
| Treadmill | Distance, duration, mph, incline |
| Stair Stepper | Duration, level |
| SkiErg / RowErg | Distance, duration, pace per 500 m |
| Outdoor Running | Distance, duration, pace per selected distance unit |

Duration and pace inputs are seconds; history formats pace as minutes:seconds. Holds, carries and cardio are excluded from rep-based volume, with raw metrics visible in workout history. These new measurement profiles apply to the independent Workout Tracker; existing assigned strength prescriptions retain their current workflow.

## 5. Cardio units and intervals

Added Treadmill, Stair Stepper, SkiErg, RowErg and Outdoor Running. Distance stores a number and unit (`mi`, `km` or `m`). Unit changes convert the existing value: 1 mile = 1.609344 km. Running pace converts with distance-unit changes. Erg pace remains seconds per 500 m regardless of total-distance display.

Intervals use `{rounds, work: {metrics}, recovery: {metrics}}`, up to 20 blocks with 1–100 rounds. Each phase needs duration or distance. Examples tested: six treadmill rounds of 120 seconds at 9 mph / 60 seconds recovery; five rowing rounds of 500 m at 110 seconds per 500 m / 120 seconds recovery. Session totals are entered separately and are not double counted with interval details.

## 6. Varied programmed blocks

Program and client-session editors include optional varied `setBlocks`. Blocks inherit loading/effort/rest settings and can override their sets, reps, load or percentage. Up to 12 total prescribed sets. Assigned-workout logging uses each block's load/reps/effort targets and retains the target snapshot. Example 3 × 3 at 200 + 3 × 2 at 205 produces six correct target sets. Automatic progression leaves varied blocks coach-programmed rather than altering their individual targets unexpectedly. Legacy simple prescriptions continue to work.

The existing AI program-output contract and coach approval pipeline are unchanged. Varied blocks can be refined in the existing program/session editor.

## 7. Scan Workout

Choose a JPEG, PNG or WebP journal photo, up to 4 MB, then choose Scan and review. The authenticated athlete-only `POST /api/ai/workout-scan` sends image input through the existing server OpenAI adapter. There is no OCR-only pipeline, no image storage, and no automatic journal save. The image is held only for the request.

The result populates Review Workout with exercise matching, grouped blocks, complexes and notes. Correct names/numbers, remove bad entries, add missing entries, then check “I reviewed and corrected this workout” and choose Save to Journal. Edits clear that checkbox. The normal authenticated journal endpoint validates and saves the corrected data. Provider limits, timeouts and hourly scan limits apply.

This first scan implementation extracts strength journal entries, including complexes. Cardio/hold photos may require manual metric entry. Scanning currently uses the configured OpenAI provider; selecting Gemini for program generation does not silently send scans to OpenAI. The app explains when scanning is unavailable.

Provider tests use mocked image responses. A real handwritten image has not been sent to the live provider in this update, so real-world recognition accuracy remains to be tested. Image request shape follows the [official OpenAI image-input documentation](https://developers.openai.com/api/docs/guides/images-vision).

## 8. Design and navigation

A shared monochrome glass stylesheet covers dashboards, journal, progress, library, program editor, AI builder/review, settings and dialogs. Charcoal backgrounds, translucent cards, gray borders, white actions/text and readable fields replace the prior light theme. Original Iron Heart logo assets are retained; no Relay assets or implementation are used.

The sidebar uses a dynamic viewport height, independent vertical scrolling, non-shrinking menu content and safe-area bottom padding. “Sign out / switch view” is visible at the bottom. Verified on a 390 × 650 browser viewport: athlete sidebar content 696 px and coach sidebar content 843 px both scroll within the 650 px viewport. The sign-out action returns to athlete selection / Coach view.

## 9. Android AI setup

Architecture: Android preview → existing Iron Heart API → server OpenAI adapter. No Android-only program generator. Existing `/api/ai/program-draft`, validation, Draft Review, approval, save and assignment flows are reused.

1. Keep the Windows computer and phone on the same trusted private Wi-Fi.
2. From the project directory run:

   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-lan-preview.ps1`

3. The script loads the existing `.env.ai.local`, binds `HOST=0.0.0.0` on port 4173, and prints private LAN addresses. Close an existing server on port 4173 before starting a second one. Keep the server running while testing on the phone.
4. In the APK, open Account & settings → Phone AI connection, or use the same controls on the sign-in screen.
5. Enter the printed URL, choose Test connection, and look for **AI Server: Connected**. Then choose **Use server & sign in**, followed by Coach view for AI Program Builder or athlete sign-in for server workouts.
6. The current detected address during verification was `http://192.168.1.153:4173`. It is not hard-coded and may change with Wi-Fi/DHCP.
7. Use phone-only preview returns to local data. Server and phone-only workspaces remain separate; this is not an automatic data-sync migration.

The API URL can also be supplied at build time using `VITE_API_BASE_URL` (or the existing `VITE_API_URL`). The preview UI stores only the address under `iron-heart-preview-api-url`; it does not store provider credentials. Native session tokens stay in memory and require another sign-in after restarting the app.

`GET /api/health` reports service identity and whether AI is configured, without secrets. AI Program Builder also displays Connected when its authenticated status check succeeds. Network failures explain the computer/Wi-Fi dependency rather than claiming that the API key is invalid.

Debug Android builds allow cleartext LAN traffic and mixed content so the existing HTTPS WebView origin can contact the HTTP development server without losing its local data. This setting is injected by the preview build and restored afterward; release configuration retains HTTPS and disallows mixed content. No firewall rules were changed. If another device cannot reach the URL, Windows may require Node access on the Private network profile; do not expose this demo server through router port forwarding.

## 10. Security, validation and remaining device checks

- Server-only `OPENAI_API_KEY` remains in the existing environment file. No keys were read into output, placed in client variables, localStorage, source or the APK.
- Full suite: **82 tests pass** (all previous tests retained), including grouping/edit/delete, 2,490 lb volume, complexes, core profiles, holds, cardio/unit/interval validation, scan correction/save, image-adapter shape, safe API URLs, programmed blocks and regressions.
- Web production build: passed.
- Android package: `com.ironheartstrength.app`, version code 4, version name `1.3-preview`, existing signing key.
- Mobile browser verification: scrolling role controls, grouped save, eight-set history and 2,490 lb progress display confirmed. Test-only journal entry removed afterward.
- LAN health endpoint: responded on the detected LAN address with `ok:true` and `aiAvailable:true`. This confirms this computer can reach the server; it is not a physical phone connectivity test.
- Final Android build: BUILD SUCCESSFUL; APK v2 signature verified. Credential scan passed across 447 entries, with no server API keys or provider implementation found. APK: `output/apk/Iron-Heart-Strength-preview.apk`. SHA-256: `1b28bdabe1409ecb5dfc8e14847ede14f8fdef67268407895a28bca95c953ad6`. Physical Android installation, device firewall reachability and a real provider image extraction still need on-phone testing.

## 11. Wearable roadmap (not implemented)

Later attach an optional versioned `wearableMetrics` object to a workout (source/device, recorded interval, average/maximum heart rate, optional samples, duration and provenance). Keep it separate from completed sets and cardio intervals. Add explicit consent, import validation and source deduplication at that stage. No Garmin, Apple, smartwatch SDK or new wearable permissions have been added.
