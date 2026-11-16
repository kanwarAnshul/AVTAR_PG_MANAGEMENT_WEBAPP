# SMS / OTP Provider Setup — AVTAR SINGH PG

**Who this is for:** the Super Admin (owner) or the developer running the build.

**Current state (verified against live Supabase on 16 Nov 2026):**

| Part | Status |
| --- | --- |
| OTP generation, hashing, expiry, attempt limits | ✅ working, tested end-to-end on the live DB |
| Password actually changed after OTP | ✅ verified (new password signs in, old one is rejected) |
| `pg_net` (outbound HTTP from Postgres) | ⚠️ must be enabled — migration 007 does it |
| Provider credentials + DLT registration | ❌ **your side only** (needs business KYC) |
| Provider response verification | ✅ ready in migration 007 (waits for the real HTTP reply) |
| One-tap test message from the app | ✅ Owner → Settings → SMS OTP → "Send Test SMS" |

---

## 1. What only YOU can do (and why I can't do it)

Getting a live SMS sender in India requires a registered business identity:

1. **A provider account** — Fast2SMS, MSG91, Textlocal, 2Factor, etc. Sign-up needs your
   PAN/GST number, business address, a working email and a phone number.
2. **DLT registration** — the Indian telecom TRAI rule. Your sender ID and each message
   template must be registered on a DLT platform (Jio, Airtel, Vodafone Idea) before a
   transactional SMS can be delivered. Approval takes **3–7 working days**.
3. **A DLT-linked template** — the OTP message text must match your registered template
   word-for-word, otherwise the provider rejects it at send time.

I cannot create any of these on your behalf — they are legally bound to your business
identity and need your signature/KYC. Everything *around* it (the code, the plumbing, the
error handling, the test tooling) is done and waiting.

---

## 2. Apply migration 007 first (1 minute)

Supabase Dashboard → **SQL Editor** → New query → paste the whole file → **Run**.

```
supabase/migrations/007_sms_hardening.sql
```

(Or paste `supabase/SUPABASE_SETUP.sql`, which now contains 003→007 in one file.)

It adds:

| Object | Purpose |
| --- | --- |
| `CREATE EXTENSION pg_net` | lets Postgres make outbound HTTPS calls |
| `sms_response_error(status, body)` | turns a provider's reply into a readable error |
| `send_sms_otp()` (rewritten) | now **waits up to 12 s for the provider's real answer** instead of assuming success |
| `request_password_otp()` (rewritten) | reports success only on a genuinely delivered SMS |
| `sms_status()` | owner-only health check (provider set? key present? pg_net on? demo mode?) |
| `sms_send_test(phone)` | owner-only test message that returns the provider's raw reply |

> If `CREATE EXTENSION pg_net` fails with *"must be installed by superuser"*, run that
> one line on its own as the `postgres` role and then re-run the file.

**Verify it landed:**

```sql
SELECT public.sms_status();
```

Expected (before you configure a provider):

```json
{"provider":"none","has_api_key":false,"dev_mode":true,"pg_net_enabled":true,"ready":false,
 "problem":"No SMS provider selected."}
```

---

## 3. Choose your provider

### Option A — Fast2SMS (recommended for India, cheapest)

| Field | Where to get it |
| --- | --- |
| API key | Fast2SMS dashboard → **Bulk SMS** → API key (looks like `xxxxx-xxxxx`) |
| Sender ID | A 6-letter header you registered on DLT, e.g. `AVTPG` |
| DLT template | Your registered OTP template ID (needed for transactional SMS) |

In the app: Owner → **Settings → SMS OTP** → provider `fast2sms` → paste key + sender ID → Save.

### Option B — MSG91

| Field | Where to get it |
| --- | --- |
| Auth key | MSG91 dashboard → Account → API keys |
| Template ID | MSG91 → **Templates** → your approved OTP template |
| Sender ID | Registered with MSG91 |

Provider `msg91` → auth key + template ID → Save.

### Option C — Your own server (webhook)

If you already have a backend, point the app at it. It receives a JSON POST:

```json
{ "to": "+919876543210", "message": "Your AVTAR SINGH PG verification code is 123456...",
  "otp": "123456", "sender": "AVTPG", "api_key": "..." }
```

Provider `webhook` → your URL → Save.

---

## 4. DLT (the part that takes time — start it now)

For **transactional** SMS (your OTP) in India:

1. Register as a **Principal Entity** on a DLT platform (Jio/Airtel/Vodafone).
2. Register your **brand** and get a **Content Template** for the OTP message.
3. Link your sender ID with the template.
4. Give the resulting **DLT template ID** to your SMS provider.

**Practical tip:** while DLT is pending, keep **Demo mode ON**. The app then shows the OTP
on screen instead of sending it — every other part of the flow (generation, expiry,
attempts, password change) behaves exactly the same. You can test the whole password-reset
journey today and switch to real SMS when DLT clears.

Do **not** ship with Demo mode ON in production — it would let anyone who knows the
mobile number see the OTP.

---

## 5. Switch to real SMS and verify

1. Owner → **Settings → SMS OTP**
2. Provider = `fast2sms` (or your choice) → paste API key + sender ID → **Save**
3. The card below now shows a live health check:
   - `✅ Gateway configured`
   - `• pg_net (outbound HTTP): enabled`
   - `• Demo mode: ON / OFF`
4. Enter your mobile number → **Send Test SMS**
   - ✅ *"Test message sent"* → the provider accepted it. Check your phone.
   - ❌ *"Test message failed"* → the popup shows the provider's **own complaint**
     (invalid key, unapproved sender, template mismatch). Fix that and retry.
5. Turn **Demo mode OFF** → **Save**.
6. Try the real flow: Forgot password → enter the tenant's number → OTP arrives by SMS.

---

## 6. If you would rather not use SMS at all

The app now has a **second channel that needs no SMS vendor**: *Send reset link by email*.

- Supabase sends the recovery email (their built-in mailer).
- The link opens the app through `avtarpg://reset-password` and lets the user set a new password.

To make it work for real users (not just project members):

1. Supabase Dashboard → **Project Settings → Email** → SMTP settings.
2. Use any SMTP service — **Resend**, **Brevo**, **Postmark** all have free tiers,
   need only an API key, and require **no DLT and no business KYC**.
3. Add the redirect URL: **Authentication → URL Configuration → Redirect URLs** → add
   `avtarpg://reset-password` (and set the Site URL to something valid).

Then users can always recover access by email even if the SMS provider is down.

---

## 7. Housekeeping

The self-test account created while verifying the OTP flow can be removed with:

```sql
DELETE FROM auth.users WHERE email = 'otp.selftest.1794821074440@example.com';
```

(It cascades to `profiles`, `tenant_registrations` and every other table that references it.)

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| OTP appears on screen instead of arriving by SMS | Demo mode is ON | Settings → SMS OTP → turn Demo mode OFF → Save |
| *"SMS service is not configured yet"* | provider = none, or no API key | choose a provider and paste the key → Save |
| *"SMS service settings are incomplete"* | missing sender id / template id / webhook url | fill the field the health card highlights |
| Test message fails with `HTTP 401` | wrong API key | copy it again from the provider dashboard |
| Test message fails with *"sender id not approved"* | sender ID not registered on DLT | register the header on DLT first |
| Test message fails with *"template not approved"* | DLT template missing or text mismatch | register the template; use the exact approved wording |
| Provider accepts it, phone gets nothing | number on DND, or delivery to a non-Indian number | try a different number; check the provider's delivery report |
| `pg_net` not enabled | extension missing | run `CREATE EXTENSION pg_net;` in the SQL Editor |
| Nothing happens at all after "Send Test SMS" | migration 007 not applied | run `007_sms_hardening.sql` |

---

## 9. One-line summary

> The OTP system is **finished and tested**. To go live you need a provider account and a
> DLT registration — both legally tied to your business identity, so they are the only
> steps I cannot perform for you. Everything else (pg_net, error handling, self-test,
> email fallback) is already in place and waiting for your key.
