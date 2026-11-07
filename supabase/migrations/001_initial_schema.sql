-- ============================================================
-- AVTAR SINGH PG MANAGER — Full Database Schema
-- Run this in Supabase SQL Editor
-- Money stored as INTEGER paise (1 INR = 100 paise)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('owner', 'warden', 'tenant');
CREATE TYPE tenant_category AS ENUM ('student', 'employee');
CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'rejected', 'resubmission');
CREATE TYPE verification_method AS ENUM ('digital', 'manual');
CREATE TYPE bed_status AS ENUM ('available', 'occupied', 'maintenance');
CREATE TYPE tenancy_status AS ENUM ('active', 'checked_out');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue');
CREATE TYPE payment_mode AS ENUM ('cash', 'upi', 'bank_transfer', 'cheque');
CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE expense_category AS ENUM ('maintenance', 'utilities', 'salary', 'cleaning', 'miscellaneous');
CREATE TYPE notice_type AS ENUM ('general', 'rent_reminder', 'maintenance', 'rules', 'emergency');
CREATE TYPE notification_type AS ENUM ('approval', 'rejection', 'rent_due', 'rent_paid', 'complaint_update', 'notice', 'checkout');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  role        user_role NOT NULL DEFAULT 'tenant',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROPERTIES
-- ============================================================
CREATE TABLE properties (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES profiles(id),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  city        TEXT,
  state       TEXT,
  pincode     TEXT,
  rules       TEXT,
  total_capacity INT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROPERTY MEMBERSHIPS (Warden ↔ Property assignment)
-- ============================================================
CREATE TABLE property_memberships (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  role        user_role NOT NULL,
  assigned_by UUID REFERENCES profiles(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

-- ============================================================
-- ROOMS
-- ============================================================
CREATE TABLE rooms (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id),
  room_no      TEXT NOT NULL,
  floor        INT DEFAULT 0,
  sharing_type INT NOT NULL DEFAULT 1, -- 1=single, 2=double, 3=triple etc
  monthly_rent INT NOT NULL DEFAULT 0, -- paise
  deposit_amt  INT NOT NULL DEFAULT 0, -- paise
  amenities    TEXT[],
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, room_no)
);

-- ============================================================
-- BEDS
-- ============================================================
CREATE TABLE beds (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES rooms(id),
  label       TEXT NOT NULL, -- A1, B2, etc
  status      bed_status NOT NULL DEFAULT 'available',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, label)
);

-- ============================================================
-- TENANT REGISTRATIONS
-- ============================================================
CREATE TABLE tenant_registrations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id),
  property_id         UUID REFERENCES properties(id),
  category            tenant_category NOT NULL,
  full_name           TEXT NOT NULL,
  -- Student fields
  college_name        TEXT,
  roll_number         TEXT,
  course              TEXT,
  year_of_study       INT,
  -- Employee fields
  company_name        TEXT,
  employee_id         TEXT,
  work_email          TEXT,
  designation         TEXT,
  -- Common fields
  phone               TEXT,
  date_of_birth       DATE,
  permanent_address   TEXT NOT NULL,
  current_address     TEXT,
  family_contact_name TEXT,
  family_contact_phone TEXT,
  family_relation     TEXT,
  -- Documents
  photo_url           TEXT,
  address_proof_type  TEXT,
  address_proof_url   TEXT,
  aadhaar_front_url   TEXT,
  aadhaar_back_url    TEXT,
  pan_encrypted       TEXT, -- AES-256 encrypted, owner-only
  -- Approval
  status              registration_status NOT NULL DEFAULT 'pending',
  verification_method verification_method,
  reviewer_id         UUID REFERENCES profiles(id),
  decision_reason     TEXT,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TENANTS (after approval, formal record)
-- ============================================================
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) UNIQUE,
  registration_id UUID NOT NULL REFERENCES tenant_registrations(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  category        tenant_category NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  emergency_phone TEXT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TENANCIES (a tenant's stay period in a bed)
-- ============================================================
CREATE TABLE tenancies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  room_id         UUID NOT NULL REFERENCES rooms(id),
  bed_id          UUID NOT NULL REFERENCES beds(id),
  monthly_rent    INT NOT NULL, -- paise
  deposit_paid    INT NOT NULL DEFAULT 0, -- paise
  check_in_date   DATE NOT NULL,
  check_out_date  DATE,
  expected_checkout DATE,
  status          tenancy_status NOT NULL DEFAULT 'active',
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BED ALLOCATIONS (atomic assignment record)
-- ============================================================
CREATE TABLE bed_allocations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bed_id      UUID NOT NULL REFERENCES beds(id),
  tenancy_id  UUID NOT NULL REFERENCES tenancies(id),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at  TIMESTAMPTZ,
  allocated_by UUID REFERENCES profiles(id)
);

-- Partial unique index: only one active allocation per bed
CREATE UNIQUE INDEX uq_bed_active ON bed_allocations(bed_id) 
  WHERE released_at IS NULL;

-- ============================================================
-- INVOICES (Idempotent: unique tenancy+billing_period)
-- ============================================================
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenancy_id      UUID NOT NULL REFERENCES tenancies(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  billing_period  TEXT NOT NULL, -- format: YYYY-MM
  invoice_no      TEXT NOT NULL UNIQUE,
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL,
  total_amount    INT NOT NULL DEFAULT 0, -- paise
  paid_amount     INT NOT NULL DEFAULT 0, -- paise
  balance_due     INT NOT NULL DEFAULT 0, -- paise
  status          invoice_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenancy_id, billing_period)
);

-- ============================================================
-- INVOICE LINES
-- ============================================================
CREATE TABLE invoice_lines (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      INT NOT NULL, -- paise
  line_type   TEXT NOT NULL DEFAULT 'rent' -- rent, electricity, water, etc
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  amount          INT NOT NULL, -- paise
  mode            payment_mode NOT NULL DEFAULT 'cash',
  reference_no    TEXT,
  received_by     UUID REFERENCES profiles(id),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  receipt_no      TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAYMENT ALLOCATIONS (FIFO)
-- ============================================================
CREATE TABLE payment_allocations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id  UUID NOT NULL REFERENCES payments(id),
  invoice_id  UUID NOT NULL REFERENCES invoices(id),
  amount      INT NOT NULL, -- paise
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEPOSIT TRANSACTIONS
-- ============================================================
CREATE TABLE deposit_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenancy_id  UUID NOT NULL REFERENCES tenancies(id),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  amount      INT NOT NULL, -- paise (positive=received, negative=refunded)
  type        TEXT NOT NULL, -- received, refund, deduction
  reason      TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  category    expense_category NOT NULL DEFAULT 'miscellaneous',
  description TEXT NOT NULL,
  amount      INT NOT NULL, -- paise
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPLAINTS
-- ============================================================
CREATE TABLE complaints (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  room_id     UUID REFERENCES rooms(id),
  category    TEXT NOT NULL, -- water, electricity, cleaning, furniture, etc
  title       TEXT NOT NULL,
  description TEXT,
  priority    complaint_priority NOT NULL DEFAULT 'medium',
  status      complaint_status NOT NULL DEFAULT 'open',
  photo_url   TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPLAINT COMMENTS
-- ============================================================
CREATE TABLE complaint_comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id  UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES profiles(id),
  comment       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTICES
-- ============================================================
CREATE TABLE notices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  author_id   UUID NOT NULL REFERENCES profiles(id),
  type        notice_type NOT NULL DEFAULT 'general',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id),
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- AUDIT EVENTS
-- ============================================================
CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_created ON audit_events(created_at DESC);

-- ============================================================
-- PUSH TOKENS
-- ============================================================
CREATE TABLE push_tokens (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token     TEXT NOT NULL,
  platform  TEXT NOT NULL, -- android, ios
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- ============================================================
-- TRIGGERS: auto-updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_registrations_updated_at BEFORE UPDATE ON tenant_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenancies_updated_at BEFORE UPDATE ON tenancies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_complaints_updated_at BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_notices_updated_at BEFORE UPDATE ON notices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tenant')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: Invoice balance auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION update_invoice_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET
    paid_amount = (
      SELECT COALESCE(SUM(pa.amount), 0)
      FROM payment_allocations pa
      WHERE pa.invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ),
    balance_due = total_amount - (
      SELECT COALESCE(SUM(pa.amount), 0)
      FROM payment_allocations pa
      WHERE pa.invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ),
    status = CASE
      WHEN total_amount = 0 THEN 'draft'
      WHEN (SELECT COALESCE(SUM(pa.amount), 0) FROM payment_allocations pa WHERE pa.invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)) >= total_amount THEN 'paid'
      WHEN (SELECT COALESCE(SUM(pa.amount), 0) FROM payment_allocations pa WHERE pa.invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)) > 0 THEN 'partial'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_balance_on_alloc
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION update_invoice_balance();

-- ============================================================
-- TRIGGER: Notification on registration status change
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_registration_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (NEW.user_id, 'approval', '🎉 Registration Approved!',
        'Your PG registration has been approved. You can now login.',
        jsonb_build_object('registration_id', NEW.id));
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (NEW.user_id, 'rejection', '❌ Registration Rejected',
        COALESCE('Reason: ' || NEW.decision_reason, 'Your registration was rejected. Please resubmit.'),
        jsonb_build_object('registration_id', NEW.id, 'reason', NEW.decision_reason));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_registration_status
  AFTER UPDATE ON tenant_registrations
  FOR EACH ROW EXECUTE FUNCTION notify_on_registration_status();

-- ============================================================
-- TRIGGER: Notification on complaint update
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_complaint_update()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT p.user_id INTO v_user_id FROM tenants p WHERE p.id = NEW.tenant_id;
  IF NEW.status != OLD.status THEN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (v_user_id, 'complaint_update', '🛠 Complaint Updated',
      'Your complaint "' || NEW.title || '" is now ' || NEW.status,
      jsonb_build_object('complaint_id', NEW.id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_complaint
  AFTER UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION notify_on_complaint_update();

-- ============================================================
-- FUNCTION: Atomic bed assignment
-- ============================================================
CREATE OR REPLACE FUNCTION assign_bed_atomic(
  p_bed_id UUID,
  p_tenancy_id UUID,
  p_allocated_by UUID
) RETURNS UUID AS $$
DECLARE
  v_alloc_id UUID;
BEGIN
  -- Lock the bed row
  PERFORM 1 FROM beds WHERE id = p_bed_id FOR UPDATE;

  -- Check availability
  IF EXISTS (
    SELECT 1 FROM bed_allocations
    WHERE bed_id = p_bed_id AND released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bed % is already occupied', p_bed_id;
  END IF;

  -- Insert allocation
  INSERT INTO bed_allocations (bed_id, tenancy_id, allocated_by)
  VALUES (p_bed_id, p_tenancy_id, p_allocated_by)
  RETURNING id INTO v_alloc_id;

  -- Update bed status
  UPDATE beds SET status = 'occupied' WHERE id = p_bed_id;

  RETURN v_alloc_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Release bed atomically (checkout)
-- ============================================================
CREATE OR REPLACE FUNCTION release_bed_atomic(
  p_tenancy_id UUID,
  p_check_out_date DATE DEFAULT CURRENT_DATE
) RETURNS VOID AS $$
DECLARE
  v_bed_id UUID;
BEGIN
  SELECT bed_id INTO v_bed_id
  FROM bed_allocations
  WHERE tenancy_id = p_tenancy_id AND released_at IS NULL
  FOR UPDATE;

  IF v_bed_id IS NULL THEN
    RAISE EXCEPTION 'No active allocation for tenancy %', p_tenancy_id;
  END IF;

  UPDATE bed_allocations SET released_at = NOW()
  WHERE tenancy_id = p_tenancy_id AND released_at IS NULL;

  UPDATE beds SET status = 'available' WHERE id = v_bed_id;

  UPDATE tenancies
  SET status = 'checked_out', check_out_date = p_check_out_date, updated_at = NOW()
  WHERE id = p_tenancy_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Generate bills idempotently
-- ============================================================
CREATE OR REPLACE FUNCTION generate_monthly_bills(
  p_property_id UUID,
  p_billing_period TEXT, -- YYYY-MM
  p_created_by UUID
) RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_tenancy RECORD;
  v_invoice_id UUID;
  v_invoice_no TEXT;
  v_due_date DATE;
BEGIN
  v_due_date := (p_billing_period || '-05')::DATE;

  FOR v_tenancy IN
    SELECT t.id AS tenancy_id, t.tenant_id, t.monthly_rent,
           tn.id AS tnid
    FROM tenancies t
    JOIN tenants tn ON tn.id = t.tenant_id
    WHERE t.property_id = p_property_id
      AND t.status = 'active'
  LOOP
    v_invoice_no := 'INV-' || p_billing_period || '-' || SUBSTRING(v_tenancy.tenancy_id::TEXT, 1, 8);

    INSERT INTO invoices (tenancy_id, tenant_id, property_id, billing_period, invoice_no, due_date, total_amount, balance_due, status, created_by)
    VALUES (v_tenancy.tenancy_id, v_tenancy.tenant_id, p_property_id, p_billing_period, v_invoice_no, v_due_date, v_tenancy.monthly_rent, v_tenancy.monthly_rent, 'sent', p_created_by)
    ON CONFLICT (tenancy_id, billing_period) DO NOTHING;

    IF FOUND THEN
      INSERT INTO invoice_lines (invoice_id, description, amount, line_type)
      VALUES (
        (SELECT id FROM invoices WHERE tenancy_id = v_tenancy.tenancy_id AND billing_period = p_billing_period),
        'Monthly Rent - ' || p_billing_period,
        v_tenancy.monthly_rent,
        'rent'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

