# Build, install and verification record

## Android — client APK (delivered)

| Field | Value |
| --- | --- |
| File | `avtar-pg-1.0.0-local.apk` in `BUILDS/` |
| Size | 110,291,234 bytes (~105 MB) |
| Built | 23 November 2026 |
| SHA-256 | `7FF024BF34726BA1AACF14631B6449DAEA98334C84C18EB982AAE2F32DCC835D` |
| Package | `com.avtarsingh.pgmanager` |
| Version | 1.0.0 (versionCode 1) |
| Min SDK | 24 (Android 7.0) · target 36 · compile 37 |
| Signing | v2, `CN=Android Debug`, cert SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (same as previous build, so `adb install -r` upgrades) |
| Verification | `apksigner verify` exit 0, v2 scheme valid |
| Source | the delivery commit containing this rebuild (see `git log`) |

**Install:** copy to the phone, allow *Install unknown apps*, tap the APK. For an existing install: `adb install -r avtar-pg-1.0.0-local.apk`.

**What is new in this build (owner-reported issues):**

1. **Warden creation** works with an existing property; property picker, explicit FK hints and a "Create Property first" path replace the broken memberships join.
2. **Property House Rules** can be authored on first login (prompt on the dashboard) or from Settings; they are pinned and published to tenants of every property.
3. **Privacy Policy** is seeded live and its status/visibility is shown in Owner Settings; the tenant policy screen reads the live value.
4. **Password recovery is email-only** — the SMS/OTP flow, provider card and "Get an OTP" labels are gone; a one-time Supabase recovery link opens the new-password screen. See [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md).
5. **PDF rent receipts** are generated from live payment/invoice rows after submission and can be re-downloaded from tenant Payment History, Warden Dues and Owner Reports.

**Build from source:** `npx expo prebuild`, then `npx expo run:android --variant release` (or `eas build --platform android --profile preview`).

The delivered APK is **not** Play Store ready: the debug certificate cannot be used for Play uploads. Use `eas build --platform android --profile production` with a managed keystore and submit the AAB.

## Web / PWA — static export

| Field | Value |
| --- | --- |
| Export command | `npx expo export --platform web --output-dir dist` |
| Hosting | Vercel (Hobby/free plan), configured by committed `vercel.json` |
| Build command on Vercel | `npx expo export --platform web` |
| Output directory | `dist` (git-ignored locally) |
| Routes produced | 68 static HTML routes |
| Env vars at build time | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Service worker | `public/sw.js` → `dist/sw.js`, cache `avtar-pg-shell-v1` |
| PWA metadata | `app/+html.tsx`, `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` |
| Web fallbacks | `src/lib/securePrefs.web.ts`, `src/lib/fileExport.web.ts`, `src/services/receipt.web.ts` |
| Deployment status | Code and config ready; Vercel project/env vars/domain still to be provisioned by the owner |

**Verified locally:** static export succeeds; welcome/login/forgot-password routes render in a browser with no console errors; service worker activates and caches the offline shell; the web bundle contains the print-to-PDF receipt path and no native `expo-print`/`expo-file-system` calls. `npx tsc --noEmit` passes and `npx expo lint` reports 0 errors.

The full deployment, Supabase redirect allowlist and phone install instructions are in **[PWA_AND_VERCEL_DEPLOYMENT.md](PWA_AND_VERCEL_DEPLOYMENT.md)**.

## iOS — status

- The source is configured for iOS (bundle id `com.avtarsingh.pgmanager`, info.plist camera/photo permissions, EAS profiles in `eas.json`).
- A **cloud simulator build succeeded** on 22 Nov 2026 — EAS build id `99ce2195-f75f-4d38-8c4e-e74f901f2865` (profile `simulator`). It proves the iOS native project and JS bundle compile and package.
- The simulator artifact can only run in Xcode's iOS Simulator on a Mac. It is **not** an installable iPhone build.
- A production `.ipa`, TestFlight rollout and hands-on iPhone testing require an **Apple Developer Program account** and either a Mac/Xcode or EAS cloud signing plus TestFlight testers. `app.json` now declares `ITSAppUsesNonExemptEncryption: false` to avoid an App Store Connect questionnaire at submission.

## Verification record

**Backend (live Supabase, 22 Nov 2026)**

- Post-migration suite: **10/10** — migrations 007–010 objects, checkout/archive schema, RLS, six policies, realtime publication, terms gate seeded ON, email-only recovery config.
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
2. Run `supabase/SUPABASE_SETUP.sql` in the SQL Editor, then migrations `007`–`011` in `supabase/migrations/` in order (`011_privacy_policy.sql` seeds the live privacy policy).
3. Put the URL and publishable key in `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (and in EAS secrets for cloud builds). Never put a secret/service key in the app.
4. Use the app's first-run Super Admin setup to create the owner. Email confirmation should be OFF (`mailer_autoconfirm = true`).
5. Allowlist the recovery redirect `avtarpg://reset-password` (native) and `https://<your-vercel-domain>/reset-password` (PWA) in Supabase Auth → URL Configuration, and confirm the email provider is enabled. Password recovery is email-only; no SMS provider, DLT registration or SMTP customisation is required on the free tier. See `PASSWORD_RECOVERY.md` and `PWA_AND_VERCEL_DEPLOYMENT.md`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login says "Invalid login credentials" | Email/password spelling; account exists in Supabase Auth and is confirmed |
| Tenant blocked at login | Registration status must be `approved` and profile `is_active = true` |
| Blank lists | RLS filters by property; confirm the user's property membership/tenancy |
| Upload fails | Signed-in session present; private bucket policies from migration 006 |
| No recovery email arrives | Wrong email on profile, spam folder, mailer rate limit, or redirect not allowlisted |
| App returns to login after restart | `expo-sqlite/localStorage/install` import and `expo-sqlite` config plugin must be present |
