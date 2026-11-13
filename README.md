# 🏠 AVTAR SINGH PG — Mobile Management Application

> Enterprise-grade, cross-platform mobile application for **AVTAR SINGH PG** built with **React Native (Expo SDK 51/58)**, **Supabase PostgreSQL**, **Zustand**, and **TanStack Query**. Supports **Android** & **iOS** from a single performant codebase.

---

## 🌟 Key Features

### 👤 Tenant Role (Student vs Working Professional)
- **Category-specific Registration**:
  - **Student**: College name, Roll number, Course, Address proof, Photo, Family emergency contact.
  - **Employee**: Employer company, Staff ID, Work email, Aadhaar front & back, AES-256 encrypted PAN.
- **My Accommodation**: Room, bed allocation, check-in date, monthly rent, and deposit.
- **Rent Statements & On-Device PDF Receipts**: View monthly invoice balances, record cash/UPI payments, download instant PDF receipts via `expo-print` & `expo-sharing`.
- **Maintenance & Complaints**: File tickets with category (Water, Electricity, Cleaning, WiFi, etc.), attach compressed camera photos (<2MB), and get real-time status notifications.
- **Notice Board**: Pinned and emergency announcements broadcast in real time.
- **Checkout & Settlement**: Request move-out and track deposit settlement.

### 🛡️ Warden Role (Property Manager)
- **Live Operations Dashboard**: Occupancy rate percentage, pending KYC queue, overdue rent amount, and active maintenance tickets.
- **Approval Queue**: Filter by Student/Employee, review private documents via secure 60-second signed URLs, and approve with **Digital KYC Review** or **Manual Verification** (or reject with reason).
- **Visual Bed Matrix**: Color-coded bed grid (Green = Available, Red = Occupied, Amber = Maintenance).
- **Atomic Bed Allocation**: Prevents double-booking at the database engine level via `assign_bed_atomic` and PostgreSQL partial unique constraints.
- **Rent Dues Confirmation**: Record Cash and UPI payments directly on site and mark invoices paid.
- **Ticket Resolution**: Add resolution comments and mark maintenance complaints resolved.

### 👑 Owner Role (Super Admin)
- **Financial Master Dashboard**: Net Operating Surplus, total rent collections vs operating expenses, total security deposits held in escrow.
- **Idempotent Monthly Billing**: Generate invoices for all active tenancies across properties with one tap (`ON CONFLICT (tenancy_id, billing_period) DO NOTHING`).
- **Warden Management**: Create warden accounts, grant permissions, and bind them to PG properties.
- **Final Sign-off Authority**: Super admin override on approvals and access to decrypt PAN records.
- **Sanitized Financial CSV Export**: Protected against CSV formula injection (`=`, `+`, `-`, `@` stripped).

---

## 🔒 Security & Industry Standards

| Layer | Implementation |
|---|---|
| **Database Security** | Row Level Security (RLS) enabled on all 15+ PostgreSQL tables. Tenants only see their data; Wardens only see assigned properties. |
| **Document Privacy** | Stored in private Supabase Storage buckets (`tenant_docs`, `complaint_photos`) accessed exclusively via 60-second expiring signed URLs. |
| **Sensitive KYC Data** | PAN numbers stored encrypted via `pgcrypto` AES-256; only accessible to authorized admin queries. |
| **Concurrency & Double Booking** | PostgreSQL partial unique index on active `bed_allocations` (`WHERE released_at IS NULL`) + `SELECT FOR UPDATE` atomic locks. |
| **Financial Precision** | All monetary amounts stored as integer **paise** (1 INR = 100 paise) to prevent floating-point calculation errors. |
| **Theme Engine** | Full **Dark Mode** & **Light Mode** support with dynamic design tokens and theme persistence. |

---

## 📂 Project Structure

```
avtar-pg-manager/
├── app/
│   ├── _layout.tsx               # Root provider (Fonts, Theme, TanStack Query)
│   ├── index.tsx                 # Role-based intelligent redirect
│   ├── (auth)/
│   │   ├── welcome.tsx           # Onboarding splash & feature grid
│   │   ├── login.tsx             # Login with RLS & approval gate check
│   │   └── register/
│   │       ├── category.tsx      # Student vs Working Professional select
│   │       ├── student.tsx       # Multi-step Student form with validation
│   │       ├── employee.tsx      # Multi-step Employee form with KYC & PAN
│   │       └── pending.tsx       # Live status tracker awaiting review
│   ├── (tenant)/                 # Tenant Tab Group
│   │   ├── index.tsx             # Home dashboard & active bed
│   │   ├── rent.tsx              # Invoices & on-device PDF generator
│   │   ├── complaints.tsx        # Maintenance tickets & photo picker
│   │   ├── notices.tsx           # Real-time notice board
│   │   └── profile.tsx           # Details, checkout & dark mode toggle
│   ├── (warden)/                 # Warden Tab Group
│   │   ├── index.tsx             # Operations dashboard & KPIs
│   │   ├── approvals.tsx         # KYC queue with signed doc previews
│   │   ├── beds.tsx              # Interactive visual room/bed matrix
│   │   ├── dues.tsx              # Cash/UPI payment logging
│   │   └── complaints.tsx        # Ticket resolution & notes
│   └── (owner)/                  # Owner Super Admin Group
│       ├── index.tsx             # Master financial & occupancy overview
│       ├── wardens.tsx           # Add and assign property wardens
│       ├── approvals.tsx         # Final signoff & decrypted PAN view
│       ├── reports.tsx           # Idempotent billing & sanitized CSV export
│       └── settings.tsx          # System rules & security audit
├── src/
│   ├── components/ui/            # Reusable buttons, inputs, cards, dialogs
│   ├── constants/theme.ts        # Color tokens, dark/light palette, sizes
│   ├── lib/
│   │   └── supabase.ts           # Client, signed URL helper & paise math
│   ├── stores/                   # Zustand stores (Auth, Theme, Notifications)
│   ├── types/                    # Comprehensive TypeScript interfaces
│   └── utils/helpers.ts          # PAN regex, date-fns, CSV sanitizers
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql # 15 tables, enums, triggers & functions
        └── 002_rls_policies.sql   # Fine-grained RLS rules for all roles
```

---

## 🚀 Getting Started

### 1. Database Setup (Supabase)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in the Supabase Dashboard.
3. Run `supabase/migrations/001_initial_schema.sql`.
4. Run `supabase/migrations/002_rls_policies.sql`.
5. Run `supabase/SUPABASE_SETUP.sql` (this is migrations **003 + 004 + 005** combined).
   - Supabase may show a **destructive-query warning**. It is caused by one line: `DROP POLICY "users_own_notifications" ON notifications;` — it removes an old security policy only. **No table, column, schema, row or data is deleted.** It is safe to confirm.
   - The script is re-runnable: tables/columns/indexes use `IF NOT EXISTS`, and policies are created only if missing.
   - If you already ran the older 003+004 script, run **only** `supabase/migrations/005_warden_promotion.sql` (it adds the owner-only warden promotion RPC).
6. Under **Storage**, create two **private** buckets:
   - `tenant_docs`
   - `complaint_photos`

**Verify the setup** — run this in the SQL Editor and expect 5 tables + 4 functions:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tenant_requests','daily_presence','emergency_alerts','app_settings','warden_invites');

SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('owner_exists','claim_first_owner','promote_to_warden','am_i_owner');
```

### 1b. Create the first Super Admin (owner)
There is no public owner registration (that would let anyone become owner). The app uses one shared sign-in and detects the role from the database.

1. Open the app → **Sign In with Email** screen → tap **👑 First-time Super Admin? Set up owner access** (also available on the Welcome screen).
2. Enter the owner email + password and tap **Create Super Admin**.
3. If email confirmation is enabled in Supabase, confirm the email and tap the button again.
4. The account is promoted to `owner` **once**, then the setup screen locks permanently.
5. Wardens are created later from the owner portal; tenants use **New Tenant? Register Here**.

### 2. Configure Environment
Create a `.env` file in `avtar-pg-manager/` based on `.env.example`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run Development Server
```bash
npm install
npx expo start
```
- Press `a` for Android Emulator or scan QR with Expo Go app on your physical device.
- Press `i` for iOS Simulator.
- Press `w` for Web preview.
- Sign in with a real account (owner / warden / approved tenant). No demo accounts — all data is live from Supabase.

---

## 🧪 Automated Real-Time & Concurrency Tests

The project includes an end-to-end automated test suite verifying database atomic locking, high-concurrency race condition prevention, financial accuracy, and security:

```bash
# Run all 19 automated tests
npm test

# Run TypeScript type check (0 errors)
npm run typecheck
```

### Test Coverage Highlights:
- **100 Concurrent Requests Test:** Simulates 100 simultaneous tenants attempting to book the same bed; asserts that strictly 1 succeeds and 99 fail with conflict.
- **Paise Precision & FIFO Payments:** Verifies zero floating-point drift across payments and automated multi-invoice split.
- **Security & KYC:** Indian PAN format verification, dual Student/Employee schema rules, sanitized CSV formula injection defense.
- **Real-Time Notifications:** Simulates postgres changes triggers and unread counter badge calculation.
- **Cross-Platform Responsiveness:** WCAG touch target compliance (≥48dp) and responsive layouts from 320px to 768px+.

---

## 📱 Building Production Binaries

### Android (APK) — local build, no EAS

**Requirements (one-time, on the build machine):**
- **JDK 17** — `winget install EclipseAdoptium.Temurin.17.JDK`
- **Android SDK** — via Android Studio, or `sdkmanager` (needs `platform-tools`, a `platforms;android-3x`, `build-tools` and `ndk`)
- Windows long paths enabled (`LongPathsEnabled = 1`) — avoids the classic `path too long` Gradle failure

**Build (one command):**
```powershell
npm run build:apk
```
or with options:
```powershell
# regenerate android/ from app.json (do this after changing icons, splash, plugins)
powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1 -Clean

# faster, smaller APK for modern phones only
powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1 -Architectures arm64-v8a
```

The script finds JDK 17 + the Android SDK, writes `android/local.properties`, runs `:app:assembleRelease`, and copies the result to `avtar-pg-<version>-local.apk` in the project root.

Manual equivalent:
```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release.apk
```

**Notes:**
- **Windows long paths:** two things are needed, and the script handles both.
  1. The Android SDK's bundled **ninja 1.10.2** is capped at 260 characters and fails with `ninja: error: mkdir(CMakeFiles/...): No such file or directory` on React Native's codegen paths. The script checks the installed ninja version and, if it is older than 1.12, drops in a long-path capable build (the original is kept as `ninja-<version>.bak.exe` next to it).
  2. If the project path is longer than 45 characters, the script mirrors the project to a short staging folder (`C:\bld`) and builds there, then copies the APK back. Pass `-WorkDir C:\some\short\path` to change it, or `-NoStage` to disable (only if your project path is already short).

  If the ninja download is blocked (offline machine), grab `ninja-win.zip` from https://github.com/ninja-build/ninja/releases and replace `<SDK>\cmake\3.22.1\bin\ninja.exe` manually.
- The release APK is signed with the **debug keystore** (Expo default), so it installs fine on phones but **cannot be uploaded to Play Store**. Use EAS or a custom keystore for store builds.
- `EXPO_PUBLIC_*` values are read from `.env` at bundle time — keep `.env` present when building locally.
- `android/` and `ios/` are generated (Continuous Native Generation). Never edit them by hand; change `app.json`/config plugins and re-run `-Clean`.
- If Gradle reports a Java version error, `JAVA_HOME` is pointing at a JDK newer than 17 — the script overrides it for the build.

### Android (APK/AAB via EAS — cloud, no local Android SDK needed)
```bash
npx eas-cli build --platform android --profile preview --non-interactive   # APK
npx eas-cli build --platform android --profile production                  # AAB for Play Store
```

### iOS (IPA via EAS Build)
```bash
# 1. Install EAS CLI
npm install -g eas-cli
eas login

# 2. Configure project & build
eas build:configure
eas build --platform ios
```

