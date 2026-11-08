import { Linking } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { friendlyDbError, DUE_REMINDER_LEAD_DAYS } from '../utils/helpers';
import type { NotificationType } from '../types';

/**
 * Unified notification + email/SMS messaging service.
 *
 * • Push: inserts into the `notifications` table (realtime + badge) and the
 *   same row is picked up by Expo push when push_tokens are registered.
 * • Email/SMS: opens the device mailer / SMS composer with a pre-filled
 *   invitation (works on devices without backend mail services).
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

// ── Warden invite (email / SMS) ───────────────────────────────
export const buildInviteLink = (): string => `avtarpg://invite?policies=invite-warden`;

export const openInviteChannel = async (channel: 'email' | 'sms', to: string): Promise<void> => {
  const link = buildInviteLink();
  const subject = encodeURIComponent('Invitation: AVTAR PG Warden Portal');
  const body = encodeURIComponent(
    `Hello! You have been invited as a Warden for AVTAR SINGH PG.\n\nTap this link to install the app and sign in:\n${link}\n\nRegards,\nAVTAR Singh PG Management`
  );
  const url =
    channel === 'email'
      ? `mailto:${to}?subject=${subject}&body=${body}`
      : `sms:${to}?&body=${body}`;
  await Linking.openURL(url);
};

export const sendWardenInvite = async (email: string, phone: string): Promise<string> => {
  // Store an audit-style invite record if the table exists; always open
  // the mailer/SMS composer as the reliable local fallback.
  try {
    if (isSupabaseConfigured) {
      await supabase.from('notifications').insert({
        user_id: null as any, // placeholder — callers pass a real user id when known
        type: 'invite',
        title: 'Warden invitation drafted',
        body: `Invite prepared for ${email || phone}`,
      } as any);
    }
  } catch {
    // Table may not exist yet — non-fatal.
  }
  await openInviteChannel(phone ? 'sms' : 'email', phone || email);
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
