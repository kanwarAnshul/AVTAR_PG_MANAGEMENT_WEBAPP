-- 011 — Privacy policy is a real, owner-editable setting from first launch.
-- The app also has a built-in fallback, but storing it in app_settings makes
-- the policy visible as "set" in every environment (including fresh installs)
-- and lets the owner edit it from Owner → Settings → Privacy Policy.

insert into public.app_settings (key, value, updated_at)
values (
  'privacy_policy',
  'AVTAR Singh PG — Privacy Policy (v1.0)

We collect only the data needed to run your stay: name, photo, contact, KYC documents, rent and complaint records.

• KYC documents are stored in encrypted storage with signed access links.
• PAN numbers are encrypted at rest (AES-256); only the owner can view them.
• Location and presence data are used solely for safety and operations.
• We never sell personal data. You may request export or deletion anytime via the owner office.

Contact: avtar.singh@avtarpg.com · Gurgaon, Haryana.',
  now()
)
on conflict (key) do nothing;
