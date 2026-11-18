-- ============================================================
-- AVTAR PG MANAGER — Migration 010: Tenant Checkout + Archive
--   + Privacy Policy / Terms & Conditions
--
--   1. checkout_requests  — required tenant checkout form
--        (date + time + feedback) sent to the owner for approval.
--   2. former_tenants     — owner-only archive of past tenants
--        (name, address, phone, family contact, feedback).
--   3. decide_checkout()  — owner approves -> warning -> ALL personal
--        documents + tenant data are archived then permanently deleted.
--   4. profiles.terms_accepted_at + app_settings seeds — tenants must
--        accept the Terms & Conditions before entering the app
--        (optional gate, ON by default; owner can switch it off).
--   5. Owner storage DELETE policy so uploaded documents can be purged.
--
-- Run this in Supabase SQL Editor AFTER 009.
-- Safe to re-run.
-- ============================================================

-- ============================================================
-- 1. CHECKOUT REQUESTS (tenant form -> owner approval)
-- ============================================================
DO $$ BEGIN CREATE TYPE checkout_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS checkout_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- SET NULL (not CASCADE): the row must survive the tenant purge so the
  -- owner keeps a record of what was approved and when.
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_name     TEXT NOT NULL,          -- snapshot, survives deletion
  room_label      TEXT,
  bed_label       TEXT,
  check_out_date  DATE NOT NULL,
  check_out_time  TEXT NOT NULL,
  feedback        TEXT NOT NULL,
  status          checkout_status NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  reviewer_id     UUID REFERENCES profiles(id),
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_checkout_requests_updated_at ON checkout_requests;
CREATE TRIGGER trg_checkout_requests_updated_at
  BEFORE UPDATE ON checkout_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Only one open request per tenant at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_pending
  ON checkout_requests(tenant_id)
  WHERE status = 'pending' AND tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_property ON checkout_requests(property_id, status);
CREATE INDEX IF NOT EXISTS idx_checkout_created ON checkout_requests(created_at DESC);

ALTER TABLE checkout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_submits_checkout" ON checkout_requests;
CREATE POLICY "tenant_submits_checkout" ON checkout_requests
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = my_tenant_id());

DROP POLICY IF EXISTS "tenant_reads_own_checkout" ON checkout_requests;
CREATE POLICY "tenant_reads_own_checkout" ON checkout_requests
  FOR SELECT TO authenticated
  USING (tenant_id = my_tenant_id());

DROP POLICY IF EXISTS "owner_manages_checkout" ON checkout_requests;
CREATE POLICY "owner_manages_checkout" ON checkout_requests
  FOR ALL TO authenticated
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "warden_reads_checkout" ON checkout_requests;
CREATE POLICY "warden_reads_checkout" ON checkout_requests
  FOR SELECT TO authenticated
  USING (property_id IN (SELECT warden_property_ids()));


-- ============================================================
-- 2. FORMER TENANTS ARCHIVE (owner only)
-- ============================================================
CREATE TABLE IF NOT EXISTS former_tenants (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id          UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source_tenant_id     UUID,                 -- no FK: tenants row is deleted
  full_name            TEXT NOT NULL,
  phone                TEXT,
  emergency_phone      TEXT,
  email                TEXT,
  permanent_address    TEXT,
  current_address      TEXT,
  family_contact_name  TEXT,
  family_contact_phone TEXT,
  family_relation      TEXT,
  category             TEXT,
  room_no              TEXT,
  bed_label            TEXT,
  check_in_date        DATE,
  check_out_date       DATE,
  check_out_time       TEXT,
  feedback             TEXT NOT NULL,
  archived_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_by          UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_former_tenants_property ON former_tenants(property_id, archived_at DESC);

ALTER TABLE former_tenants ENABLE ROW LEVEL SECURITY;

-- Owner-only read. No INSERT/UPDATE/DELETE policy on purpose: only the
-- SECURITY DEFINER routine (table owner) may write the archive.
DROP POLICY IF EXISTS "owner_reads_former_tenants" ON former_tenants;
CREATE POLICY "owner_reads_former_tenants" ON former_tenants
  FOR SELECT TO authenticated
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));


-- ============================================================
-- 3. TERMS ACCEPTANCE (login gate) + SETTINGS SEEDS
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Terms & Conditions text (tenant-visible, owner authored)
INSERT INTO app_settings (key, value)
VALUES ('terms_conditions', 'AVTAR Singh PG - Terms & Conditions (v1.0)

These terms apply to every tenant staying at AVTAR Singh PG. By accepting them you agree to the following:

1. REGISTRATION - Every tenant must complete one-time registration with valid ID proof and contact details before move-in. Details must be kept up to date.

2. RENT & PAYMENTS - Rent is due on the due day shown in the app each month. Late payment may attract a fine. Payments are recorded in the app; ask the office for a receipt.

3. DEPOSIT - A security deposit is collected at move-in and adjusted against damages, unpaid dues or missing items at checkout.

4. CONDUCT - No loud music after 10 PM, no smoking or alcohol inside rooms, and no guests overnight without prior permission from the warden.

5. ROOM & BED - The allotted room and bed may not be changed or shared without written approval from the owner.

6. DOCUMENTS - KYC documents uploaded in the app are used only for verification. They are deleted when your tenancy is completed at checkout.

7. CHECKOUT - Checkout requires submitting a request in the app with date, time and feedback. On owner approval all your personal documents and records are permanently deleted from the app and archived as a former tenant.

8. LIABILITY - The management is not responsible for loss of personal valuables. Use the provided lockers and inform the warden of any security concern.

9. TERMINATION - The owner may ask a tenant to vacate for rule violations, with reasonable notice.

10. CHANGES - The owner may update these terms; you will be asked to accept the updated version at your next login.

Contact: avtar.singh@avtarpg.com - Gurgaon, Haryana.')
ON CONFLICT (key) DO NOTHING;

-- Login gate switch (true = tenants must accept before entering)
INSERT INTO app_settings (key, value)
VALUES ('terms_gate_enabled', 'true')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 4. OWNER STORAGE PURGE POLICY
-- Lets the owner delete a checked-out tenant's uploaded documents
-- (tenant_docs + complaint_photos). Wardens keep read-only access.
-- ============================================================
DROP POLICY IF EXISTS "owner_purge_tenant_docs" ON storage.objects;
CREATE POLICY "owner_purge_tenant_docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('tenant_docs', 'complaint_photos')
    AND is_owner()
  );


-- ============================================================
-- 5. RPC: tenant submits the checkout form (all fields required)
-- ============================================================
CREATE OR REPLACE FUNCTION submit_checkout_request(
  p_check_out_date DATE,
  p_check_out_time TEXT,
  p_feedback TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant    tenants%ROWTYPE;
  v_room_no   TEXT;
  v_bed_label TEXT;
  v_request_id UUID;
BEGIN
  IF p_check_out_date IS NULL THEN
    RAISE EXCEPTION 'Checkout date is required.';
  END IF;
  IF p_check_out_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Checkout date cannot be in the past.';
  END IF;
  IF p_check_out_time IS NULL OR btrim(p_check_out_time) = '' THEN
    RAISE EXCEPTION 'Checkout time is required.';
  END IF;
  IF p_feedback IS NULL OR btrim(p_feedback) = '' THEN
    RAISE EXCEPTION 'Feedback is required.';
  END IF;
  IF length(btrim(p_feedback)) < 10 THEN
    RAISE EXCEPTION 'Please write at least 10 characters of feedback for the owner.';
  END IF;

  SELECT * INTO v_tenant FROM tenants WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active tenant record found for your account.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM checkout_requests
    WHERE tenant_id = v_tenant.id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a checkout request waiting for owner approval.';
  END IF;

  SELECT r.room_no, b.label INTO v_room_no, v_bed_label
  FROM tenancies t
  LEFT JOIN rooms r ON r.id = t.room_id
  LEFT JOIN beds b  ON b.id = t.bed_id
  WHERE t.tenant_id = v_tenant.id AND t.status = 'active'
  LIMIT 1;

  INSERT INTO checkout_requests (
    tenant_id, property_id, tenant_name, room_label, bed_label,
    check_out_date, check_out_time, feedback
  ) VALUES (
    v_tenant.id, v_tenant.property_id, v_tenant.full_name, v_room_no, v_bed_label,
    p_check_out_date, btrim(p_check_out_time), btrim(p_feedback)
  )
  RETURNING id INTO v_request_id;

  -- Tell every owner of this property (realtime badge + notification list)
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT p.owner_id,
         'checkout',
         'Checkout request',
         v_tenant.full_name || ' wants to check out on ' ||
           to_char(p_check_out_date, 'DD Mon YYYY') || ' at ' || btrim(p_check_out_time) || '.',
         jsonb_build_object('checkout_id', v_request_id)
  FROM properties p
  WHERE p.id = v_tenant.property_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION submit_checkout_request(DATE, TEXT, TEXT) TO authenticated;


-- ============================================================
-- 6. RPC: owner approves (archive + purge) or rejects
--
--    APPROVE = the warning the owner confirms in the app:
--      * archive name / address / phone / family contact / feedback
--        into former_tenants (owner-only, permanent record)
--      * free the bed, close the tenancy
--      * delete invoices, payments, deposits, complaints, requests,
--        presence, alerts, notifications and push tokens
--      * delete the registration (KYC documents + PAN) and tenants row
--      * delete the login (auth.users). If the platform refuses that,
--        fall back to stripping all profile PII and deactivating it.
--    Document FILES in storage are removed by the app right after this
--    call (owner DELETE policy above).
-- ============================================================
CREATE OR REPLACE FUNCTION decide_checkout(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_req         checkout_requests%ROWTYPE;
  v_tenant      tenants%ROWTYPE;
  v_reg         tenant_registrations%ROWTYPE;
  v_user_id     UUID;
  v_tenancy_id  UUID;
  v_email       TEXT;
  v_room_no     TEXT;
  v_bed_label   TEXT;
  v_check_in    DATE;
  v_archive_id  UUID;
BEGIN
  SELECT * INTO v_req FROM checkout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout request not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM properties WHERE id = v_req.property_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the property owner can decide checkout requests.';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This checkout request has already been decided.';
  END IF;

  -- ---------- REJECT ----------
  IF NOT COALESCE(p_approve, false) THEN
    UPDATE checkout_requests
       SET status = 'rejected',
           decision_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Rejected by owner'),
           reviewer_id = auth.uid(),
           decided_at = NOW()
     WHERE id = p_request_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT t.user_id,
           'rejection',
           'Checkout request rejected',
           COALESCE('Reason: ' || btrim(p_reason), 'Your checkout request was rejected.'),
           jsonb_build_object('checkout_id', p_request_id)
    FROM tenants t
    WHERE t.id = v_req.tenant_id;

    INSERT INTO audit_events (actor_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), 'REJECT_CHECKOUT', 'checkout_requests', p_request_id,
            jsonb_build_object('tenant_name', v_req.tenant_name, 'reason', p_reason));

    RETURN;
  END IF;

  -- ---------- APPROVE ----------
  SELECT * INTO v_tenant FROM tenants WHERE id = v_req.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The tenant record for this request no longer exists.';
  END IF;

  v_user_id := v_tenant.user_id;

  SELECT * INTO v_reg FROM tenant_registrations WHERE id = v_tenant.registration_id;
  SELECT email INTO v_email FROM profiles WHERE id = v_user_id;

  SELECT t.id, r.room_no, b.label, t.check_in_date
    INTO v_tenancy_id, v_room_no, v_bed_label, v_check_in
  FROM tenancies t
  LEFT JOIN rooms r ON r.id = t.room_id
  LEFT JOIN beds b  ON b.id = t.bed_id
  WHERE t.tenant_id = v_tenant.id AND t.status = 'active'
  LIMIT 1;

  -- 6a. ARCHIVE FIRST (this is what the Former Tenants section shows)
  INSERT INTO former_tenants (
    property_id, source_tenant_id, full_name, phone, emergency_phone, email,
    permanent_address, current_address, family_contact_name, family_contact_phone,
    family_relation, category, room_no, bed_label, check_in_date,
    check_out_date, check_out_time, feedback, archived_by
  ) VALUES (
    v_tenant.property_id, v_tenant.id, v_tenant.full_name, v_tenant.phone,
    v_tenant.emergency_phone, v_email,
    v_reg.permanent_address, v_reg.current_address, v_reg.family_contact_name,
    v_reg.family_contact_phone, v_reg.family_relation,
    v_tenant.category::TEXT,
    COALESCE(v_room_no, v_req.room_label), COALESCE(v_bed_label, v_req.bed_label),
    v_check_in, v_req.check_out_date, v_req.check_out_time, v_req.feedback,
    auth.uid()
  )
  RETURNING id INTO v_archive_id;

  -- 6b. Free the bed (if still allocated)
  IF v_tenancy_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM bed_allocations
       WHERE tenancy_id = v_tenancy_id AND released_at IS NULL
     ) THEN
    PERFORM release_bed_atomic(v_tenancy_id, v_req.check_out_date);
  END IF;

  -- 6c. DELETE every record that references the tenant.
  --     Order matters: dependants first, tenants row last.
  DELETE FROM payment_allocations
    WHERE payment_id IN (SELECT id FROM payments WHERE tenant_id = v_tenant.id);
  DELETE FROM payments              WHERE tenant_id = v_tenant.id;
  DELETE FROM invoices              WHERE tenant_id = v_tenant.id;   -- lines cascade
  DELETE FROM deposit_transactions  WHERE tenant_id = v_tenant.id;
  DELETE FROM complaints            WHERE tenant_id = v_tenant.id;   -- comments cascade
  DELETE FROM complaint_comments    WHERE author_id = v_user_id;
  DELETE FROM tenant_requests       WHERE tenant_id = v_tenant.id;
  DELETE FROM daily_presence        WHERE tenant_id = v_tenant.id;
  DELETE FROM emergency_alerts      WHERE tenant_id = v_tenant.id;
  DELETE FROM notifications         WHERE user_id = v_user_id;
  DELETE FROM push_tokens           WHERE user_id = v_user_id;
  UPDATE audit_events SET actor_id = NULL WHERE actor_id = v_user_id;
  DELETE FROM bed_allocations       WHERE tenancy_id = v_tenancy_id;
  DELETE FROM tenancies             WHERE tenant_id = v_tenant.id;
  DELETE FROM tenants               WHERE id = v_tenant.id;
  DELETE FROM tenant_registrations  WHERE id = v_reg.id;

  -- 6d. Remove the login itself. auth.users may not be deletable from a
  --     SQL function on every project, so fall back to stripping all
  --     personal data from the profile and deactivating the account.
  BEGIN
    DELETE FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE profiles
       SET full_name = NULL,
           phone = NULL,
           avatar_url = NULL,
           terms_accepted_at = NULL,
           is_active = false
     WHERE id = v_user_id;
  END;

  -- 6e. Close the request (tenant_id already NULLed by the cascade above)
  UPDATE checkout_requests
     SET status = 'approved',
         decision_reason = COALESCE(NULLIF(btrim(p_reason), ''),
           'Approved - tenant data and personal documents deleted'),
         reviewer_id = auth.uid(),
         decided_at = NOW(),
         tenant_id = NULL
   WHERE id = p_request_id;

  INSERT INTO audit_events (actor_id, action, table_name, record_id, new_data)
  VALUES (auth.uid(), 'APPROVE_CHECKOUT', 'checkout_requests', p_request_id,
          jsonb_build_object(
            'tenant_name', v_req.tenant_name,
            'archived_id', v_archive_id,
            'check_out_date', v_req.check_out_date,
            'documents_deleted', true
          ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION decide_checkout(UUID, BOOLEAN, TEXT) TO authenticated;

-- Make PostgREST pick up the new functions immediately.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- VERIFY
-- ============================================================
-- SELECT 'checkout_requests' AS t, count(*) FROM checkout_requests
-- UNION ALL SELECT 'former_tenants', count(*) FROM former_tenants
-- UNION ALL SELECT 'terms_accepted', count(*) FROM profiles WHERE terms_accepted_at IS NOT NULL;
--
-- SELECT key, left(value, 40) FROM app_settings
--  WHERE key IN ('terms_conditions', 'terms_gate_enabled');
--
-- \df submit_checkout_request
-- \df decide_checkout
