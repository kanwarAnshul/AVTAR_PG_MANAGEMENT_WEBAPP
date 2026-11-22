# AVTAR Singh PG — Terms & Conditions (v1.0)

These are the terms seeded in the live app and shown to every tenant at sign-in. The owner can edit the text in **Owner → Settings → Terms & Conditions**; when the text changes, every tenant is asked to accept it again at their next login.

These terms apply to every tenant staying at AVTAR Singh PG. By accepting them you agree to the following:

1. **REGISTRATION** — Every tenant must complete one-time registration with valid ID proof and contact details before move-in. Details must be kept up to date.
2. **RENT & PAYMENTS** — Rent is due on the due day shown in the app each month. Late payment may attract a fine. Payments are recorded in the app; ask the office for a receipt.
3. **DEPOSIT** — A security deposit is collected at move-in and adjusted against damages, unpaid dues or missing items at checkout.
4. **CONDUCT** — No loud music after 10 PM, no smoking or alcohol inside rooms, and no guests overnight without prior permission from the warden.
5. **ROOM & BED** — The allotted room and bed may not be changed or shared without written approval from the owner.
6. **DOCUMENTS** — KYC documents uploaded in the app are used only for verification. They are deleted when your tenancy is completed at checkout.
7. **CHECKOUT** — Checkout requires submitting a request in the app with date, time and feedback. On owner approval all your personal documents and records are permanently deleted from the app and archived as a former tenant.
8. **LIABILITY** — The management is not responsible for loss of personal valuables. Use the provided lockers and inform the warden of any security concern.
9. **TERMINATION** — The owner may ask a tenant to vacate for rule violations, with reasonable notice.
10. **CHANGES** — The owner may update these terms; you will be asked to accept the updated version at your next login.

Contact: `avtar.singh@avtarpg.com` · Gurgaon, Haryana.

## Acceptance record

Acceptance is stored server-side as `profiles.terms_accepted_at` with the timestamp of the click. The gate compares that timestamp with `terms_updated_at`; if the Terms are newer, acceptance is requested again. Wardens and the owner are not gated. Declining signs the tenant out.

> This document is a product template, not legal advice. Have local counsel review the final wording, notice period and dispute/venue clauses for Haryana before onboarding paying customers.
