# How to use the app effectively

## Common to everyone

1. **Sign in** with the email and password your office gave you. The app detects your role automatically — there is no role dropdown.
2. **Theme:** use the sun/moon control to switch light, dark or device-following. Your choice is saved per account.
3. **Offline banner:** if the internet drops, an animated banner appears; data resumes syncing when you are back online.
4. **Forgot password:** tap *Forgot password? Reset via email*. Enter the email address on your account. Supabase emails you a one-time recovery link — open it on this device to reach the new-password screen. No SMS, mobile number or OTP is involved. See [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md).
5. **On the web:** open the app link in Chrome (Android) or Safari (iPhone), then choose *Add to Home Screen* / *Install app*. It opens full-screen like a normal app and updates automatically. Receipts use the browser's *Save as PDF*. See [PWA_AND_VERCEL_DEPLOYMENT.md](PWA_AND_VERCEL_DEPLOYMENT.md).
6. **Privacy and Terms** are always available under **Profile**.

## For the Owner (Super Admin)

**Best weekly routine**

1. **Overview** — check occupancy, pending KYC, cash flow and tenant count.
2. **Approvals** — review new registrations. Reject with a reason; approve only after documents look correct.
3. **Wardens** — create warden logins and assign them to a property. The warden is invited by push or email. Never share your own login.
4. **Rooms** — set room/bed inventory, sharing type, rent and deposit.
5. **Property House Rules** — on first login you are prompted to write the rules; they are pinned and shown to every tenant. Update them any time from **Settings → Property House Rules**. Publish other notices and fines from **Notices**.
6. **Reports** — generate monthly invoices (safe to tap twice — duplicates are skipped), export CSV and download a PDF receipt for any recorded payment.
7. **Profile / Settings** — keep each user's email address current (password recovery is email-only), author the Privacy Policy and Terms, control the tenant Terms gate, and review the **Former Tenants** archive.
8. **Checkout requests** — approve only after confirming dues and handover. You will see an explicit warning: approval archives the tenant and permanently deletes their documents and login. Rejection needs a mandatory reason.

**Tips**

- The owner is the only role that can see the former-tenant archive and decide checkout requests.
- Turn the Terms gate off only if you have a separate signed paper process.
- If a tenant says they cannot log in, check `is_active` and registration status before resetting anything.

## For the Warden

1. **Approvals** — open the KYC queue; verify ID/address proof and approve or reject with a reason.
2. **Beds** — use the bed grid to allocate or release beds atomically; two tenants cannot get the same bed.
3. **Dues** — record cash/UPI receipts; the tenant sees the updated status and a PDF receipt opens for you to hand to the tenant or save for the office.
4. **Complaints / Requests** — triage tickets, set priority and close with a resolution note.
5. **Presence** — mark daily presence; used for safety and occupancy checks.
6. **Notices** — read owner-published notices and fines.
7. **Profile** — keep your contact details current and sign out at the end of a shared-device shift.

## For the Tenant

1. **First login** — you must read and accept the owner's Terms. Acceptance is recorded; if the owner edits the Terms you will be asked again.
2. **Home** — your room, bed, rent, deposit, check-in date and dues summary.
3. **Pay / Dues** — see what is due and when. Rent due day is your allocation date. You may change it **only before the 15th** of the month. After submitting a payment you get a PDF receipt; you can re-download it any time from Payment History.
4. **Requests** — raise maintenance or other requests.
5. **Complaints** — file a complaint with category and description; add a photo if needed.
6. **Notices** — read pinned rules and fines.
7. **Profile** — update contact details, change password, read Privacy Policy and Terms, and switch theme.
8. **Checkout** — when leaving, open **Profile → Initiate Checkout**, enter the exact date, time and feedback, and submit. You can have only one pending request. After the owner approves, your data and login are permanently deleted — download anything personal beforehand.

**Tips**

- Keep your email address correct: one-time password recovery links are emailed to it.
- Do not upload unrelated documents; only KYC evidence is needed.
- Emergencies: use the emergency alert so the owner and warden are notified immediately.
