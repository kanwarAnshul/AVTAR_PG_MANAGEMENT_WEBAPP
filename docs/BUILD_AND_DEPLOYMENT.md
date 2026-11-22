# Build, install and verification record

## Android — client APK (delivered)

| Field | Value |
| --- | --- |
| File | `avtar-pg-1.0.0-local.apk` in `BUILDS/` |
| Size | 110,283,226 bytes (~105 MB) |
| SHA-256 | `FC3D47F9FBEC191A36B9ACFBD30DB404B131766405FB008F067D9B7ACA9D1117` |
| Package | `com.avtarsingh.pgmanager` |
| Version | 1.0.0 (versionCode 1) |
| Min SDK | 24 (Android 7.0) · target 36 · compile 37 |
| Signing | v2, `CN=Android Debug` (same cert as previous build, so `adb install -r` upgrades) |
| Source | commit `53750dc` |

**Install:** copy to the phone, allow *Install unknown apps*, tap the APK. For an existing install: `adb install -r avtar-pg-1.0.0-local.apk`.

**Build from source:** `npx expo prebuild`, then `npx expo run:android --variant release` (or `eas build --platform android --profile preview`).

The delivered APK is **not** Play Store ready: the debug certificate cannot be used for Play uploads. Use `eas build --platform android --profile production` with a managed keystore and submit the AAB.

## iOS — status

- The source is configured for iOS (bundle id `com.avtarsingh.pgmanager`, info.plist camera/photo permissions, EAS profiles in `eas.json`).
- A **cloud simulator build succeeded** on 22 Nov 2026 — EAS build id `99ce2195-f75f-4d38-8c4e-e74f901f2865` (profile `simulator`). It proves the iOS native project and JS bundle compile and package.
- The simulator artifact can only run in Xcode's iOS Simulator on a Mac. It is **not** an installable iPhone build.
- A production `.ipa`, TestFlight rollout and hands-on iPhone testing require an **Apple Developer Program account** and either a Mac/Xcode or EAS cloud signing plus TestFlight testers. `app.json` now declares `ITSAppUsesNonExemptEncryption: false` to avoid an App Store Connect questionnaire at submission.

## Verification record

**Backend (live Supabase, 22 Nov 2026)**

- Post-migration suite: **10/10** — migrations 007–010 objects, checkout/archive schema, RLS, six policies, realtime publication, terms gate seeded ON, SMS demo default.
- Multi-user concurrency and isolation: **11/11** — three role logins, concurrent dashboard reads and writes, tenant isolation from the real owner's property, anonymous blocked, all test rows cleaned.
- Auth: owner/warden/tenant password logins all return sessions; scoped REST reads correct for each role.

**Android UI (emulator)**

- Owner dashboard, warden dashboard, tenant dashboard all render.
- Sign-in now navigates immediately to the role portal/session gate (no restart needed).
- Session survives a full app restart.
- Tenant Terms gate: read-to-end + checkbox + Accept → tenant portal; acceptance stored.
- Emulator touch input is occasionally unstable (SystemUI ANR), so a short physical-device pass is still recommended.

## Database setup on a fresh Supabase project

1. Create a Supabase project; note the URL and publishable (anon) key.
2. Run `supabase/SUPABASE_SETUP.sql` in the SQL Editor, then migrations `007`–`010` in `supabase/migrations/` in order.
3. Put the URL and publishable key in `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (and in EAS secrets for cloud builds). Never put a secret/service key in the app.
4. Use the app's first-run Super Admin setup to create the owner. Email confirmation should be OFF (`mailer_autoconfirm = true`).
5. Configure SMTP for email reset links and a real SMS provider for OTP (see `SMS_PROVIDER_SETUP.md`).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login says "Invalid login credentials" | Email/password spelling; account exists in Supabase Auth and is confirmed |
| Tenant blocked at login | Registration status must be `approved` and profile `is_active = true` |
| Blank lists | RLS filters by property; confirm the user's property membership/tenancy |
| Upload fails | Signed-in session present; private bucket policies from migration 006 |
| No OTP arrives | SMS demo mode still ON or provider/DLT not configured |
| App returns to login after restart | `expo-sqlite/localStorage/install` import and `expo-sqlite` config plugin must be present |
