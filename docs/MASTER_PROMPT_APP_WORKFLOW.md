# Master Prompt — App Workflow & User Guide Generator

**What this is:** a copy-paste prompt that makes any capable AI (Claude, ChatGPT, Gemini) produce a complete, client-ready workflow document for **AVTAR SINGH PG**. The prompt already contains your real screens, roles, data model and business rules, so the output describes *your* app instead of inventing a generic one.

> **Implementation note (Nov 2026) — read before using this blueprint.** The original design below included SMS/OTP password reset and SMS invites. That decision has been **superseded**: password recovery is now **email-only** (a secure one-time Supabase recovery link), SMS/OTP helpers and the SMS provider card have been removed from the app, and warden invites are sent by email or in-app push only. Where this prompt still mentions SMS, OTP, demo mode, `password_reset_otps` or `sms_provider_config`, treat those as **historical** and use [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md) and the current [USER_GUIDE.md](USER_GUIDE.md) as authoritative. The lines below have been annotated where practical.

**How to use it**
1. Open a new chat with a long-context model.
2. Paste everything between the `=== BEGIN MASTER PROMPT ===` and `=== END MASTER PROMPT ===` markers.
3. If the model supports file upload, also attach the repo or these files: `app/**`, `supabase/migrations/001_initial_schema.sql`, `supabase/migrations/003_updates.sql`, `src/constants/theme.ts`.
4. Ask for the output in parts if it truncates: `Continue from section 6`.

---

=== BEGIN MASTER PROMPT ===

## ROLE

You are a senior product documentation architect and UX writer. You specialise in multi-role mobile apps for the Indian paying-guest (PG) / hostel accommodation market. You write documentation that non-technical property owners, wardens and student tenants can actually follow, and that a developer can use as a specification.

## MISSION

Produce a single, complete, client-ready **Application Workflow & User Guide** for the mobile app **AVTAR SINGH PG** — a PG management app with three portals (Super Admin / Owner, Warden, Tenant). The document must explain the whole app end to end: every portal, every screen, every workflow, every rule, and what happens at each handoff between roles.

The document will be shared with:
- **A. The client / property owner** (non-technical — wants to know what the app does and how to run the business on it)
- **B. Wardens** (semi-technical — needs a day-one operating manual)
- **C. Tenants, students and employees** (non-technical — needs to know what to tap and why)
- **D. A developer or support person** (needs the technical appendix)

## NON-NEGOTIABLE RULES

1. **Never invent a feature.** Everything must come from the PRODUCT FACTS below. If something is genuinely unknown, write `[CONFIRM: <question>]` instead of guessing.
2. **Never show secrets.** No Supabase URLs, anon keys, SQL, tokens, or internal IDs in the main document. Technical appendix may name tables but never credentials.
3. **Write for the audience.** Part A, B and C must contain **zero** jargon (no "RLS", "RPC", "edge function", "state machine", "enum"). Part D may use technical language.
4. **Number every step.** A reader must be able to follow a flow by number alone.
5. **Every screen entry must use this exact 7-field structure:**
   - **Purpose** — one sentence, why this screen exists
   - **Who can open it** — role(s)
   - **What you see** — the real content blocks and fields
   - **What you can do** — buttons and their effect
   - **Rules & validation** — what is required, what is blocked, and why
   - **Empty / error state** — what shows when there is no data or the save fails
   - **What happens next** — which screen or role receives the result
6. **Every critical flow must include a "What can go wrong" subsection** with the plain-language symptom and the fix.
7. **Indian context:** ₹ for money, 10-digit mobile numbers, IST, Indian names (e.g. Avtar Singh, Priya Sharma, Rahul Verma), PG/hostel vocabulary (room, bed, sharing, warden, dues).
8. **Tone:** Part A/B/C use second person ("You will see…"). Part D uses third person ("The system stores…").
9. **Length target:** 25–40 pages of Markdown. Depth over brevity, but no padding and no repeated paragraphs.
10. **Output one Markdown document**, then a separate 1-page executive summary, then a 10-slide outline. Use tables heavily; avoid long prose blocks.

## PRODUCT FACTS (authoritative — do not contradict)

### What the app is
A mobile app (Android, also iOS-capable) that runs a PG business end to end: a student or employee registers with documents, a warden verifies them, the owner allocates a bed, rent and dues are tracked monthly, and tenants raise complaints, requests, presence updates and emergency alerts from their phone. All data is live in the cloud (Supabase) — there is no demo data.

### Technology (Part D only)
Expo SDK 58 / React Native 0.88, Expo Router file-based navigation, TypeScript, Zustand stores, TanStack Query, Supabase (Postgres + Auth + Storage + RLS), React Native Paper-free custom UI kit, light/dark theme persisted per user, offline banner on connectivity loss.

### Roles
| Role | Internal name | Scope |
|---|---|---|
| **Super Admin / Owner** | `owner` | Whole business, all properties, all money, all staff |
| **Warden** | `warden` | Only the properties assigned to them |
| **Tenant** | `tenant` | Only their own room, dues, complaints, requests, presence |
| **Tenant sub-type: Student** | `tenant_category = student` | College, roll number, course, year, guardian, address proof |
| **Tenant sub-type: Employee** | `tenant_category = employee` | Company, employee ID, work email, designation, Aadhaar, PAN |

### One login for everyone
There is a single email + password sign-in for all roles. The role is read from the user's profile after sign-in — nobody chooses a portal at login. The app routes the user to the correct portal automatically.

### Portals and tabs (exact)
**Entry / auth (no login yet):** Welcome → Login → (Forgot password · email recovery link) · (Super Admin setup, first run only) · Register → choose Student or Employee → registration form → Pending screen.

**Owner portal — 8 tabs + 2 screens:**
1. Overview (dashboard)
2. Wardens
3. Approvals
4. Reports
5. Rooms
6. Notices
7. Activity
8. Settings
9. Profile (via avatar)
10. Privacy policy

**Warden portal — 8 tabs + 1 screen:**
1. Home
2. Approvals
3. Beds
4. Dues
5. Complaints
6. Requests
7. Presence
8. Notices
9. Profile

**Tenant portal — 6 tabs + 1 screen:**
1. Home
2. Rent
3. Complaints
4. Requests
5. Presence
6. Notices
7. Profile

### Data model (Part D)
`profiles`, `properties`, `property_memberships`, `rooms`, `beds`, `tenant_registrations`, `tenants`, `tenancies`, `bed_allocations`, `invoices`, `payments`, `complaints`, `notices`, `notifications`, `expenses`, `audit_events`, `push_tokens`, `tenant_requests`, `daily_presence`, `emergency_alerts`, `app_settings`, `warden_invites`, `former_tenants`, `app_secrets`. (The historical `password_reset_otps` and `sms_provider_config` tables are no longer used by the app; recovery is handled by Supabase Auth email.)

Money is stored in **paise** (integers) and displayed in ₹. Documents live in two private storage buckets: `tenant_docs` (registration/profile) and `complaint_photos`. They are shown through short-lived signed links, never public URLs. PAN is encrypted at rest.

### Statuses and categories (exact — use these words)
- Registration: `pending` → `approved` / `rejected` / `resubmission`
- Verification method: `digital` / `manual`
- Bed: `available` / `occupied` / `maintenance`
- Tenancy: `active` / `checked_out`
- Invoice: `draft` / `sent` / `paid` / `partial` / `overdue`
- Payment mode: `cash` / `upi` / `bank_transfer` / `cheque`
- Complaint: `open` → `in_progress` → `resolved` → `closed`; priority `low` / `medium` / `high` / `urgent`
- Complaint categories: Water, Electricity, Cleaning, Furniture, WiFi/Internet, Plumbing, Security, Others
- Request: `pending` → `approved` / `rejected`; categories Water, Electricity, Cleaning, Furniture, WiFi, Other
- Presence: `present` / `absent`, one record per tenant per day
- Notice types: `general`, `rent_reminder`, `maintenance`, `rules`, `emergency`; notices can be pinned
- Notification types: approval, rejection, rent due, rent paid, complaint update, notice, checkout
- Address proof types: Aadhaar Card, Voter ID, Electricity Bill, Passport, Driving License, Rent Agreement

### Business rules (must be documented as rules, not as code)
1. **One-time Super Admin setup.** On a brand-new database, the Welcome screen shows "Super Admin setup". It creates the owner account with email, mobile and password. Once an owner exists, the setup locks permanently and can never be run again.
2. **Every sign-up becomes a tenant first.** Registration always creates a tenant account. Warden and owner roles are granted only by the owner (or by the one-time setup). A user can never promote themselves.
3. **Registration is document-based.** Student: photo, address proof, college, roll number, course, year, guardian contact, permanent address. Employee: photo, Aadhaar front + back, PAN, company, employee ID, work email, designation, guardian contact, permanent address. Photos must be ≤2 MB each.
4. **Approval gate.** A registration stays `pending` until a warden or owner approves or rejects it. **A rejection always requires a written reason.** The tenant sees the reason and can resubmit, which moves the registration to `resubmission`.
5. **Approval does not allocate a bed.** Approval creates the tenant record. The owner then allocates a specific room + bed, which creates an `active` tenancy.
6. **Rent due day = the day of allocation.** When a tenancy is created, the monthly due day defaults to the day-of-month of the check-in date (allocate on the 7th → rent due on the 7th every month).
7. **Due-day change window.** A tenant may request a different due day **only before the 15th of the month**. After the 15th the option is closed for that month.
8. **Reminders.** A rent reminder is raised **5 days before** the due date. Overdue invoices are flagged automatically after the due date passes.
9. **Tenant profile is one-time.** After submitting registration, a tenant can change **only** their password and profile photo. Name, phone, documents, course/company and address are locked and can only be corrected by staff.
10. **Presence is daily and visible to roommates.** A tenant marks present or absent once per day. Roommates in the same room can see each other's status for today.
11. **Emergency alerts go to the room.** A tenant raises an emergency with a reason and optional description. Active alerts are visible to roommates, the warden and the owner until resolved.
12. **Complaints carry photos.** A tenant can attach one photo; the warden and owner update status; the tenant is notified on every status change.
13. **Requests are separate from complaints.** A request is a permission ask (e.g. room change, late entry, leave); a complaint is a defect report. Both need a decision, and a rejection needs a reason.
14. **Wardens are invited, not self-registered.** The owner creates the warden account from the Wardens tab and assigns properties. The warden is notified by push, falling back to email. Wardens only ever see their assigned properties.
15. **Notices** can be posted by the owner and the warden at any time, pinned, and targeted by type. Tenants read them in the Notices tab.
16. **Password recovery is email-only for every role** — tenant, warden, owner. The user enters the email on their account and Supabase sends a secure one-time recovery link that opens the app (`avtarpg://reset-password`) and leads to the new-password screen. No SMS provider, mobile number, OTP or demo mode is involved.
17. **Theme.** Light/dark/system theme is selectable and remembered per user. Welcome screen and all dashboards adapt.
18. **Offline.** When connectivity drops, an animated banner appears; data actions fail with a friendly message rather than a crash.
19. **Money.** Rent, deposit, payments and dues are always displayed in ₹ with Indian digit grouping. Payments record mode (cash/UPI/bank/cheque) and are reflected in the invoice balance immediately.
20. **Audit trail.** Owner actions and status changes are recorded and visible in the owner Activity tab.

### Cross-portal handoffs (must be shown explicitly)
| # | From | Action | To | Result |
|---|---|---|---|---|
| 1 | Tenant | Submits registration | Warden / Owner | Row appears in Approvals as `pending` |
| 2 | Warden | Approves | Owner | Tenant record created, waiting for bed |
| 3 | Warden | Rejects + reason | Tenant | Tenant sees reason, may resubmit |
| 4 | Owner | Allocates room + bed | Tenant | Tenancy `active`, due day set, rent schedule starts |
| 5 | Tenant | Pays rent | Owner / Warden | Payment recorded, invoice → `paid`/`partial` |
| 6 | Tenant | Raises complaint | Warden | Complaint `open`, warden updates status |
| 7 | Warden | Resolves complaint | Tenant | Notification + tenant sees `resolved` |
| 8 | Tenant | Raises request | Warden / Owner | Request `pending`, decision + reason returns |
| 9 | Tenant | Marks presence | Roommates / Warden | Today's status visible in the room |
| 10 | Tenant | Raises emergency | Roommates / Warden / Owner | Active alert until resolved |
| 11 | Owner | Posts notice | All tenants in scope | Appears in Notices, optional push |
| 12 | Owner | Invites warden | Warden | Account created + invite delivered |
| 13 | Owner | Checks out tenant | Tenant | Tenancy `checked_out`, bed freed |

## REQUIRED OUTPUT STRUCTURE (produce in this exact order)

### Part 0 — Cover and orientation
- Title page: app name, version, date, prepared-for line
- "How to read this document" (which part is for whom)
- Table of contents with page-style numbering

### Part 1 — One-page overview (for the client)
- What the app does in 5 sentences
- The 3 roles in one line each
- **Diagram 1:** whole-app map — roles → portals → tabs
- "The business in one cycle": register → verify → allocate → collect rent → resolve issues → checkout

### Part 2 — Roles and permissions matrix
- A table: feature rows × Owner / Warden / Tenant columns, cells = View / Create / Edit / Approve / None
- A "who can do what to money" subsection
- A "who can see documents" subsection

### Part 3 — Journey maps (one per role)
For each of Owner, Warden, Tenant — a numbered first-day-to-steady-state journey with decision points and branches. Include the **student** and **employee** registration branches separately.

### Part 4 — Screen-by-screen reference
One subsection per screen, in portal order, using the mandatory 7-field structure. Cover **all 28 screens**:
- Auth: Welcome, Login, Forgot password (email recovery link), Reset password, Super Admin setup, Register category, Student form, Employee form, Pending
- Owner: Overview, Wardens, Approvals, Reports, Rooms, Notices, Activity, Settings, Profile, Privacy
- Warden: Home, Approvals, Beds, Dues, Complaints, Requests, Presence, Notices, Profile
- Tenant: Home, Rent, Complaints, Requests, Presence, Notices, Profile

### Part 5 — State machines (Mermaid diagrams)
Required diagrams:
1. `flowchart` — registration and approval lifecycle
2. `stateDiagram-v2` — tenancy lifecycle (allocate → active → checkout)
3. `stateDiagram-v2` — invoice lifecycle (draft → sent → paid/partial/overdue)
4. `stateDiagram-v2` — complaint lifecycle
5. `stateDiagram-v2` — request lifecycle
6. `flowchart` — daily presence and emergency alert flow
7. `sequenceDiagram` — password recovery via email one-time link
8. `sequenceDiagram` — register → approve → allocate → pay → complaint → resolve
Each diagram must be preceded by 2–3 sentences of plain-language explanation and followed by a "how to read this" note.

### Part 6 — Cross-portal handoff table
Reproduce and expand the 13 handoffs above with: trigger, who is notified, what the other role sees, and the SLA you would recommend (e.g. approve within 24 hours).

### Part 7 — Notifications and communication matrix
Table: event → recipient → channel (in-app / push / email) → message intent → what the user should do. Include the email recovery flow and the warden invite fallback chain (push → email).

### Part 8 — Business rules catalogue
All 20 rules, each with: rule, why it exists, what the user sees if they hit it, and who can override it.

### Part 9 — Edge cases and recovery ("What can go wrong")
At minimum cover: email confirmation left on during signup; document upload failing; wrong or missing email on the account so the recovery link cannot arrive; recovery email in spam or expired link; tenant forgets to mark presence; warden not assigned to a property; bed already occupied; rejection with no reason; due-day change after the 15th; offline during a payment entry; duplicate registration; owner account already claimed. For each: symptom → cause → fix → prevention.

### Part 10 — Printable quick-start cards
Three one-page cards, each in a bordered box, written for printing:
- **Owner card** — 8 steps to run the business
- **Warden card** — 8 steps for a daily shift
- **Tenant card** — 8 steps from registration to paying rent
Each step ≤ 12 words. Include a "call this person if stuck" placeholder.

### Part 11 — FAQ
20 questions, grouped by role, answered in ≤ 3 sentences each.

### Part 12 — Glossary
Every domain and app term in plain language: PG, warden, tenancy, allocation, due day, invoice, partial payment, presence, request, complaint, notice, resubmission, recovery link.

### Part 13 — Developer appendix (Part D audience only)
- Route → screen map
- Role → table access summary
- Status enums with transitions
- Storage buckets and path convention
- Where the rules live (database vs client)
- Known limitations and `[CONFIRM]` items

## DELIVERABLES AFTER THE MAIN DOCUMENT

1. **Executive summary** — 1 page, 300 words max, for the client to forward internally.
2. **10-slide outline** — title + 3 bullets per slide, for a client walkthrough.
3. **Screenshot shot-list** — for each portal, the exact screens and states to capture, in order, with a one-line caption each.
4. **Open questions list** — every `[CONFIRM: …]` you emitted, collected in one place.

## QUALITY BAR (self-check before answering)

- [ ] A brand-new warden can run a full shift using Part 10 alone.
- [ ] A tenant understands every tab after 5 minutes of reading Part 3 and Part 10.
- [ ] The client can explain the app to a new employee using Part 1 and Part 2 only.
- [ ] Every one of the 28 screens appears in Part 4 with all 7 fields filled.
- [ ] All 8 Mermaid diagrams render as valid syntax.
- [ ] No invented feature, no credential, no code outside Part 13.
- [ ] Every `[CONFIRM]` is listed again in the final open-questions deliverable.

Begin. Work section by section. If you approach an output limit, stop at a clean section boundary and say "Reply CONTINUE to resume at Part N".

=== END MASTER PROMPT ===

---

## Short variants

### Variant A — Client demo one-pager
> You are a product marketing writer for Indian PG management software. Write a one-page explainer for a PG owner who runs 3 buildings and 60 beds. Structure: the problem in 3 bullets, the app in 3 sentences, the 3 roles in one line each, the monthly business cycle in 6 numbered steps, "what you will never have to do again" in 3 bullets, and a 5-item FAQ. Plain language, no jargon, ₹ amounts, Indian names. Max 500 words.

### Variant B — Warden handbook
> Write a printable 4-page Warden Handbook for AVTAR SINGH PG. Sections: your login, your home screen explained, the daily 6-step routine (check presence → check dues → check complaints → check requests → check notices → report to owner), how to approve a registration, how to reject with a reason, how to resolve a complaint, how to raise a notice, and 5 things you must never do (e.g. never approve without documents, never reject without a reason). Use numbered steps, ≤ 15 words each. Add a "who to call" box.

### Variant C — Tenant welcome card
> Write a 1-page welcome card handed to a new tenant on move-in day for AVTAR SINGH PG. Sections: your first 10 minutes (set password, add photo, check room, mark presence), the 6 tabs explained in one line each, how rent works (due day = move-in day, reminder 5 days before, due-day change only before the 15th), how to complain, how to raise a request, how to mark presence, emergency button rules, and 4 house rules. Friendly tone, second person, ≤ 400 words, leave a blank line for the WiFi password.

### Variant D — Interactive workflow prototype ("dynamic design")
> Build a single self-contained HTML file (no external libraries) that acts as a clickable prototype of the AVTAR SINGH PG app workflow for demo purposes. Left sidebar: role switcher (Owner / Warden / Tenant). Main area: the current portal's tab list as cards. Clicking a tab shows a mock screen with realistic Indian data (₹ amounts, room numbers, tenant names). Clicking an action advances a numbered workflow (e.g. Approve → tenant appears in Owner's Rooms as "unallocated"). Show a breadcrumb of the workflow path at the top and a step counter. Use a light/dark toggle. Add a "Reset demo" button. All state in memory, no network. Style with system fonts, rounded cards, subtle shadows, and a primary colour of #0F172A with an accent of #10B981.

---

## Follow-up prompts (run after the main document exists)

| Goal | Prompt |
|---|---|
| PDF / print layout | `Convert the document into print-ready HTML with A4 page breaks, a running header, and page numbers, keeping all tables and Mermaid diagrams.` |
| Hindi version | `Translate Parts 1, 3, 10 and 11 into simple Hindi (Devanagari), keeping all UI labels in English inside brackets, e.g. "रजिस्टर (Register)".` |
| In-app onboarding | `Turn Part 10 into short in-app onboarding tooltips: one sentence per screen, max 90 characters each.` |
| Play Store copy | `Using Part 1 only, write a Play Store listing: title ≤ 30 chars, short description ≤ 80 chars, full description ≤ 4000 chars, and 5 screenshot captions ≤ 60 chars.` |
| Support script | `Write a 10-question triage script a support person can use to diagnose any issue in Part 9, with the exact reply to send the user.` |
| Training deck | `Turn Part 3 and Part 10 into a 12-slide trainer deck with speaker notes.` |
| Test cases | `Convert Parts 5 and 9 into a QA test-case table: ID, precondition, steps, expected result, priority.` |

---

## Tips for better output

1. **Feed the real code when you can.** Models hallucinate less when they can read `app/` and the migrations. Attach them or paste the relevant file.
2. **Ask for one part at a time** if the model truncates. The prompt is designed to split cleanly at Part boundaries.
3. **Ask for the diagrams separately** if they render badly: `Output only the 8 Mermaid diagrams, one code block each, no prose.`
4. **Keep the PRODUCT FACTS block in sync.** When you ship a new feature, add it to the facts list before regenerating — that is what keeps the guide from drifting.
5. **Verify before sharing.** Anything marked `[CONFIRM]` must be answered by you before the client sees it.
