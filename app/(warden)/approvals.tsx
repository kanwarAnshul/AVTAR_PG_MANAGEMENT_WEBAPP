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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, getSignedUrl } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function WardenApprovalsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | 'student' | 'employee'>('all');
  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const { data: registrations = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-registrations-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_registrations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const openDetailModal = async (reg: any) => {
    setSelectedReg(reg);
    const urls: Record<string, string> = {};
    try {
      if (reg.photo_url) {
        urls.photo = await getSignedUrl('tenant_docs', reg.photo_url, 120);
      }
      if (reg.address_proof_url) {
        urls.addressProof = await getSignedUrl('tenant_docs', reg.address_proof_url, 120);
      }
      if (reg.aadhaar_front_url) {
        urls.aadhaarFront = await getSignedUrl('tenant_docs', reg.aadhaar_front_url, 120);
      }
      if (reg.aadhaar_back_url) {
        urls.aadhaarBack = await getSignedUrl('tenant_docs', reg.aadhaar_back_url, 120);
      }
    } catch {
      // Storage access fallback
    }
    setDocUrls(urls);
  };

  const approveMutation = useMutation({
    mutationFn: async ({ regId, method }: { regId: string; method: 'digital' | 'manual' }) => {
      setActionLoading(true);

      // 1. Get default property
      const { data: prop } = await supabase.from('properties').select('id').limit(1).single();
      const propertyId = selectedReg.property_id || prop?.id;

      // 2. Update registration status
      const { error: uError } = await supabase
        .from('tenant_registrations')
        .update({
          status: 'approved',
          verification_method: method,
          reviewer_id: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', regId);

      if (uError) throw uError;

      // 3. Create active tenant record
      const { error: tError } = await supabase
        .from('tenants')
        .upsert(
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

      if (tError) throw tError;

      // 4. Audit Log
      await supabase.from('audit_events').insert({
        actor_id: user?.id,
        action: `APPROVE_TENANT_${method.toUpperCase()}`,
        table_name: 'tenant_registrations',
        record_id: regId,
        new_data: { status: 'approved', verification_method: method },
      });
    },
    onSuccess: () => {
      setActionLoading(false);
      setSelectedReg(null);
      queryClient.invalidateQueries({ queryKey: ['warden-registrations-queue'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dashboard-stats'] });
      Alert.alert('Approved!', 'Tenant registration has been verified and activated.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Failed to approve tenant');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectReason.trim()) throw new Error('Please provide a reason for rejection');
      setActionLoading(true);

      const { error } = await supabase
        .from('tenant_registrations')
        .update({
          status: 'rejected',
          decision_reason: rejectReason.trim(),
          reviewer_id: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedReg.id);

      if (error) throw error;

      await supabase.from('audit_events').insert({
        actor_id: user?.id,
        action: 'REJECT_TENANT',
        table_name: 'tenant_registrations',
        record_id: selectedReg.id,
        new_data: { status: 'rejected', reason: rejectReason.trim() },
      });
    },
    onSuccess: () => {
      setActionLoading(false);
      setRejectModalVisible(false);
      setSelectedReg(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['warden-registrations-queue'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dashboard-stats'] });
      Alert.alert('Registration Rejected', 'Reason logged and tenant notified.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Failed to reject');
    },
  });

  if (isLoading) return <LoadingView message="Loading registration queue..." />;

  const filtered = registrations.filter((r: any) => {
    if (filter === 'student') return r.category === 'student';
    if (filter === 'employee') return r.category === 'employee';
    return true;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Approval Queue"
        subtitle={`${registrations.length} pending KYC verifications`}
      />

      {/* Filter Tabs */}
      <View style={[styles.filterBar, { borderBottomColor: theme.border }]}>
        {(['all', 'student', 'employee'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilter(tab)}
            style={[
              styles.filterBtn,
              filter === tab && { borderBottomColor: Colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                {
                  color: filter === tab ? Colors.primary : theme.textSecondary,
                  fontFamily: filter === tab ? Typography.fontFamily.bold : Typography.fontFamily.medium,
                },
              ]}
            >
              {tab === 'all' ? `All (${registrations.length})` : tab === 'student' ? '🎓 Students' : '💼 Employees'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Queue Clear!"
            description="All tenant registrations have been reviewed and processed."
          />
        ) : (
          filtered.map((reg: any) => (
            <Card key={reg.id} style={styles.card}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => openDetailModal(reg)}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]}>{reg.full_name}</Text>
                    <Text style={[styles.sub, { color: theme.textSecondary }]}>
                      {reg.category === 'student'
                        ? `${reg.college_name || 'Student'} · Roll: ${reg.roll_number || 'N/A'}`
                        : `${reg.company_name || 'Employee'} · ID: ${reg.employee_id || 'N/A'}`}
                    </Text>
                    <Text style={[styles.date, { color: theme.textMuted }]}>
                      Submitted {formatDate(reg.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Badge
                      label={reg.category}
                      color={
                        reg.category === 'student'
                          ? { bg: '#E8EDD4', text: '#3F4C1C' }
                          : { bg: '#FBEEDA', text: '#8A5A12' }
                      }
                      size="sm"
                    />
                    <Badge label="Pending" status="pending" size="sm" />
                  </View>
                </View>
                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                  <Text style={[styles.viewDocs, { color: theme.primary }]}>
                    View KYC Documents & Review →
                  </Text>
                </View>
              </TouchableOpacity>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Detail / Review Modal */}
      <Modal visible={!!selectedReg && !rejectModalVisible} animationType="slide">
        {selectedReg && (
          <SafeAreaView style={[styles.modalSafe, { backgroundColor: theme.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => setSelectedReg(null)}>
                <Text style={{ fontSize: 16, color: theme.textSecondary }}>✕ Close</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>KYC Verification</Text>
              <View style={{ width: 50 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Card style={styles.detailCard}>
                <View style={styles.detailHeader}>
                  <Text style={[styles.detailName, { color: theme.text }]}>{selectedReg.full_name}</Text>
                  <Badge
                    label={selectedReg.category}
                    color={
                      selectedReg.category === 'student'
                        ? { bg: '#E8EDD4', text: '#3F4C1C' }
                        : { bg: '#FBEEDA', text: '#8A5A12' }
                    }
                  />
                </View>

                {selectedReg.category === 'student' ? (
                  <>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>College / School</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.college_name}</Text></View>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Roll Number</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.roll_number}</Text></View>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Course</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.course}</Text></View>
                  </>
                ) : (
                  <>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Company</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.company_name}</Text></View>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Employee ID</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.employee_id}</Text></View>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Work Email</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.work_email}</Text></View>
                    <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>PAN (Encrypted)</Text><Text style={[styles.dVal, { color: theme.primary }]}>•••••••••• (Owner Viewable)</Text></View>
                  </>
                )}

                <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Phone</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.phone}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Permanent Address</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.permanent_address}</Text></View>
                <View style={styles.detailRow}><Text style={[styles.dLabel, { color: theme.textSecondary }]}>Family Contact</Text><Text style={[styles.dVal, { color: theme.text }]}>{selectedReg.family_contact_name} ({selectedReg.family_relation}) · {selectedReg.family_contact_phone}</Text></View>
              </Card>

              {/* Document Previews */}
              <Text style={[styles.docHeading, { color: theme.text }]}>KYC DOCUMENTS (SECURE SIGNED URL)</Text>

              {docUrls.photo && (
                <View style={styles.docBox}>
                  <Text style={[styles.docTitle, { color: theme.textSecondary }]}>Passport Photo</Text>
                  <Image source={{ uri: docUrls.photo }} style={styles.photoImg} />
                </View>
              )}

              {docUrls.addressProof && (
                <View style={styles.docBox}>
                  <Text style={[styles.docTitle, { color: theme.textSecondary }]}>Address Proof ({selectedReg.address_proof_type || 'Document'})</Text>
                  <Image source={{ uri: docUrls.addressProof }} style={styles.proofImg} />
                </View>
              )}

              {docUrls.aadhaarFront && (
                <View style={styles.docBox}>
                  <Text style={[styles.docTitle, { color: theme.textSecondary }]}>Aadhaar Card (Front)</Text>
                  <Image source={{ uri: docUrls.aadhaarFront }} style={styles.proofImg} />
                </View>
              )}

              {docUrls.aadhaarBack && (
                <View style={styles.docBox}>
                  <Text style={[styles.docTitle, { color: theme.textSecondary }]}>Aadhaar Card (Back)</Text>
                  <Image source={{ uri: docUrls.aadhaarBack }} style={styles.proofImg} />
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.approvalActions}>
                <Button
                  title="✅ Approve - Digital KYC Review"
                  variant="primary"
                  onPress={() => approveMutation.mutate({ regId: selectedReg.id, method: 'digital' })}
                  isLoading={actionLoading}
                  style={{ marginBottom: Spacing.sm }}
                />
                <Button
                  title="👁️ Approve - Manual Verification"
                  variant="secondary"
                  onPress={() => approveMutation.mutate({ regId: selectedReg.id, method: 'manual' })}
                  isLoading={actionLoading}
                  style={{ marginBottom: Spacing.sm }}
                />
                <Button
                  title="❌ Reject with Reason"
                  variant="danger"
                  onPress={() => setRejectModalVisible(true)}
                  disabled={actionLoading}
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={[styles.rejectOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.rejectContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.rejectTitle, { color: theme.error }]}>Reject Registration</Text>
            <Text style={[styles.rejectSub, { color: theme.textSecondary }]}>
              Please provide a clear reason. The tenant will receive this message and can resubmit documents.
            </Text>
            <Input
              placeholder="e.g. Unclear Aadhaar photo, roll number mismatch..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80 }}
            />
            <View style={styles.rejectBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setRejectModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Confirm Rejection"
                variant="danger"
                onPress={() => rejectMutation.mutate()}
                isLoading={actionLoading}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  filterBar: { flexDirection: 'row', borderBottomWidth: 1 },
  filterBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  filterText: { fontSize: Typography.size.sm },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { marginBottom: Spacing.md, padding: Spacing.base },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  date: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 4 },
  cardFooter: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.xs },
  viewDocs: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, textAlign: 'right' },
  modalSafe: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1 },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  modalScroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  detailCard: { padding: Spacing.base, marginBottom: Spacing.base },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  detailName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  dLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  dVal: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  docHeading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  docBox: { marginBottom: Spacing.base },
  docTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginBottom: 4 },
  photoImg: { width: 120, height: 120, borderRadius: BorderRadius.lg, backgroundColor: '#E2E8F0' },
  proofImg: { width: '100%', height: 180, borderRadius: BorderRadius.lg, resizeMode: 'contain', backgroundColor: '#E2E8F0' },
  approvalActions: { marginTop: Spacing.lg },
  rejectOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  rejectContent: { width: '100%', padding: Spacing.xl, borderRadius: BorderRadius.xl },
  rejectTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, marginBottom: 4 },
  rejectSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base, lineHeight: 18 },
  rejectBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
