-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bed_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper functions for RLS
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_warden()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'warden'));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION warden_property_ids()
RETURNS SETOF UUID AS $$
  SELECT property_id FROM property_memberships
  WHERE user_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION my_tenant_id()
RETURNS UUID AS $$
  SELECT id FROM tenants WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION my_property_id()
RETURNS UUID AS $$
  SELECT property_id FROM tenants WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- PROFILES policies
-- ============================================================
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "owner_reads_all_profiles" ON profiles FOR SELECT USING (is_owner());
CREATE POLICY "warden_reads_property_profiles" ON profiles FOR SELECT
  USING (is_warden() AND id IN (
    SELECT t.user_id FROM tenants t WHERE t.property_id IN (SELECT warden_property_ids())
  ));
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_on_signup" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- ============================================================
-- PROPERTIES policies
-- ============================================================
CREATE POLICY "owner_full_properties" ON properties FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "warden_reads_assigned_properties" ON properties FOR SELECT
  USING (id IN (SELECT warden_property_ids()));
CREATE POLICY "tenant_reads_own_property" ON properties FOR SELECT
  USING (id = my_property_id());

-- ============================================================
-- PROPERTY_MEMBERSHIPS policies
-- ============================================================
CREATE POLICY "owner_full_memberships" ON property_memberships FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
CREATE POLICY "warden_reads_own_memberships" ON property_memberships FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- ROOMS policies
-- ============================================================
CREATE POLICY "owner_full_rooms" ON rooms FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
CREATE POLICY "warden_full_rooms" ON rooms FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "tenant_reads_own_room" ON rooms FOR SELECT
  USING (id IN (SELECT room_id FROM tenancies WHERE tenant_id = my_tenant_id() AND status = 'active'));

-- ============================================================
-- BEDS policies
-- ============================================================
CREATE POLICY "owner_full_beds" ON beds FOR ALL
  USING (room_id IN (SELECT id FROM rooms WHERE property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())));
CREATE POLICY "warden_full_beds" ON beds FOR ALL
  USING (room_id IN (SELECT id FROM rooms WHERE property_id IN (SELECT warden_property_ids())));
CREATE POLICY "tenant_reads_own_bed" ON beds FOR SELECT
  USING (id IN (SELECT bed_id FROM tenancies WHERE tenant_id = my_tenant_id() AND status = 'active'));

-- ============================================================
-- TENANT_REGISTRATIONS policies
-- ============================================================
CREATE POLICY "tenant_insert_own_registration" ON tenant_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenant_reads_own_registration" ON tenant_registrations FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "tenant_updates_own_pending" ON tenant_registrations FOR UPDATE
  USING (user_id = auth.uid() AND status IN ('pending', 'resubmission'));
CREATE POLICY "warden_reads_property_registrations" ON tenant_registrations FOR SELECT
  USING (is_warden() AND property_id IN (SELECT warden_property_ids()));
CREATE POLICY "warden_updates_registration_status" ON tenant_registrations FOR UPDATE
  USING (is_warden() AND property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_registrations" ON tenant_registrations FOR ALL
  USING (is_owner());

-- ============================================================
-- TENANTS policies
-- ============================================================
CREATE POLICY "tenant_reads_own_record" ON tenants FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "warden_full_tenants" ON tenants FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_tenants" ON tenants FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- TENANCIES policies
-- ============================================================
CREATE POLICY "tenant_reads_own_tenancy" ON tenancies FOR SELECT
  USING (tenant_id = my_tenant_id());
CREATE POLICY "warden_full_tenancies" ON tenancies FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_tenancies" ON tenancies FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- BED_ALLOCATIONS policies
-- ============================================================
CREATE POLICY "warden_full_allocations" ON bed_allocations FOR ALL
  USING (is_warden());
CREATE POLICY "owner_full_allocations" ON bed_allocations FOR ALL
  USING (is_owner());

-- ============================================================
-- INVOICES policies
-- ============================================================
CREATE POLICY "tenant_reads_own_invoices" ON invoices FOR SELECT
  USING (tenant_id = my_tenant_id());
CREATE POLICY "warden_full_invoices" ON invoices FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_invoices" ON invoices FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- INVOICE_LINES policies
-- ============================================================
CREATE POLICY "tenant_reads_own_lines" ON invoice_lines FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = my_tenant_id()));
CREATE POLICY "warden_full_lines" ON invoice_lines FOR ALL
  USING (is_warden());
CREATE POLICY "owner_full_lines" ON invoice_lines FOR ALL
  USING (is_owner());

-- ============================================================
-- PAYMENTS policies
-- ============================================================
CREATE POLICY "tenant_reads_own_payments" ON payments FOR SELECT
  USING (tenant_id = my_tenant_id());
CREATE POLICY "warden_full_payments" ON payments FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_payments" ON payments FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- PAYMENT_ALLOCATIONS
-- ============================================================
CREATE POLICY "warden_full_alloc" ON payment_allocations FOR ALL USING (is_warden());
CREATE POLICY "owner_full_alloc" ON payment_allocations FOR ALL USING (is_owner());
CREATE POLICY "tenant_reads_own_alloc" ON payment_allocations FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = my_tenant_id()));

-- ============================================================
-- DEPOSIT_TRANSACTIONS
-- ============================================================
CREATE POLICY "tenant_reads_own_deposits" ON deposit_transactions FOR SELECT
  USING (tenant_id = my_tenant_id());
CREATE POLICY "warden_full_deposits" ON deposit_transactions FOR ALL USING (is_warden());
CREATE POLICY "owner_full_deposits" ON deposit_transactions FOR ALL USING (is_owner());

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE POLICY "warden_full_expenses" ON expenses FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_expenses" ON expenses FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- COMPLAINTS
-- ============================================================
CREATE POLICY "tenant_full_own_complaints" ON complaints FOR ALL
  USING (tenant_id = my_tenant_id());
CREATE POLICY "warden_full_complaints" ON complaints FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_complaints" ON complaints FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- COMPLAINT_COMMENTS
-- ============================================================
CREATE POLICY "tenant_reads_own_complaint_comments" ON complaint_comments FOR SELECT
  USING (complaint_id IN (SELECT id FROM complaints WHERE tenant_id = my_tenant_id()));
CREATE POLICY "tenant_inserts_own_comment" ON complaint_comments FOR INSERT
  WITH CHECK (author_id = auth.uid() AND complaint_id IN (SELECT id FROM complaints WHERE tenant_id = my_tenant_id()));
CREATE POLICY "warden_full_comments" ON complaint_comments FOR ALL USING (is_warden());
CREATE POLICY "owner_full_comments" ON complaint_comments FOR ALL USING (is_owner());

-- ============================================================
-- NOTICES
-- ============================================================
CREATE POLICY "tenant_reads_property_notices" ON notices FOR SELECT
  USING (property_id = my_property_id());
CREATE POLICY "warden_full_notices" ON notices FOR ALL
  USING (property_id IN (SELECT warden_property_ids()));
CREATE POLICY "owner_full_notices" ON notices FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY "users_own_notifications" ON notifications FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- AUDIT_EVENTS
-- ============================================================
CREATE POLICY "owner_reads_all_audit" ON audit_events FOR SELECT USING (is_owner());
CREATE POLICY "insert_audit_authenticated" ON audit_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- PUSH_TOKENS
-- ============================================================
CREATE POLICY "users_own_push_tokens" ON push_tokens FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- STORAGE BUCKET POLICIES (run after creating buckets)
-- ============================================================
-- Bucket: tenant_docs (private)
-- INSERT: tenant can upload own docs
-- SELECT: tenant, warden(assigned), owner via signed URLs

-- Bucket: complaint_photos (private)
-- INSERT: tenant can upload
-- SELECT: tenant, warden, owner

-- NOTE: Create buckets in Supabase Dashboard:
-- 1. tenant_docs - private
-- 2. complaint_photos - private
-- Then add RLS on storage.objects referencing the above policies

