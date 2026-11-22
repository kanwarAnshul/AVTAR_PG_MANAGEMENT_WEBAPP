# AVTAR SINGH PG — Documentation

Professional handover documentation for the multi-role PG management app (Expo / React Native 0.88 / SDK 58, Supabase backend).

## Start here

| Document | Purpose |
| --- | --- |
| [USER_GUIDE.md](USER_GUIDE.md) | How the Owner, Warden and Tenant use the app day to day |
| [APP_FLOWS.md](APP_FLOWS.md) | Mermaid flow diagrams for sign-in, approvals, checkout and money flow |
| [PRIVACY_POLICY.md](PRIVACY_POLICY.md) | Tenant-facing privacy notice (owner can replace it in-app) |
| [TERMS_AND_CONDITIONS.md](TERMS_AND_CONDITIONS.md) | Tenant terms and the mandatory login acceptance gate |
| [SECURITY_AND_LEGAL.md](SECURITY_AND_LEGAL.md) | Security controls, data handling and legal caveats before public launch |
| [BUILD_AND_DEPLOYMENT.md](BUILD_AND_DEPLOYMENT.md) | Android/iOS build status, install steps and verification record |
| [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md) | Email-only password recovery (authoritative; replaces the retired SMS/OTP setup) |
| [MASTER_PROMPT_APP_WORKFLOW.md](MASTER_PROMPT_APP_WORKFLOW.md) | Original workflow blueprint (historical; SMS/OTP notes superseded) |

## One-minute orientation

- **One login for everyone.** Email + password, role read from `profiles.role` on the server. A client-supplied role is never trusted. The first owner is created by the one-time Super Admin setup screen; the owner then creates wardens.
- **Live data only.** No demo/sample records ship in the app. Every list is a Supabase query protected by Row Level Security.
- **Three portals:** Owner (`/(owner)`), Warden (`/(warden)`), Tenant (`/(tenant)`).
- **Terms gate:** tenants must accept the owner's Terms before entering; acceptance is re-requested whenever the owner edits the text.
- **Email-only recovery:** forgot-password sends a one-time Supabase recovery link; no SMS provider or OTP is used. See [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md).
- **PDF receipts:** after a rent payment is recorded, a live-data PDF receipt opens for the tenant, warden or owner to save.

## Support contacts

Owner office: `avtar.singh@avtarpg.com` · Gurgaon, Haryana.
