import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView, ConfirmDialog } from '../../src/components/ui';

export default function OwnerApprovalsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [decryptedPan, setDecryptedPan] = useState<string | null>(null);
  const [panError, setPanError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Checkout requests (migration 010)
  const [checkoutToApprove, setCheckoutToApprove] = useState<any>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const { data: queue = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-approvals-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const openReviewModal = async (reg: any) => {
    setSelectedReg(reg);
    setDecryptedPan(null);
    setPanError(null);
    if (reg.pan_encrypted) {
      try {
        const { data: pan, error } = await supabase.rpc('decrypt_pan', {
          encrypted_pan: reg.pan_encrypted,
        });
        if (error || !pan) {
          // Never fall back to printing the ciphertext - it is a
          // meaningless base64 blob and looks like a bug to the owner.
          setPanError('PAN could not be decrypted (decryption unavailable).');
        } else {
          setDecryptedPan(pan);
        }
      } catch {
        setPanError('PAN could not be decrypted (decryption unavailable).');
      }
    }
  };

  const approveOwnerMutation = useMutation({
    mutationFn: async (regId: string) => {
      setActionLoading(true);

      const { data: prop } = await supabase.from('properties').select('id').limit(1).single();
      const propertyId = selectedReg.property_id || prop?.id;

      // 1. Update registration
      const { error: rError } = await supabase
        .from('tenant_registrations')
        .update({
          status: 'approved',
          reviewer_id: user?.id,
          reviewed_at: new Date().toISOString(),
          decision_reason: 'Approved by Owner (Super Admin Authority)',
        })
        .eq('id', regId);

      if (rError) throw rError;

      // 2. Activate formal tenant
      await supabase.from('tenants').upsert(
        {
          user_id: selectedReg.user_id,
          registration_id: regId,
          property_id: propertyId,
          category: selectedReg.category,
          full_name: selectedReg.full_name,
          phone: selectedReg.phone,
        },
        { onConflict: 'user_id' }
      );

      // 3. Audit
      await supabase.from('audit_events').insert({
        actor_id: user?.id,
        action: 'OWNER_FINAL_APPROVE',
        table_name: 'tenant_registrations',
        record_id: regId,
      });
    },
    onSuccess: () => {
      setActionLoading(false);
      setSelectedReg(null);
      queryClient.invalidateQueries({ queryKey: ['owner-approvals-queue'] });
      queryClient.invalidateQueries({ queryKey: ['owner-overall-stats'] });
      Alert.alert('Final Approval Granted', 'Tenant login is activated immediately.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Approval failed');
    },
  });

  // ── Checkout requests: form filled by the tenant, decided here ──
  const { data: checkoutQueue = [], refetch: refetchCheckouts } = useQuery({
    queryKey: ['owner-checkout-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkout_requests')
        .select('*, tenant:tenants(user_id, registration_id)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const approveCheckoutMutation = useMutation({
    mutationFn: async (req: any) => {
      setCheckoutBusy(true);

      // 1. Remember every uploaded document path BEFORE the purge.
      const docPaths: string[] = [];
      const photoPaths: string[] = [];
      const tenantUserId = req.tenant?.user_id;
      if (tenantUserId) {
        const { data: files } = await supabase.storage
          .from('tenant_docs')
          .list(tenantUserId, { limit: 200 });
        (files || []).forEach((f: any) => {
          if (f?.name) docPaths.push(`${tenantUserId}/${f.name}`);
        });
      }
      if (req.tenant_id) {
        const { data: files } = await supabase.storage
          .from('complaint_photos')
          .list(req.tenant_id, { limit: 200 });
        (files || []).forEach((f: any) => {
          if (f?.name) photoPaths.push(`${req.tenant_id}/${f.name}`);
        });
      }

      // 2. Server side: archive to former_tenants, then delete everything.
      const { error } = await supabase.rpc('decide_checkout', {
        p_request_id: req.id,
        p_approve: true,
      });
      if (error) {
        if ((error as any)?.code === 'PGRST202') {
          throw new Error(
            'Checkout service is not enabled yet. Run supabase/migrations/010_checkout_and_policies.sql in the Supabase SQL Editor first.'
          );
        }
        throw new Error(error.message || 'Checkout approval failed');
      }

      // 3. Delete the document files themselves. Best effort: the DB rows
      //    are already gone, so anything left is unreachable anyway.
      if (docPaths.length) {
        const { error: rmErr } = await supabase.storage.from('tenant_docs').remove(docPaths);
        if (rmErr) console.warn('[checkout] tenant_docs purge:', rmErr.message);
      }
      if (photoPaths.length) {
        const { error: rmErr } = await supabase.storage.from('complaint_photos').remove(photoPaths);
        if (rmErr) console.warn('[checkout] complaint_photos purge:', rmErr.message);
      }

      return true;
    },
    onSuccess: () => {
      setCheckoutBusy(false);
      setCheckoutToApprove(null);
      refetchCheckouts();
      queryClient.invalidateQueries({ queryKey: ['owner-approvals-queue'] });
      queryClient.invalidateQueries({ queryKey: ['former-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['owner-overall-stats'] });
      Alert.alert(
        'Checkout Approved',
        'The tenant is archived under Former Tenants. All personal documents and records were permanently deleted.'
      );
    },
    onError: (err: any) => {
      setCheckoutBusy(false);
      setCheckoutToApprove(null);
      Alert.alert('Checkout Not Approved', err?.message || 'Something went wrong.');
    },
  });

  const rejectCheckoutMutation = useMutation({
    mutationFn: async (req: any) => {
      setCheckoutBusy(true);
      const { error } = await supabase.rpc('decide_checkout', {
        p_request_id: req.id,
        p_approve: false,
        p_reason: rejectReason.trim(),
      });
      if (error) {
        if ((error as any)?.code === 'PGRST202') {
          throw new Error(
            'Checkout service is not enabled yet. Run supabase/migrations/010_checkout_and_policies.sql in the Supabase SQL Editor first.'
          );
        }
        throw new Error(error.message || 'Could not reject the request');
      }
      return true;
    },
    onSuccess: () => {
      setCheckoutBusy(false);
      setRejectTarget(null);
      setRejectReason('');
      refetchCheckouts();
      queryClient.invalidateQueries({ queryKey: ['owner-approvals-queue'] });
      Alert.alert('Request Rejected', 'The tenant has been notified with your reason.');
    },
    onError: (err: any) => {
      setCheckoutBusy(false);
      Alert.alert('Could Not Reject', err?.message || 'Something went wrong.');
    },
  });

  if (isLoading) return <LoadingView message="Loading master registrations..." />;

  const pending = queue.filter((r: any) => r.status === 'pending');
  const processed = queue.filter((r: any) => r.status !== 'pending');
  const checkoutPending = checkoutQueue.filter((r: any) => r.status === 'pending');
  const checkoutDecided = checkoutQueue.filter((r: any) => r.status !== 'pending');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Owner Approvals & Signoff"
        subtitle={`${pending.length} pending final authority decision`}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        <Text style={[styles.sectionHeading, { color: theme.text }]}>ACTION REQUIRED</Text>
        {pending.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="No Pending Approvals"
            description="All tenant submissions have been reviewed and finalized."
          />
        ) : (
          pending.map((reg: any) => (
            <Card key={reg.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]}>{reg.full_name}</Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>
                    {reg.category === 'student' ? `🎓 ${reg.college_name || 'Student'}` : `💼 ${reg.company_name || 'Employee'}`}
                  </Text>
                  <Text style={[styles.date, { color: theme.textMuted }]}>
                    Submitted {formatDate(reg.created_at)}
                  </Text>
                </View>
                <Badge label={reg.status} status={reg.status} />
              </View>

              <View style={[styles.cardBottom, { borderTopColor: theme.border }]}>
                <Button
                  title="👑 Review & Approve Final"
                  variant="primary"
                  size="sm"
                  onPress={() => openReviewModal(reg)}
                />
              </View>
            </Card>
          ))
        )}

        {processed.length > 0 && (
          <>
            <Text style={[styles.sectionHeading, { color: theme.text, marginTop: Spacing.xl }]}>
              RECENTLY DECIDED
            </Text>
            {processed.slice(0, 10).map((reg: any) => (
              <Card key={reg.id} style={styles.processedCard}>
                <View style={styles.processedRow}>
                  <View>
                    <Text style={[styles.name, { color: theme.text }]}>{reg.full_name}</Text>
                    <Text style={[styles.sub, { color: theme.textSecondary }]}>
                      {reg.category?.toUpperCase()} · {formatDate(reg.created_at)}
                    </Text>
                  </View>
                  <Badge label={reg.status} status={reg.status} size="sm" />
                </View>
              </Card>
            ))}
          </>
        )}
        {/* ── Checkout requests (date + time + feedback) ── */}
        <Text style={[styles.sectionHeading, { color: theme.text, marginTop: Spacing.xl }]}>
          🚪 CHECKOUT REQUESTS
        </Text>
        {checkoutPending.length === 0 ? (
          <EmptyState
            icon="🚪"
            title="No Checkout Requests"
            description="Tenant move-out forms (date, time and feedback) appear here for your approval."
          />
        ) : (
          checkoutPending.map((req: any) => (
            <Card key={req.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]}>{req.tenant_name}</Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>
                    📅 {formatDate(req.check_out_date)} · 🕐 {req.check_out_time}
                    {req.room_label ? ` · Room ${req.room_label}` : ''}
                    {req.bed_label ? ` · Bed ${req.bed_label}` : ''}
                  </Text>
                  <Text style={[styles.date, { color: theme.textMuted }]}>
                    Requested {formatDate(req.created_at)}
                  </Text>
                </View>
                <Badge label="pending" status="pending" />
              </View>

              <View style={[styles.feedbackBox, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>
                  TENANT FEEDBACK
                </Text>
                <Text style={[styles.feedback, { color: theme.text }]}>{req.feedback}</Text>
              </View>

              <View style={styles.checkoutBtns}>
                <Button
                  title="Reject"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setRejectTarget(req);
                    setRejectReason('');
                    setRejectError('');
                  }}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="✅ Approve & Delete Data"
                  variant="danger"
                  size="sm"
                  onPress={() => setCheckoutToApprove(req)}
                  style={{ flex: 1.3 }}
                />
              </View>
            </Card>
          ))
        )}

        {checkoutDecided.length > 0 && (
          <Card style={styles.processedCard}>
            {checkoutDecided.slice(0, 8).map((req: any) => (
              <View key={req.id} style={styles.processedRow}>
                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                  <Text style={[styles.name, { color: theme.text }]}>{req.tenant_name}</Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>
                    {formatDate(req.check_out_date)} · {req.check_out_time}
                    {req.decided_at ? ` · decided ${formatDate(req.decided_at)}` : ''}
                  </Text>
                </View>
                <Badge label={req.status} status={req.status} size="sm" />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Owner Review Modal */}
      <Modal visible={!!selectedReg} transparent animationType="slide">
        {selectedReg && (
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Owner Final Sign-off</Text>
              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                {selectedReg.full_name} ({selectedReg.category?.toUpperCase()})
              </Text>

              <View style={[styles.infoBox, { backgroundColor: theme.surfaceAlt }]}>
                <View style={styles.infoRow}><Text style={[styles.iLabel, { color: theme.textSecondary }]}>Phone:</Text><Text style={[styles.iVal, { color: theme.text }]}>{selectedReg.phone}</Text></View>
                <View style={styles.infoRow}><Text style={[styles.iLabel, { color: theme.textSecondary }]}>Address:</Text><Text style={[styles.iVal, { color: theme.text }]}>{selectedReg.permanent_address}</Text></View>
                {selectedReg.category === 'employee' && (
                  <>
                    <View style={styles.infoRow}>
                      <Text style={[styles.iLabel, { color: theme.textSecondary }]}>Decrypted PAN (Owner Only):</Text>
                      <Text style={[styles.iVal, { color: theme.primary, fontFamily: Typography.fontFamily.bold }]}>
                        {decryptedPan || panError || 'N/A'}
                      </Text>
                    </View>
                    {!!panError && (
                      <Text style={[styles.iHint, { color: theme.textSecondary }]}>
                        Run migration 009_pan_decrypt_and_realtime.sql to enable PAN decryption.
                      </Text>
                    )}
                  </>
                )}
              </View>

              <View style={styles.modalBtns}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setSelectedReg(null)}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="Approve & Activate"
                  variant="primary"
                  onPress={() => approveOwnerMutation.mutate(selectedReg.id)}
                  isLoading={actionLoading}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* Checkout approval — the deletion warning */}
      <ConfirmDialog
        visible={!!checkoutToApprove}
        title="⚠️ Approve & Delete Tenant Data?"
        message={
          `Approving will PERMANENTLY delete ${checkoutToApprove?.tenant_name ?? 'this tenant'}’s ` +
          `uploaded documents (photo, Aadhaar, address proof, PAN, avatar and complaint photos), ` +
          `registration record, invoices, payments and their login.\n\n` +
          `Their name, address, phone, family contact number and feedback are kept in ` +
          `Owner → Former Tenants.\n\n` +
          `Settle rent and deposit first. This cannot be undone.`
        }
        confirmLabel="Yes, Approve & Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() =>
          checkoutToApprove && approveCheckoutMutation.mutate(checkoutToApprove)
        }
        onCancel={() => setCheckoutToApprove(null)}
        isLoading={checkoutBusy}
      />

      {/* Checkout rejection — mandatory reason */}
      <Modal visible={!!rejectTarget} transparent animationType="slide">
        {rejectTarget && (
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Reject Checkout Request
              </Text>
              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                {rejectTarget.tenant_name} · {formatDate(rejectTarget.check_out_date)} at{' '}
                {rejectTarget.check_out_time}
              </Text>

              <Input
                label="Reason for rejection"
                placeholder="Tell the tenant why this request cannot be approved"
                value={rejectReason}
                onChangeText={(v) => {
                  setRejectReason(v);
                  setRejectError('');
                }}
                error={rejectError}
                multiline
                numberOfLines={3}
                style={{ minHeight: 90, textAlignVertical: 'top' }}
                required
              />

              <View style={styles.modalBtns}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setRejectTarget(null)}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="Reject Request"
                  variant="danger"
                  onPress={() => {
                    if (!rejectReason.trim()) {
                      setRejectError('A rejection reason is required');
                      return;
                    }
                    rejectCheckoutMutation.mutate(rejectTarget);
                  }}
                  isLoading={checkoutBusy}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  sectionHeading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  card: { marginBottom: Spacing.md, padding: Spacing.base },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  date: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  cardBottom: { marginTop: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.xs },
  feedbackBox: { padding: Spacing.sm, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  feedbackLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  feedback: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  checkoutBtns: { flexDirection: 'row', marginTop: Spacing.sm },
  processedCard: { marginBottom: Spacing.xs, padding: Spacing.sm },
  processedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base },
  infoBox: { padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.base, gap: Spacing.xs },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  iLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  iVal: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, flex: 1, textAlign: 'right', marginLeft: Spacing.md },
  iHint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: Spacing.xs, textAlign: 'right' },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
