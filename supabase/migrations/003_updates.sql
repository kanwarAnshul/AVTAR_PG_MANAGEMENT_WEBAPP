-- ============================================================
-- AVTAR PG MANAGER — Migration 003: Q4 Updates
-- Run this in Supabase SQL Editor (after 001 + 002)
-- Covers: theme-safe data saves, dues reminders, due-day rule,
-- profiles/rooms/notices/privacy, warden activity, tenant
-- requests, daily presence, emergency alerts.
-- ============================================================

-- ── 1. Tenancies: monthly due day (allocation date default) ──
ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS due_day INT DEFAULT 5;
-- Backfill from check-in date where missing
UPDATE tenancies SET due_day = EXTRACT(DAY FROM check_in_date)::INT
WHERE due_day IS NULL OR due_day < 1 OR due_day > 31;

-- ── 2. Rooms: listing fields (BHK, photos, videos, location) ──
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'studio';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';

-- ── 3. Notices: fine support ──
ALTER TABLE notices ADD COLUMN IF NOT EXISTS fine_amount INT;  -- paise
ALTER TABLE notices ADD COLUMN IF NOT EXISTS damaged_item TEXT;

-- ── 4. New enums ──
DO $$ BEGIN CREATE TYPE tenant_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE presence_status AS ENUM ('present', 'absent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend notice_type with 'fine' if enum is used
ALTER TYPE notice_type ADD VALUE IF NOT EXISTS 'fine';

-- ── 5. Tenant amenity / requirement requests ──
CREATE TABLE IF NOT EXISTS tenant_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id         UUID REFERENCES rooms(id),
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'other',
  status          tenant_request_status NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  reviewer_id     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Daily presence marking ──
CREATE TABLE IF NOT EXISTS daily_presence (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  presence_date DATE NOT NULL,
  status        presence_status NOT NULL,
  marked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, presence_date)
);
CREATE INDEX IF NOT EXISTS idx_presence_date ON daily_presence(presence_date);
CREATE INDEX IF NOT EXISTS idx_presence_room ON daily_presence(room_id, presence_date);

-- ── 7. Emergency room alerts ──
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. App settings (privacy policy etc.) ──
CREATE TABLE IF NOT EXISTS app_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  updated_by  UUID REFERENCES profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. Warden invites audit ──
CREATE TABLE IF NOT EXISTS warden_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id),
  email       TEXT,
  phone       TEXT,
  channel     TEXT NOT NULL DEFAULT 'email',
  status      TEXT NOT NULL DEFAULT 'sent',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. RLS: enable + policies for new tables ──
ALTER TABLE tenant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE warden_invites ENABLE ROW LEVEL SECURITY;

-- Tenant requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_requests' AND policyname = 'tenant_full_own_requests') THEN
    CREATE POLICY "tenant_full_own_requests" ON tenant_requests FOR ALL
      USING (tenant_id = my_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_requests' AND policyname = 'warden_full_requests') THEN
    CREATE POLICY "warden_full_requests" ON tenant_requests FOR ALL
      USING (property_id IN (SELECT warden_property_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_requests' AND policyname = 'owner_full_requests') THEN
    CREATE POLICY "owner_full_requests" ON tenant_requests FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- Daily presence (tenant writes own, warden/owner read property, roommates read same room)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'tenant_writes_own_presence') THEN
    CREATE POLICY "tenant_writes_own_presence" ON daily_presence FOR ALL
      USING (tenant_id = my_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'tenant_reads_room_presence') THEN
    CREATE POLICY "tenant_reads_room_presence" ON daily_presence FOR SELECT
      USING (room_id IN (SELECT room_id FROM tenancies WHERE tenant_id = my_tenant_id() AND status = 'active'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'warden_full_presence') THEN
    CREATE POLICY "warden_full_presence" ON daily_presence FOR ALL
      USING (property_id IN (SELECT warden_property_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_presence' AND policyname = 'owner_full_presence') THEN
    CREATE POLICY "owner_full_presence" ON daily_presence FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- Emergency alerts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'tenant_full_own_alerts') THEN
    CREATE POLICY "tenant_full_own_alerts" ON emergency_alerts FOR ALL
      USING (tenant_id = my_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'tenant_reads_room_alerts') THEN
    CREATE POLICY "tenant_reads_room_alerts" ON emergency_alerts FOR SELECT
      USING (room_id IN (SELECT room_id FROM tenancies WHERE tenant_id = my_tenant_id() AND status = 'active'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'warden_full_alerts') THEN
    CREATE POLICY "warden_full_alerts" ON emergency_alerts FOR ALL
      USING (property_id IN (SELECT warden_property_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'emergency_alerts' AND policyname = 'owner_full_alerts') THEN
    CREATE POLICY "owner_full_alerts" ON emergency_alerts FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- App settings (privacy policy)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'public_read_settings') THEN
    CREATE POLICY "public_read_settings" ON app_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'owner_write_settings') THEN
    CREATE POLICY "owner_write_settings" ON app_settings FOR ALL USING (is_owner());
  END IF;
END $$;

-- Warden invites
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'warden_invites' AND policyname = 'owner_full_invites') THEN
    CREATE POLICY "owner_full_invites" ON warden_invites FOR ALL USING (is_owner());
  END IF;
END $$;

-- ── 11. FIX: notifications — owner/warden must be able to notify tenants ──
-- Remove the old restrictive policy (policy only — NO table/data is deleted),
-- then add role-aware rules.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_own_notifications') THEN
    DROP POLICY "users_own_notifications" ON notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_read_own_notifications') THEN
    CREATE POLICY "users_read_own_notifications" ON notifications FOR SELECT
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_update_own_notifications') THEN
    CREATE POLICY "users_update_own_notifications" ON notifications FOR UPDATE
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'owner_can_notify_anyone') THEN
    CREATE POLICY "owner_can_notify_anyone" ON notifications FOR INSERT
      WITH CHECK (is_owner());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'warden_can_notify_property') THEN
    CREATE POLICY "warden_can_notify_property" ON notifications FOR INSERT
      WITH CHECK (is_warden());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'users_insert_own_notifications') THEN
    CREATE POLICY "users_insert_own_notifications" ON notifications FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── 12. FIX: tenant self-update for presence quick-path (defaults already safe) ──
-- Allow tenants to update their own tenancy due_day (before-15th rule is
-- enforced in the app; RLS here only scopes to own row).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenancies' AND policyname = 'tenant_update_own_tenancy_due_day') THEN
    CREATE POLICY "tenant_update_own_tenancy_due_day" ON tenancies FOR UPDATE
      USING (tenant_id = my_tenant_id());
  END IF;
END $$;

-- ── 13. Helpful indexes ──
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_requests_tenant ON tenant_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_room ON emergency_alerts(room_id, is_active);
