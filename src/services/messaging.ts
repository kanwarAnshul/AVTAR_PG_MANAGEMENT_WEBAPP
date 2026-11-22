import { Linking } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { friendlyDbError, DUE_REMINDER_LEAD_DAYS } from '../utils/helpers';
import type { NotificationType } from '../types';

/**
 * Unified notification + email messaging service.
 *
 * • Push: inserts into the `notifications` table (realtime + badge) and the
 *   same row is picked up by Expo push when push_tokens are registered.
 * • Email: opens the device mailer with a pre-filled invitation. Password
 *   recovery is email-only — no SMS provider is used anywhere in the app.
 * • Due reminders: scans invoices due within 5 days and notifies tenants.
 */

export interface SendNotificationInput {
  userId: string;
  type?: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export const sendNotification = async (input: SendNotificationInput): Promise<boolean> => {
  if (!isSupabaseConfigured) {
    console.warn('[messaging] Supabase not configured — notification NOT sent (no dummy data):', input.title, input.body);
    return false;
  }
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: input.userId,
      type: input.type ?? 'notice',
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      is_read: false,
    });
    if (error) {
      console.warn('[messaging] notification insert failed:', friendlyDbError(error));
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[messaging] notification error:', friendlyDbError(e));
    return false;
  }
};

export const sendToMany = async (userIds: string[], input: Omit<SendNotificationInput, 'userId'>): Promise<number> => {
  let sent = 0;
  for (const userId of userIds) {
    const ok = await sendNotification({ ...input, userId });
    if (ok) sent += 1;
  }
  return sent;
};

// ── Due reminders (5-day lead) ────────────────────────────────
export const sendDueReminders = async (propertyId?: string, now: Date = new Date()): Promise<number> => {
  if (!isSupabaseConfigured) return 0;
  try {
    const horizon = new Date(now.getTime() + DUE_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const today = now.toISOString().split('T')[0];

    let query = supabase
      .from('invoices')
      .select('id, tenant_id, balance_due, due_date, tenants:user_id')
      .in('status', ['sent', 'partial', 'overdue'])
      .lte('due_date', horizon)
      .gte('due_date', today);
    if (propertyId) query = query.eq('property_id', propertyId);

    const { data, error } = await query;
    if (error || !data) return 0;

    let notified = 0;
    for (const inv of data as any[]) {
      const userId = inv.tenants?.user_id ?? inv.tenant?.user_id;
      if (!userId) continue;
      const ok = await sendNotification({
        userId,
        type: 'rent_due',
        title: 'Rent due soon',
        body: `Your rent of ₹${((inv.balance_due ?? 0) / 100).toFixed(0)} is due on ${inv.due_date}. Please pay before the due date.`,
        data: { invoice_id: inv.id },
      });
      if (ok) notified += 1;
    }
    return notified;
  } catch {
    return 0;
  }
};

// ── Warden invite (email only) ────────────────────────────────
export const buildInviteLink = (): string => `avtarpg://invite?policies=invite-warden`;

export const openEmailInvite = async (to: string): Promise<void> => {
  const link = buildInviteLink();
  const subject = encodeURIComponent('Invitation: AVTAR PG Warden Portal');
  const body = encodeURIComponent(
    `Hello! You have been invited as a Warden for AVTAR SINGH PG.\n\nTap this link to install the app and sign in with the credentials provided by the owner:\n${link}\n\nIf you forget your password, use "Forgot password" on the login screen — a recovery link will be emailed to you.\n\nRegards,\nAVTAR Singh PG Management`
  );
  await Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`);
};

export const sendWardenInvite = async (email: string): Promise<string> => {
  // Open the device mailer as the reliable local fallback — no SMS vendor.
  await openEmailInvite(email);
  return buildInviteLink();
};

// ── Privacy policy ────────────────────────────────────────────
export const DEFAULT_PRIVACY_POLICY = `AVTAR Singh PG — Privacy Policy (v1.0)

We collect only the data needed to run your stay: name, photo, contact, KYC documents, rent and complaint records.

• KYC documents are stored in encrypted storage with signed access links.
• PAN numbers are encrypted at rest (AES-256); only the owner can view them.
• Location and presence data are used solely for safety and operations.
• We never sell personal data. You may request export or deletion anytime via the owner office.

Contact: avtar.singh@avtarpg.com · Gurgaon, Haryana.`;

export const fetchPrivacyPolicy = async (): Promise<string> => {
  if (!isSupabaseConfigured) return DEFAULT_PRIVACY_POLICY;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'privacy_policy')
      .maybeSingle();
    return (data as any)?.value ?? DEFAULT_PRIVACY_POLICY;
  } catch {
    return DEFAULT_PRIVACY_POLICY;
  }
};

export const savePrivacyPolicy = async (text: string, updatedBy?: string): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_settings').upsert(
    { key: 'privacy_policy', value: text, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(friendlyDbError(error));
};

// ── Terms & Conditions (separate section from the privacy policy) ──
export const DEFAULT_TERMS = `AVTAR Singh PG — Terms & Conditions (v1.0)

These terms apply to every tenant staying at AVTAR Singh PG. By accepting them you agree to the following:

1. REGISTRATION — Every tenant must complete one-time registration with valid ID proof and contact details before move-in. Details must be kept up to date.

2. RENT & PAYMENTS — Rent is due on the due day shown in the app each month. Late payment may attract a fine. Payments are recorded in the app; ask the office for a receipt.

3. DEPOSIT — A security deposit is collected at move-in and adjusted against damages, unpaid dues or missing items at checkout.

4. CONDUCT — No loud music after 10 PM, no smoking or alcohol inside rooms, and no guests overnight without prior permission from the warden.

5. ROOM & BED — The allotted room and bed may not be changed or shared without written approval from the owner.

6. DOCUMENTS — KYC documents uploaded in the app are used only for verification. They are deleted when your tenancy is completed at checkout.

7. CHECKOUT — Checkout requires submitting a request in the app with date, time and feedback. On owner approval all your personal documents and records are permanently deleted from the app and archived as a former tenant.

8. LIABILITY — The management is not responsible for loss of personal valuables. Use the provided lockers and inform the warden of any security concern.

9. TERMINATION — The owner may ask a tenant to vacate for rule violations, with reasonable notice.

10. CHANGES — The owner may update these terms; you will be asked to accept the updated version at your next login.

Contact: avtar.singh@avtarpg.com · Gurgaon, Haryana.`;

/** Terms text. Returns '' when the owner has not published any. */
export const fetchTerms = async (): Promise<string> => {
  if (!isSupabaseConfigured) return '';
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'terms_conditions')
      .maybeSingle();
    return (data as any)?.value ?? '';
  } catch {
    return '';
  }
};

export const saveTerms = async (text: string, updatedBy?: string): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_settings').upsert(
    { key: 'terms_conditions', value: text, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(friendlyDbError(error));
};

/** updated_at of the terms text — used to re-prompt after the owner edits it. */
export const fetchTermsUpdatedAt = async (): Promise<string | null> => {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('updated_at')
      .eq('key', 'terms_conditions')
      .maybeSingle();
    return (data as any)?.updated_at ?? null;
  } catch {
    return null;
  }
};

/** Login gate switch. Defaults to ON when the setting is missing. */
export const fetchTermsGateEnabled = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'terms_gate_enabled')
      .maybeSingle();
    if (!data) return false;
    return (data as any).value === 'true';
  } catch {
    return false; // never block login on a network blip
  }
};

export const saveTermsGateEnabled = async (enabled: boolean, updatedBy?: string): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_settings').upsert(
    { key: 'terms_gate_enabled', value: enabled ? 'true' : 'false', updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(friendlyDbError(error));
};
