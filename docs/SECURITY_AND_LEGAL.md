# Security and legal readiness

## What is implemented

| Area | Control |
| --- | --- |
| Authentication | Supabase GoTrue, email + password; role always read from `profiles.role` on the server. Client-supplied roles are never trusted. |
| Session storage | SQLite-backed `localStorage` adapter; refresh loop tied to foreground/background. |
| Authorisation | Row Level Security on all data tables. Tenant sees only own records and own property; warden sees assigned property; owner sees owned property. Anonymous reads return zero rows. |
| Private documents | `tenant_docs` bucket is private; access through 60-second signed URLs. No public object URLs. |
| Sensitive identifiers | PAN encrypted at rest (AES-256) via `decrypt_pan`; only owner can decrypt. |
| Consent | Tenant Terms gate ON by default, timestamped acceptance in `profiles.terms_accepted_at`, re-prompt after edits. |
| Rejections | Mandatory reason enforced in the approval flow. |
| Checkout | Archive-first, then irreversible deletion of documents/records/login; audit notification to owner. |
| Input handling | Zod form validation, server-side RPC validation, friendly errors (no raw SQL leaks to UI). |
| Password recovery | Email-only, single-use Supabase recovery link; no SMS provider, phone OTP or demo mode. Redirect `avtarpg://reset-password` allowlisted. |

## Verification performed

- Post-migration backend suite: **10/10** (schema, RPCs, RLS, policies, realtime, terms gate, email-only recovery config).
- Live multi-user test: **11/11** — three roles logged in, read dashboards and wrote records concurrently; tenant RLS isolation confirmed against the real owner's property; anonymous access blocked; test rows deleted.
- Android UI smoke: owner, warden and tenant portals rendered; tenant Terms gate, sign-in navigation and session persistence verified on emulator.

## Known gaps to close before public / Play Store launch

1. **Debug-signed APK.** Direct install works and upgrades in place, but Google Play needs a release keystore and an AAB. Use EAS with a managed Android keystore.
2. **iOS unverified on device.** Windows has no Xcode. A cloud simulator build proves compilation; production IPA and TestFlight need an Apple Developer account (99 USD/year) and an iPhone or TestFlight testers.
3. **Recovery email deliverability.** Password reset relies on Supabase's built-in mailer; the `avtarpg://reset-password` redirect must stay allowlisted. Custom sender/templates require a paid plan with SMTP. See [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md).
4. **No in-app "delete my account" screen.** Required by Google Play's account-deletion policy; checkout deletion exists but is owner-approved, not self-service.
5. **Legal review.** The Privacy Policy and Terms in this repo are product templates, not legal advice. Confirm Haryana tenancy law, notice periods, refund/deposit rules, grievance officer and jurisdiction clauses with counsel. Display the owner's registered business name and address.
6. **Backup and incident plan.** Enable Supabase point-in-time recovery on a paid plan; document who can rotate the service key and revoke tokens.

## Handling the temporary verification credentials

All verification accounts (`uitest.*`) and their test property are deleted after testing. The real owner account `karpit757@gmail.com` and property `property437` are never modified. Supabase Management tokens used for migrations are revoked at the end of the handover; the app only ships the public anon/publishable key, which is safe because RLS enforces access.

## Safe operational practices

- Never paste the service-role/secret key into the app, `.env`, screenshots or chat.
- Rotate the publishable key in Supabase if it is ever exposed in a public repository, then rebuild.
- Keep `.env` out of git; use EAS secrets for cloud builds.
- Review Supabase Auth logs and storage access logs weekly.
