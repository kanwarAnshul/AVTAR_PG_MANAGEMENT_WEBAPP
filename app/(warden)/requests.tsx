import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';
import { sendNotification } from '../../src/services/messaging';

export default function WardenRequestsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [deciding, setDeciding] = useState<any>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: requests = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-tenant-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_requests')
        .select('*, tenant:tenants(full_name, phone, user_id)')
        .order('created_at', { ascending: false });
      if (error) throw new Error(friendlyDbError(error));
      return data || [];
    },
  });

  const decideMutation = useMutation({
    mutationFn: async () => {
      if (!deciding) return;
      if (decision === 'rejected' && !reason.trim()) {
        throw new Error('A reason is required when rejecting a request');
      }
      setSaving(true);
      const { error } = await supabase
        .from('tenant_requests')
        .update({
          status: decision,
          decision_reason: reason.trim() || null,
          reviewer_id: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deciding.id);
      if (error) throw new Error(friendlyDbError(error));

      try {
        await supabase.from('audit_events').insert({
          actor_id: user?.id,
          action: decision === 'approved' ? 'APPROVE_REQUEST' : 'REJECT_REQUEST',
          table_name: 'tenant_requests',
          record_id: deciding.id,
          new_data: { status: decision, reason: reason.trim() },
        });
      } catch { /* non-fatal audit */ }

      const tenantUserId = deciding.tenant?.user_id;
      if (tenantUserId) {
        await sendNotification({
          userId: tenantUserId,
          type: 'request_update',
          title: decision === 'approved' ? '✅ Request Approved' : '❌ Request Rejected',
          body: decision === 'approved'
            ? `Your request "${deciding.title}" was approved.`
            : `Your request "${deciding.title}" was rejected. Reason: ${reason.trim()}`,
          data: { request_id: deciding.id },
        });
      }
    },
    onSuccess: () => {
      setSaving(false);
      setDeciding(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['warden-tenant-requests'] });
      Alert.alert('Request Updated', 'The tenant has been notified of your decision.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Update Failed', err?.message ?? 'Could not update request');
    },
  });

  if (isLoading) return <LoadingView message="Loading tenant requests..." />;

  const pending = requests.filter((r: any) => r.status === 'pending');
  const decided = requests.filter((r: any) => r.status !== 'pending');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Tenant Requests" subtitle="Review amenity & requirement requests" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        <Text style={[styles.heading, { color: theme.text }]}>PENDING ({pending.length})</Text>
        {pending.length === 0 ? (
          <EmptyState icon="✅" title="No Pending Requests" description="New tenant requirement requests will appear here." />
        ) : (
          pending.map((r: any) => (
            <Card key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.text }]}>{r.title}</Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    {r.tenant?.full_name ?? 'Tenant'} · {r.category?.toUpperCase()} · {formatDate(r.created_at)}
                  </Text>
                </View>
                <Badge label={r.status} status={r.status} size="sm" />
              </View>
              {r.description ? <Text style={[styles.body, { color: theme.textSecondary }]}>{r.description}</Text> : null}
              <View style={[styles.footer, { borderTopColor: theme.border }]}>
                <Button
                  title="Review Request"
                  size="sm"
                  fullWidth={false}
                  variant="primary"
                  onPress={() => { setDeciding(r); setDecision('approved'); setReason(''); }}
                />
                <Text style={[styles.hint, { color: theme.textMuted }]}>Approve or reject with reason →</Text>
              </View>
            </Card>
          ))
        )}

        {decided.length > 0 && (
          <>
            <Text style={[styles.heading, { color: theme.text, marginTop: Spacing.lg }]}>DECIDED ({decided.length})</Text>
            {decided.slice(0, 15).map((r: any) => (
              <Card key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.text }]}>{r.title}</Text>
                    <Text style={[styles.meta, { color: theme.textSecondary }]}>
                      {r.tenant?.full_name ?? 'Tenant'} · {formatDate(r.created_at)}
                    </Text>
                    {r.decision_reason ? (
                      <Text style={[styles.body, { color: r.status === 'approved' ? Colors.success : Colors.error }]}>
                        {r.status === 'approved' ? '✓ ' : '✗ '}{r.decision_reason}
                      </Text>
                    ) : null}
                  </View>
                  <Badge label={r.status} status={r.status} size="sm" />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!deciding} transparent animationType="slide">
        {deciding && (
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Review: {deciding.title}</Text>
              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                {deciding.tenant?.full_name} · {deciding.description ?? 'No description'}
              </Text>
              <View style={styles.decisionRow}>
                <Button
                  title="✅ Approve"
                  variant={decision === 'approved' ? 'primary' : 'secondary'}
                  fullWidth={false}
                  onPress={() => setDecision('approved')}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="❌ Reject"
                  variant={decision === 'rejected' ? 'danger' : 'secondary'}
                  fullWidth={false}
                  onPress={() => setDecision('rejected')}
                  style={{ flex: 1 }}
                />
              </View>
              <Input
                label={decision === 'rejected' ? 'Rejection Reason (required)' : 'Approval Note (optional)'}
                value={reason}
                onChangeText={setReason}
                placeholder={decision === 'rejected' ? 'Why is this not required right now?' : 'e.g. Will be arranged this week'}
                multiline
                numberOfLines={2}
              />
              <View style={styles.modalBtns}>
                <Button title="Cancel" variant="secondary" onPress={() => setDeciding(null)} style={{ flex: 1, marginRight: Spacing.sm }} />
                <Button
                  title={decision === 'approved' ? 'Approve & Notify' : 'Reject & Notify'}
                  variant={decision === 'approved' ? 'primary' : 'danger'}
                  onPress={() => decideMutation.mutate()}
                  isLoading={saving}
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
  heading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  card: { padding: Spacing.base, marginBottom: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  body: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: 4, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.sm },
  hint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginBottom: Spacing.base, lineHeight: 20 },
  decisionRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
