# 🌐 PWA & Vercel Deployment Guide

The app is a **Progressive Web App (PWA)** in addition to an Android/iOS app. Tenants, wardens and the owner can open one HTTPS link, choose **Add to Home Screen**, and use it full-screen like an installed app on iOS and Android. Updates publish by redeploying — **no app store review** is needed.

Architecture: **Expo Router SDK 58 → static web export (`dist/`) → Vercel**.

---

## ✅ Live deployment (23 November 2026)

| Field | Value |
| --- | --- |
| GitHub repo | `https://github.com/kanwarAnshul/AVTAR_PG_MANAGEMENT_WEBAPP.git` (`main`) |
| Vercel project | `avtar-pg-manager` (scope `kanwaranshuls-projects`) |
| **Production URL** | **https://avtar-pg-manager.vercel.app** |
| Deployment ID | `dpl_BWULCoV6tRaj3KBtNsAuKbUtvMiu` |
| Auto-deploy | Git repository connected — every push to `main` deploys automatically |
| Supabase `site_url` | `https://avtar-pg-manager.vercel.app` |
| Supabase redirect allowlist | `avtarpg://reset-password`, `exp://**`, `http://localhost:3000/reset-password`, `https://avtar-pg-manager.vercel.app/reset-password`, `https://avtar-pg-manager.vercel.app/**` |

Verified live: `/`, `/login` and `/forgot-password` all return HTTP 200 and render correctly; the manifest is served as `application/manifest+json`, `/sw.js` activates, and no console errors appear.

> **Important:** `.vercelignore` is required. Without it, Vercel tries to upload the generated `android/` folder (~2.5 GB) and the local APK (~105 MB) and fails with `File size limit exceeded (100 MB)`.

---

## 1. What works in the PWA

| Feature | PWA behavior |
|---|---|
| Sign-in, owner/warden/tenant portals | Same screens, same Supabase auth and row-level security |
| Password recovery | Email-only one-time recovery link; opens `/reset-password` on the deployed domain |
| Notices, property rules, privacy policy, payments, receipts | Live Supabase data only; no sample data |
| Rent receipt | Browser print dialog → **Save as PDF** (native share sheet on Android/iOS app) |
| CSV report export | Browser download (native share sheet on Android/iOS app) |
| Theme | Saved in `localStorage` (Keychain/Keystore in native app) |
| Offline | Installed app shell loads offline; an offline banner appears when the device is offline |
| Push notifications | In-app notices only on web. iOS 16.4+ users can allow PWA notifications after adding to Home Screen; native push remains in the installed apps |
| Camera / photo upload | Supported by mobile browsers; requires HTTPS |

**Privacy:** the service worker caches **only static app assets** (`/_expo/*`, icons, CSS/JS). It never caches Supabase traffic, personal data, session tokens, PDFs or uploaded photos.

---

## 2. Files that make it a PWA

| File | Purpose |
|---|---|
| `app/+html.tsx` | Adds manifest, theme color, iOS status bar and touch icon metadata to exported HTML |
| `app.json` → `web.output: "static"` | Produces a static site with one HTML file per route |
| `public/manifest.webmanifest` | `display: standalone`, portrait, name, icons |
| `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` | Home-screen icons generated from `assets/icon.png` |
| `public/sw.js` | Offline app-shell service worker; cache name `avtar-pg-shell-v1` |
| `src/hooks/useServiceWorker.ts`, `app/_layout.tsx` | Registers the service worker on web only |
| `src/lib/supabase.ts` | Web session storage + `detectSessionInUrl` for recovery links |
| `src/lib/securePrefs.web.ts`, `src/lib/fileExport.web.ts`, `src/services/receipt.web.ts` | Web fallbacks for native-only modules |
| `vercel.json` | Vercel build command, output directory, clean URLs, cache headers |

---

## 3. Environment variables — set BEFORE building

Expo inlines `EXPO_PUBLIC_*` variables at build time. Vercel must have these **Project Environment Variables** for Production (and Preview if used):

```text
EXPO_PUBLIC_SUPABASE_URL=https://nyclbmsbyrokbvgotvws.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_vz4vvOe0wPRClDvJwayb0g_V7-g2U86
```

These are **publishable** values (safe for client code; RLS protects data). Never put a service-role key or database password in `EXPO_PUBLIC_*` variables.

Locally, the values are in `.env` (git-ignored). To build manually:

```bash
npx expo export --platform web --output-dir dist
```

---

## 4. Deploy to Vercel (free Hobby plan)

### Option A — GitHub import (recommended)

1. Push this repository to GitHub (see `docs/BUILD_AND_DEPLOYMENT.md` for the push step).
2. In Vercel → **Add New… → Project**, import the repository.
3. Framework preset: **Other**. Vercel reads `vercel.json`:
   - Build command: `npx expo export --platform web`
   - Output directory: `dist`
4. Add the two environment variables from section 3.
5. Click **Deploy**. Vercel runs `npm install` then the export.
6. Note the production domain (e.g. `https://avtar-pg.vercel.app`). A custom domain can be added under **Project → Settings → Domains**.

### Option B — Vercel CLI from this folder

```bash
npm i -g vercel      # once
vercel login
vercel link          # link to a Vercel project
vercel env add EXPO_PUBLIC_SUPABASE_URL production
vercel env add EXPO_PUBLIC_SUPABASE_ANON_KEY production
vercel --prod
```

Use the same values as section 3. `vercel.json` is committed, so no dashboard build settings are required.

### After each update

Push to the connected GitHub branch, or run `vercel --prod` again. Existing installed PWAs pick up the new service worker/assets on the next launch; users may need to close and reopen the app once after a first install.

---

## 5. Supabase redirect allowlist (required for password reset)

In **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**, add:

```text
https://<your-vercel-domain>/reset-password
https://<your-vercel-domain>/**
```

For local testing add `http://localhost:3000/reset-password`. Keep the existing native entry `avtarpg://reset-password`.

Also verify **Authentication → Email Templates → Reset Password** contains the one-time link:

```html
<a href="{{ .ConfirmationURL }}">Reset password</a>
```

The template cannot be edited on the free tier with Supabase's default SMTP; the built-in reset email already includes `{{ .ConfirmationURL }}`, which is all this app needs. Recovery is **email only** — no SMS, phone number or OTP field exists in the app.

---

## 6. Install on a phone

### Android (Chrome)

1. Open the HTTPS URL.
2. Chrome menu (⋮) → **Install app** / **Add to Home screen**.
3. Open the icon — it runs full-screen without browser chrome.

### iOS (Safari)

1. Open the HTTPS URL in **Safari** (other browsers cannot install PWAs on iOS).
2. Tap **Share** → **Add to Home Screen**.
3. Tap **Add**. Open the icon from the Home Screen; it runs standalone with the configured splash/theme color.

Updates are automatic: redeploying Vercel publishes the new version without an App Store / Play Store submission.

---

## 7. Verify a deployment

1. `https://<domain>/` shows the welcome screen; `/login` and `/forgot-password` open directly.
2. Browser DevTools → Application → **Manifest** shows name, `standalone`, 192/512 icons.
3. DevTools → Application → **Service Workers** shows `/sw.js` activated.
4. Sign in with a real account; confirm role-based portal loads.
5. Submit a rent payment → browser print dialog → **Save as PDF** produces the receipt.
6. Toggle offline in DevTools → reload → app shell opens and the offline banner appears; data screens show cached shell but need the network (personal data is deliberately not cached).
7. Request a password reset link; confirm the email link opens `https://<domain>/reset-password` and completes the reset.

---

## 8. Known limitations

- Service-worker offline mode protects the **UI shell**, not live records — this is intentional for privacy. After coming back online, data reloads from Supabase.
- Web push notifications depend on browser/OS support; iOS requires adding the PWA to the Home Screen first (iOS 16.4+). The installed native apps keep the full Expo push flow.
- Opening a route as a literal `*.html` file (e.g. `/login.html`) is not a supported URL; Vercel `cleanUrls` serves clean paths such as `/login`.
- `npm install` currently reports dependency audit warnings; they do not block the static export. Review with `npm audit` when scheduling dependency upgrades.
- The Android APK already delivered (`BUILDS/avtar-pg-1.0.0-local.apk`) and a production iOS build remain separate from this PWA deployment.
