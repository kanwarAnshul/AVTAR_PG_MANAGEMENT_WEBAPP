import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { todayLocalISO, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';
import { sendNotification } from '../../src/services/messaging';

export default function TenantPresenceScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [emergencyVisible, setEmergencyVisible] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('Locked door at night');
  const [saving, setSaving] = useState(false);

  const today = todayLocalISO();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tenant-presence', today, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, property_id, current_tenancy:tenancies!inner(room_id, bed_id, status)')
        .eq('user_id', user.id)
        .eq('tenancies.status', 'active')
        .maybeSingle();

      const tenancy = (tenant as any)?.current_tenancy?.[0];
      const tenantId = (tenant as any)?.id;
      const roomId = tenancy?.room_id;
      const propertyId = (tenant as any)?.property_id;

      const { data: mine } = await supabase
        .from('daily_presence')
        .select('*')
        .eq('tenant_id', tenantId ?? '')
        .eq('presence_date', today)
        .maybeSingle();

      // Roommates (same room, active tenancies)
      let roommates: any[] = [];
      if (roomId) {
        const { data: roomTenancies } = await supabase
          .from('tenancies')
          .select('tenant_id')
          .eq('room_id', roomId)
          .eq('status', 'active');
        const ids = (roomTenancies || []).map((t: any) => t.tenant_id).filter((id: string) => id !== tenantId);
        if (ids.length) {
          const { data: mates } = await supabase
            .from('tenants')
            .select('id, full_name')
            .in('id', ids);
          const { data: presence } = await supabase
            .from('daily_presence')
            .select('*')
            .eq('presence_date', today);
          const byTenant = new Map(((presence as any[]) || []).map((p: any) => [p.tenant_id, p]));
          roommates = (mates || []).map((m: any) => ({ ...m, presence: byTenant.get(m.id) ?? null }));
        }
      }

      return { tenantId, propertyId, roomId, mine: mine ?? null, roommates };
    },
    enabled: !!user,
  });

  const markPresence = async (status: 'present' | 'absent') => {
    if (!data?.tenantId || !data?.propertyId || !data?.roomId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('daily_presence').upsert(
        {
          tenant_id: data.tenantId,
          property_id: data.propertyId,
          room_id: data.roomId,
          presence_date: today,
          status,
          marked_at: new Date().toISOString(),
        } as any,
        { onConflict: 'tenant_id, presence_date' }
      );
      if (error) throw new Error(friendlyDbError(error));
      Alert.alert(status === 'present' ? 'Marked Present ✅' : 'Marked Absent 🔴', `Today (${today}) is ${status}.`);
      queryClient.invalidateQueries({ queryKey: ['tenant-presence'] });
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Could not save presence');
    } finally {
      setSaving(false);
    }
  };

  const sendEmergencyMutation = useMutation({
    mutationFn: async () => {
      if (!data?.tenantId || !data?.propertyId || !data?.roomId) throw new Error('No room assigned yet');
      setSaving(true);
      const { data: alert, error } = await supabase
        .from('emergency_alerts')
        .insert({
          tenant_id: data.tenantId,
          property_id: data.propertyId,
          room_id: data.roomId,
          reason: emergencyReason,
          is_active: true,
        } as any)
        .select()
        .single();
      if (error) throw new Error(friendlyDbError(error));

      // Also file an urgent complaint so the warden sees it in the complaint queue.
      try {
        await supabase.from('complaints').insert({
          tenant_id: data.tenantId,
          property_id: data.propertyId,
          room_id: data.roomId,
          category: 'security',
          title: `🚨 EMERGENCY: ${emergencyReason}`,
          description: 'Raised from the presence board emergency button.',
          priority: 'urgent',
          status: 'open',
        });
      } catch { /* non-fatal */ }

      // Notify roommates + warden via notifications table.
      const { data: roomTenancies } = await supabase
        .from('tenancies')
        .select('tenant:tenants(user_id)')
        .eq('room_id', data.roomId)
        .eq('status', 'active');
      const mateUserIds = ((roomTenancies || []) as any[])
        .map((t) => t.tenant?.user_id)
        .filter((id) => id && id !== user?.id);
      for (const uid of mateUserIds) {
        await sendNotification({
          userId: uid,
          type: 'emergency',
          title: '🚨 Room emergency!',
          body: `A roommate raised an emergency: ${emergencyReason}. Please check immediately.`,
          data: { alert_id: (alert as any)?.id },
        });
      }
      return (alert as any)?.id;
    },
    onSuccess: () => {
      setSaving(false);
      setEmergencyVisible(false);
      Alert.alert('Emergency Sent 🚨', 'Roommates and the warden have been notified.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Send Failed', err?.message ?? 'Could not send emergency alert');
    },
  });

  if (isLoading) return <LoadingView message="Loading presence..." />;

  const myStatus = (data?.mine as any)?.status ?? null;
  const roommates = data?.roommates || [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Presence & Safety" subtitle={`Today ${today}`} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {/* My status */}
        <Card style={[styles.card, { borderColor: myStatus === 'present' ? Colors.success : myStatus === 'absent' ? Colors.error : theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>MY TODAY STATUS</Text>
          <Text style={[styles.bigStatus, { color: myStatus === 'present' ? Colors.success : myStatus === 'absent' ? Colors.error : theme.textSecondary }]}>
            {myStatus === 'present' ? '🟢 Present in PG' : myStatus === 'absent' ? '🔴 Not Present' : '⚪ Not Marked'}
          </Text>
          <View style={styles.btnRow}>
            <Button
              title="🟢 I'm Present"
              variant={myStatus === 'present' ? 'success' : 'secondary'}
              onPress={() => markPresence('present')}
              isLoading={saving}
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="🔴 Not Present"
              variant={myStatus === 'absent' ? 'danger' : 'secondary'}
              onPress={() => markPresence('absent')}
              isLoading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* Roommates */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>ROOMMATES TODAY</Text>
          {roommates.length === 0 ? (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>No roommates share your room right now.</Text>
          ) : (
            roommates.map((m: any) => (
              <View key={m.id} style={[styles.roommateRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.roommateName, { color: theme.text }]}>{m.full_name}</Text>
                <Badge label={m.presence?.status ?? 'not marked'} status={m.presence?.status ?? 'draft'} size="sm" />
              </View>
            ))
          )}
        </Card>

        {/* Emergency */}
        <Card style={[styles.card, { borderColor: Colors.error + '60' }]}>
          <Text style={[styles.sectionTitle, { color: Colors.error }]}>🚨 EMERGENCY</Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Locked out late at night or unusual activity in the PG? Alert your whole room + warden instantly.
          </Text>
          <Button title="🚨 Send Emergency to Room" variant="danger" onPress={() => setEmergencyVisible(true)} style={{ marginTop: Spacing.sm }} />
        </Card>
      </ScrollView>

      <Modal visible={emergencyVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Send Emergency Alert</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              This notifies every roommate in your room and creates an urgent warden complaint.
            </Text>
            {[
              'Locked door at night',
              'Unusual activity in PG',
              'Medical emergency',
              'Safety concern',
              'Other emergency',
            ].map((reason) => (
              <Button
                key={reason}
                title={emergencyReason === reason ? `✓ ${reason}` : reason}
                variant={emergencyReason === reason ? 'danger' : 'secondary'}
                onPress={() => setEmergencyReason(reason)}
                style={{ marginBottom: Spacing.xs }}
              />
            ))}
            <View style={styles.modalBtns}>
              <Button title="Cancel" variant="secondary" onPress={() => setEmergencyVisible(false)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button
                title="🚨 Send Now"
                variant="danger"
                onPress={() => sendEmergencyMutation.mutate()}
                isLoading={saving}
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
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { padding: Spacing.base, marginBottom: Spacing.base, borderWidth: 1 },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  bigStatus: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, marginBottom: Spacing.md },
  btnRow: { flexDirection: 'row' },
  roommateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderTopWidth: 1 },
  roommateName: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base },
  hint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 20 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginBottom: Spacing.base, lineHeight: 20 },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
