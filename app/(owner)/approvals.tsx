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
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function OwnerApprovalsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [decryptedPan, setDecryptedPan] = useState<string | null>(null);
  const [panError, setPanError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  if (isLoading) return <LoadingView message="Loading master registrations..." />;

  const pending = queue.filter((r: any) => r.status === 'pending');
  const processed = queue.filter((r: any) => r.status !== 'pending');

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
