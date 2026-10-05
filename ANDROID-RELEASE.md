# Android release handoff

## Status

The Capacitor production project is `com.ironheartstrength.app`, **Iron Heart Strength**, targeting Android API 36 (minimum 24).

A separate device-only test APK is built with `scripts/build-preview-apk.ps1`. Its package is `com.ironheartstrength.app.preview` and launcher name is **Iron Heart Preview**. It starts with sample athletes, saves programs and logs to the phone's local storage, and uses the same progression rules and editing screens. No hosted server, account registration, invitation sharing, or cross-device sync is included in this preview. Videos need internet. Clearing app storage or uninstalling removes preview data.

Java 21 and Android SDK 36/build tools 35 are installed locally under ignored `tmp/android-tools/`; the SDK license was explicitly approved by the user. The build script generates a local preview signing key at ignored `android/preview.keystore`. Keep this key to install later preview updates over the existing app. It is a debug key, not a Play release credential.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-preview-apk.ps1
```

Output: `output/apk/Iron-Heart-Strength-preview.apk`, with `SHA256.txt`. The script verifies the APK signature. Automated tests and browser mobile-layout checks do not replace testing on a physical phone. This APK has not been submitted to Google Play.

## Connect a real backend

Deploy the included Node backend on persistent storage behind HTTPS. Initialize a production coach account with environment variables from `.env.example`; do not expose demo mode. Allow the exact origin `https://localhost` for the native app and your actual web origin. The SQLite file must survive host restarts.

Build the native client against the real URL:

```powershell
$env:VITE_API_URL = 'https://YOUR-BACKEND-DOMAIN'
pnpm android:sync
pnpm android:open
```

The sync command checks for a hosted HTTPS URL and then rebuilds/copies web assets. `VITE_API_URL` is public build configuration, not a secret. Do not put server secrets in `VITE_` variables. The Android app uses bearer sessions held only in memory and asks for sign-in after restarting. It requires connectivity to log workouts.

## Build and test

1. Review the application ID before first Play upload. Confirm you control the brand and intend to retain this permanent package ID.
2. Open `android/` in Android Studio. Install the required SDK/platform/build tools and let Gradle sync.
3. Run on an emulator and physical device. Verify login, invitation redemption, assigned programs, calendar weekdays, editing, YouTube playback, logging, deletion/redo, account deletion, network failures, keyboard behavior, and safe-area insets.
4. Verify the supplied logo appears centered in launcher and splash previews on common adaptive-icon shapes.
5. Set release `versionCode`/`versionName`. Use Android Studio's **Generate Signed App Bundle** workflow and create/select your private upload key. Keep keys/passwords outside this repository. The supplied Gradle configuration has no release signing secret.

## Play Console

Prepare your app listing, icon, phone screenshots, support contact, privacy policy URL, public account-deletion request URL, content rating, Data safety disclosures, and any applicable health-app declarations. The app's in-app account deletion is available to athletes under Account & settings. Document your actual hosting, retention, backup, and YouTube data handling rather than using a generic privacy claim.

Upload the signed AAB to internal testing, test coach and athlete roles on real devices, and resolve crashes before production. Depending on the account, Google may require closed testing: new personal developer accounts currently require at least 12 opted-in testers for 14 continuous days before requesting production access. See the [official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

The Google Play launch is a separate release step. No developer account, public hosting, signing credential, store listing, or publication has been created by this project.
