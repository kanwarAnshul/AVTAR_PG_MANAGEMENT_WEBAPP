import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, isValid, parse } from 'date-fns';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate, formatCurrency, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, ConfirmDialog, LoadingView } from '../../src/components/ui';
import { ProfileEditor } from '../../src/components/ProfileEditor';
import { ThemePicker } from '../../src/components/ThemePicker';

const TIME_SLOTS = [
  { value: '06:00', label: '6:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '18:00', label: '6:00 PM' },
  { value: '21:00', label: '9:00 PM' },
];

export default function TenantProfileScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user, profile, signOut } = useAuthStore();

  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  // Checkout form (all three fields required)
  const [coDate, setCoDate] = useState('');
  const [coTime, setCoTime] = useState('');
  const [coFeedback, setCoFeedback] = useState('');
  const [coErrors, setCoErrors] = useState<{ date?: string; time?: string; feedback?: string }>({});
  const [coSubmitting, setCoSubmitting] = useState(false);

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const quickDates = useMemo(
    () =>
      [0, 1, 2, 3, 4].map((i) => {
        const d = addDays(new Date(), i);
        return {
          iso: format(d, 'yyyy-MM-dd'),
          label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(d, 'EEE dd MMM'),
        };
      }),
    []
  );

  const { data: tenantInfo, isLoading } = useQuery({
    queryKey: ['tenant-profile-details', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select(`
          *,
          property:properties(*),
          registration:tenant_registrations(*),
          tenancy:tenancies!inner(
            id, monthly_rent, deposit_paid, check_in_date, status,
            room:rooms(room_no, sharing_type),
            bed:beds(label)
          )
        `)
        .eq('user_id', user.id)
        .eq('tenancies.status', 'active')
        .maybeSingle();

      return tenant;
    },
    enabled: !!user,
  });

  // Migration 010: the checkout request this tenant sent to the owner.
  // If 010 is not applied yet the query simply returns nothing.
  const { data: checkoutRows = [], refetch: refetchCheckout } = useQuery({
    queryKey: ['tenant-checkout-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkout_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const pendingCheckout = checkoutRows.find((r: any) => r.status === 'pending');
  const lastDecision = checkoutRows.find((r: any) => r.status !== 'pending');

  const validateCheckout = (): boolean => {
    const errs: { date?: string; time?: string; feedback?: string } = {};

    const parsedDate = parse(coDate, 'yyyy-MM-dd', new Date());
    if (!coDate || !isValid(parsedDate) || format(parsedDate, 'yyyy-MM-dd') !== coDate) {
      errs.date = 'Enter a valid date (YYYY-MM-DD)';
    } else if (coDate < todayIso) {
      errs.date = 'Checkout date cannot be in the past';
    }

    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(coTime.trim())) {
      errs.time = 'Enter a valid time (HH:MM, 24-hour)';
    }

    if (coFeedback.trim().length < 10) {
      errs.feedback = 'Please write at least 10 characters of feedback';
    }

    setCoErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitCheckout = async () => {
    if (!validateCheckout()) return;
    setCoSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_checkout_request', {
        p_check_out_date: coDate,
        p_check_out_time: coTime.trim(),
        p_feedback: coFeedback.trim(),
      });
      if (error) {
        if ((error as any)?.code === 'PGRST202') {
          throw new Error(
            'Checkout is not enabled yet. Ask the owner to run migration 010_checkout_and_policies.sql in Supabase.'
          );
        }
        throw new Error(error.message || friendlyDbError(error));
      }

      setCheckoutModalVisible(false);
      setCoDate('');
      setCoTime('');
      setCoFeedback('');
      setCoErrors({});
      await refetchCheckout();
      Alert.alert(
        'Checkout Request Sent',
        'Your date, time and feedback have been sent to the owner for approval. You will be notified once it is decided.'
      );
    } catch (err: any) {
      Alert.alert('Could Not Send Request', err?.message || 'Please try again.');
    } finally {
      setCoSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  if (isLoading) return <LoadingView message="Loading profile..." />;

  const tenancy = (tenantInfo?.tenancy as any)?.[0];
  const reg = tenantInfo?.registration;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="My Profile" subtitle="Account & Tenancy details" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Card */}
        <Card variant="elevated" style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: Colors.primary }]}>
              <Text style={styles.avatarText}>
                {(tenantInfo?.full_name || profile?.full_name || 'T')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={[styles.profileName, { color: theme.text }]}>
                {tenantInfo?.full_name || profile?.full_name}
              </Text>
              <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                {profile?.email}
              </Text>
              <View style={{ marginTop: 4, flexDirection: 'row', gap: 6 }}>
                <Badge
                  label={tenantInfo?.category ?? 'tenant'}
                  status={tenantInfo?.category}
                  color={
                    tenantInfo?.category === 'student'
                      ? { bg: '#E8EDD4', text: '#3F4C1C' }
                      : { bg: '#FBEEDA', text: '#8A5A12' }
                  }
                  size="sm"
                />
                <Badge label="ACTIVE" status="approved" size="sm" />
              </View>
            </View>
          </View>
        </Card>

        {/* One-time locked profile: only photo + password editable */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: Spacing.sm }]}>🔒 ONE-TIME PROFILE (PHOTO & PASSWORD ONLY)</Text>
        <ProfileEditor tenantMode />

        {/* Stay & Bed Info */}
        {tenancy && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🛏️ ALLOCATED ACCOMMODATION</Text>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Property</Text>
              <Text style={[styles.value, { color: theme.text }]}>{tenantInfo?.property?.name}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Room & Bed</Text>
              <Text style={[styles.value, { color: theme.text }]}>Room {tenancy.room?.room_no} · Bed {tenancy.bed?.label}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Monthly Rent</Text>
              <Text style={[styles.value, { color: theme.text }]}>{formatCurrency(tenancy.monthly_rent)}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Security Deposit Paid</Text>
              <Text style={[styles.value, { color: theme.text }]}>{formatCurrency(tenancy.deposit_paid)}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Check-In Date</Text>
              <Text style={[styles.value, { color: theme.text }]}>{formatDate(tenancy.check_in_date)}</Text>
            </View>
          </Card>
        )}

        {/* Category Details */}
        {reg && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {tenantInfo?.category === 'student' ? '🎓 ACADEMIC RECORD' : '💼 EMPLOYMENT RECORD'}
            </Text>
            {tenantInfo?.category === 'student' ? (
              <>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>College</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.college_name}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Roll No</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.roll_number}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Course</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.course}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Company</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.company_name}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Employee ID</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.employee_id}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Work Email</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.work_email}</Text>
                </View>
              </>
            )}
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Emergency Contact</Text>
              <Text style={[styles.value, { color: theme.text }]}>
                {reg.family_contact_name} ({reg.family_relation}) · {reg.family_contact_phone}
              </Text>
            </View>
          </Card>
        )}

        {/* Pending checkout request status */}
        {pendingCheckout && (
          <Card style={styles.sectionCard}>
            <View style={styles.rowItem}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                🚪 CHECKOUT REQUEST
              </Text>
              <Badge label="AWAITING OWNER" status="pending" size="sm" />
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Date</Text>
              <Text style={[styles.value, { color: theme.text }]}>
                {formatDate(pendingCheckout.check_out_date)}
              </Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Time</Text>
              <Text style={[styles.value, { color: theme.text }]}>{pendingCheckout.check_out_time}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Submitted</Text>
              <Text style={[styles.value, { color: theme.text }]}>
                {formatDate(pendingCheckout.created_at)}
              </Text>
            </View>
            <Text style={[styles.feedbackText, { color: theme.textSecondary }]}>
              “{pendingCheckout.feedback}”
            </Text>
          </Card>
        )}

        {/* Preferences & Actions */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>⚙️ PREFERENCES & ACTIONS</Text>
          <Text style={[styles.label, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>Your theme (applies to the whole app for you)</Text>
          <ThemePicker />

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomColor: theme.border, marginTop: Spacing.sm }]}
            onPress={() => router.push('/policy?type=privacy')}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.text }]}>📜 Privacy Policy</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                How your data is handled
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/policy?type=terms')}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.text }]}>🧾 Terms & Conditions</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Rules of your stay at the PG
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomColor: theme.border }]}
            onPress={() => setCheckoutModalVisible(true)}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.warning }]}>
                {pendingCheckout ? 'View Checkout Request' : 'Initiate Checkout'}
              </Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                {pendingCheckout
                  ? `Requested for ${formatDate(pendingCheckout.check_out_date)} · awaiting approval`
                  : 'Move-out form: date, time & feedback'}
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.warning }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomWidth: 0 }]}
            onPress={() => setLogoutModalVisible(true)}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.error }]}>Log Out</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Sign out of this device
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.error }}>🚪</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {/* Checkout form / status */}
      <Modal
        visible={checkoutModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckoutModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              {pendingCheckout ? 'Checkout Request Pending' : 'Request Checkout'}
            </Text>

            {pendingCheckout ? (
              <>
                <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
                  Your request is waiting for the owner’s approval.
                </Text>
                <View style={[styles.summary, { backgroundColor: theme.surfaceAlt }]}>
                  <View style={styles.rowItem}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>Date</Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      {formatDate(pendingCheckout.check_out_date)}
                    </Text>
                  </View>
                  <View style={styles.rowItem}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>Time</Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      {pendingCheckout.check_out_time}
                    </Text>
                  </View>
                  <View style={styles.rowItem}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>Room / Bed</Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      {pendingCheckout.room_label || '—'}
                      {pendingCheckout.bed_label ? ` · ${pendingCheckout.bed_label}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.feedbackText, { color: theme.textSecondary }]}>
                    “{pendingCheckout.feedback}”
                  </Text>
                </View>
                {lastDecision?.status === 'rejected' && (
                  <Text style={[styles.rejectNote, { color: theme.error }]}>
                    Earlier request rejected: {lastDecision.decision_reason || 'no reason given'}
                  </Text>
                )}
                <Button
                  title="Close"
                  variant="secondary"
                  onPress={() => setCheckoutModalVisible(false)}
                  style={{ marginTop: Spacing.md }}
                />
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.stepLabel, { color: theme.text }]}>1. Last day at the PG *</Text>
                <View style={styles.chipRow}>
                  {quickDates.map((d) => (
                    <TouchableOpacity
                      key={d.iso}
                      onPress={() => setCoDate(d.iso)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: coDate === d.iso ? theme.primary : theme.surfaceAlt,
                          borderColor: coDate === d.iso ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: coDate === d.iso ? '#FFFFFF' : theme.text },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Input
                  label="Checkout Date"
                  placeholder="YYYY-MM-DD"
                  value={coDate}
                  onChangeText={(v) => {
                    setCoDate(v);
                    setCoErrors((e) => ({ ...e, date: undefined }));
                  }}
                  error={coErrors.date}
                  keyboardType="numbers-and-punctuation"
                  required
                />

                <Text style={[styles.stepLabel, { color: theme.text, marginTop: Spacing.sm }]}>
                  2. Checkout time *
                </Text>
                <View style={styles.chipRow}>
                  {TIME_SLOTS.map((t) => (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => setCoTime(t.value)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: coTime === t.value ? theme.primary : theme.surfaceAlt,
                          borderColor: coTime === t.value ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: coTime === t.value ? '#FFFFFF' : theme.text },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Input
                  label="Checkout Time"
                  placeholder="HH:MM (24-hour, e.g. 10:30)"
                  value={coTime}
                  onChangeText={(v) => {
                    setCoTime(v);
                    setCoErrors((e) => ({ ...e, time: undefined }));
                  }}
                  error={coErrors.time}
                  autoCapitalize="none"
                  required
                />

                <Text style={[styles.stepLabel, { color: theme.text, marginTop: Spacing.sm }]}>
                  3. Feedback for the owner *
                </Text>
                <Input
                  label="Your Feedback"
                  placeholder="How was your stay? Tell the owner what we did well and what needs fixing."
                  value={coFeedback}
                  onChangeText={(v) => {
                    setCoFeedback(v);
                    setCoErrors((e) => ({ ...e, feedback: undefined }));
                  }}
                  error={coErrors.feedback}
                  multiline
                  numberOfLines={5}
                  style={{ minHeight: 110, textAlignVertical: 'top' }}
                  maxLength={500}
                  required
                />
                <Text style={[styles.counter, { color: theme.textMuted }]}>
                  {coFeedback.length}/500
                </Text>

                <View style={[styles.warnBox, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '55' }]}>
                  <Text style={[styles.warnText, { color: theme.text }]}>
                    ⚠️ On approval the owner will permanently delete your uploaded documents and
                    personal records from the app. Your feedback is kept in the owner’s former-tenant
                    archive. Settle rent and deposit before you request checkout.
                  </Text>
                </View>

                <View style={styles.sheetBtns}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setCheckoutModalVisible(false)}
                    style={{ flex: 1, marginRight: Spacing.sm }}
                  />
                  <Button
                    title="Send Request"
                    variant="primary"
                    onPress={handleSubmitCheckout}
                    isLoading={coSubmitting}
                    style={{ flex: 1 }}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Logout Dialog */}
      <ConfirmDialog
        visible={logoutModalVisible}
        title="Log Out?"
        message="Are you sure you want to sign out of AVTAR PG Manager?"
        confirmLabel="Sign Out"
        variant="danger"
        onConfirm={handleSignOut}
        onCancel={() => setLogoutModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  profileCard: { padding: Spacing.base, marginBottom: Spacing.base },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontFamily: Typography.fontFamily.bold, fontSize: 24 },
  profileName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md },
  profileEmail: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  sectionCard: { marginBottom: Spacing.base, padding: Spacing.base },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  label: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  value: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  prefTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  prefSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  feedbackText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    lineHeight: 18,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  // Checkout sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
    maxHeight: '90%',
  },
  sheetTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  sheetSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  summary: { padding: Spacing.md, borderRadius: BorderRadius.lg },
  stepLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  counter: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 10,
    textAlign: 'right',
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
  warnBox: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.xs,
  },
  warnText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    lineHeight: 18,
  },
  rejectNote: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.xs,
    marginTop: Spacing.sm,
  },
  sheetBtns: { flexDirection: 'row', marginTop: Spacing.md, marginBottom: Spacing.sm },
});
