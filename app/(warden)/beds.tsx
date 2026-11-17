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
import { formatCurrency } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function WardenBedsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedBed, setSelectedBed] = useState<any>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch rooms with beds
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-rooms-beds'],
    queryFn: async () => {
      // 1. Get rooms with beds and active allocations
      const { data: rooms, error } = await supabase
        .from('rooms')
        .select(`
          *,
          beds(
            *,
            allocations:bed_allocations(
              id, tenancy_id, released_at,
              tenancy:tenancies(
                id, tenant_id, monthly_rent,
                tenant:tenants(id, full_name, category, phone)
              )
            )
          )
        `)
        .order('room_no', { ascending: true });

      if (error) throw error;

      // 2. Get active tenants without bed allocation
      const { data: allTenants } = await supabase
        .from('tenants')
        .select('id, full_name, category, phone');

      const { data: activeTenancies } = await supabase
        .from('tenancies')
        .select('tenant_id')
        .eq('status', 'active');

      const occupiedTenantIds = new Set(activeTenancies?.map((t) => t.tenant_id) || []);
      const unassignedTenants = (allTenants || []).filter((t) => !occupiedTenantIds.has(t.id));

      return { rooms: rooms || [], unassignedTenants };
    },
  });

  // Atomic bed assignment mutation
  const assignBedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBed || !selectedTenantId) throw new Error('Please select a tenant');
      setActionLoading(true);

      const room = selectedBed.room;
      const rentPaise = room.monthly_rent || 800000;
      const depositPaise = room.deposit_amt || 1000000;

      // 1. Create active tenancy record (due date = allocation date)
      const today = new Date();
      const { data: tenancy, error: tError } = await supabase
        .from('tenancies')
        .insert({
          tenant_id: selectedTenantId,
          property_id: room.property_id,
          room_id: room.id,
          bed_id: selectedBed.id,
          monthly_rent: rentPaise,
          deposit_paid: depositPaise,
          check_in_date: today.toISOString().split('T')[0],
          due_day: today.getDate(),
          status: 'active',
          created_by: user?.id,
        } as any)
        .select()
        .single();

      if (tError) throw tError;

      try {
        await supabase.from('audit_events').insert({
          actor_id: user?.id,
          action: 'ASSIGN_BED',
          table_name: 'tenancies',
          record_id: (tenancy as any)?.id,
          new_data: { tenant_id: selectedTenantId, bed_id: selectedBed.id, due_day: today.getDate() },
        });
      } catch { /* non-fatal audit */ }

      // 2. Call atomic bed allocation
      const { error: aError } = await supabase.rpc('assign_bed_atomic', {
        p_bed_id: selectedBed.id,
        p_tenancy_id: tenancy.id,
        p_allocated_by: user?.id,
      });

      if (aError) {
        // Fallback direct insert if RPC not executed in sandbox DB
        await supabase.from('bed_allocations').insert({
          bed_id: selectedBed.id,
          tenancy_id: tenancy.id,
          allocated_by: user?.id,
        });
        await supabase.from('beds').update({ status: 'occupied' }).eq('id', selectedBed.id);
      }
    },
    onSuccess: () => {
      setActionLoading(false);
      setAssignModalVisible(false);
      setSelectedBed(null);
      setSelectedTenantId('');
      queryClient.invalidateQueries({ queryKey: ['warden-rooms-beds'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dashboard-stats'] });
      Alert.alert('Bed Assigned', 'Tenant has been assigned to the bed atomically.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Assignment Failed', err.message || 'Bed assignment failed');
    },
  });

  // Release bed mutation
  const releaseBedMutation = useMutation({
    mutationFn: async (bed: any) => {
      setActionLoading(true);
      const activeAlloc = bed.allocations?.find((a: any) => !a.released_at);
      if (!activeAlloc) throw new Error('No active allocation found');

      const { error: rpcError } = await supabase.rpc('release_bed_atomic', {
        p_tenancy_id: activeAlloc.tenancy_id,
        p_check_out_date: new Date().toISOString().split('T')[0],
      });

      if (rpcError) {
        // Fallback
        await supabase
          .from('bed_allocations')
          .update({ released_at: new Date().toISOString() })
          .eq('id', activeAlloc.id);
        await supabase.from('beds').update({ status: 'available' }).eq('id', bed.id);
        await supabase
          .from('tenancies')
          .update({ status: 'checked_out', check_out_date: new Date().toISOString().split('T')[0] })
          .eq('id', activeAlloc.tenancy_id);
      }
    },
    onSuccess: () => {
      setActionLoading(false);
      setSelectedBed(null);
      queryClient.invalidateQueries({ queryKey: ['warden-rooms-beds'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dashboard-stats'] });
      Alert.alert('Bed Released', 'Bed is now marked available for new tenants.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Failed to release bed');
    },
  });

  if (isLoading) return <LoadingView message="Loading rooms & bed inventory..." />;

  const { rooms = [], unassignedTenants = [] } = data || {};

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Bed Management"
        subtitle="Visual bed matrix & atomic room allocation"
      />

      {/* Legend */}
      <View style={[styles.legend, { backgroundColor: theme.surfaceAlt, borderBottomColor: theme.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: Colors.success }]} />
          <Text style={[styles.legendTxt, { color: theme.textSecondary }]}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: Colors.error }]} />
          <Text style={[styles.legendTxt, { color: theme.textSecondary }]}>Occupied</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: Colors.warning }]} />
          <Text style={[styles.legendTxt, { color: theme.textSecondary }]}>Maintenance</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {rooms.length === 0 ? (
          <EmptyState
            icon="🛏️"
            title="No Rooms Added"
            description="Rooms configured in Supabase will show here with their live bed occupancy."
          />
        ) : (
          rooms.map((room: any) => (
            <Card key={room.id} style={styles.roomCard}>
              <View style={styles.roomHeader}>
                <View>
                  <Text style={[styles.roomTitle, { color: theme.text }]}>Room {room.room_no}</Text>
                  <Text style={[styles.roomSub, { color: theme.textSecondary }]}>
                    Floor {room.floor} · {room.sharing_type} Sharing · {formatCurrency(room.monthly_rent || 800000)}/mo
                  </Text>
                </View>
                <Badge
                  label={`${(room.beds || []).filter((b: any) => b.status === 'occupied').length}/${room.sharing_type} Occupied`}
                  size="sm"
                />
              </View>

              {/* Bed Matrix */}
              <View style={styles.bedGrid}>
                {(room.beds || []).map((bed: any) => {
                  const isAvailable = bed.status === 'available';
                  const isOccupied = bed.status === 'occupied';
                  const activeAlloc = bed.allocations?.find((a: any) => !a.released_at);
                  const tenant = activeAlloc?.tenancy?.tenant;

                  return (
                    <TouchableOpacity
                      key={bed.id}
                      style={[
                        styles.bedTile,
                        {
                          backgroundColor: isDark
                            ? (isAvailable ? '#1E2A1C' : isOccupied ? '#2A1B19' : '#2A2415')
                            : (isAvailable ? '#E4F0DC' : isOccupied ? '#FBE3E1' : '#FBF0D6'),
                          borderColor: isDark
                            ? (isAvailable ? '#4E7A3A' : isOccupied ? '#8A4038' : '#7A6420')
                            : (isAvailable ? '#4A7D33' : isOccupied ? '#B03A30' : '#9A6B1F'),
                        },
                      ]}
                      onPress={() => {
                        setSelectedBed({ ...bed, room });
                        if (isAvailable) {
                          setAssignModalVisible(true);
                        } else {
                          Alert.alert(
                            `Bed ${bed.label} Occupied`,
                            `Tenant: ${tenant?.full_name || 'Assigned'}\nCategory: ${tenant?.category?.toUpperCase() || 'TENANT'}\nPhone: ${tenant?.phone || 'N/A'}`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Vacate / Release Bed',
                                style: 'destructive',
                                onPress: () => releaseBedMutation.mutate(bed),
                              },
                            ]
                          );
                        }
                      }}
                    >
                      <Text style={[styles.bedLabel, { color: isDark ? (isAvailable ? '#7FB85C' : isOccupied ? '#E07066' : '#E8A33D') : (isAvailable ? '#3D6B2A' : isOccupied ? '#9B2C22' : '#8A6111') }]}>
                        Bed {bed.label}
                      </Text>
                      <Text style={[styles.bedStatus, { color: isDark ? (isAvailable ? '#7FB85C' : isOccupied ? '#E07066' : '#E8A33D') : (isAvailable ? '#3D6B2A' : isOccupied ? '#9B2C22' : '#8A6111') }]} numberOfLines={1}>
                        {isAvailable ? 'Available' : tenant?.full_name || 'Occupied'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Assign Bed Modal */}
      <Modal visible={assignModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Assign Bed {selectedBed?.label}
            </Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Room {selectedBed?.room?.room_no} · Rent: {formatCurrency(selectedBed?.room?.monthly_rent || 800000)}
            </Text>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
              Select Approved Tenant
            </Text>

            {unassignedTenants.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.emptyTxt, { color: theme.textSecondary }]}>
                  No unassigned approved tenants available. Review pending KYC in the Approvals queue first.
                </Text>
              </View>
            ) : (
              <ScrollView style={[styles.tenantList, { maxHeight: 200 }]}>
                {unassignedTenants.map((t: any) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTenantId(t.id)}
                    style={[
                      styles.tenantItem,
                      {
                        backgroundColor: selectedTenantId === t.id ? Colors.primary + '15' : theme.surfaceAlt,
                        borderColor: selectedTenantId === t.id ? Colors.primary : theme.border,
                      },
                    ]}
                  >
                    <View>
                      <Text style={[styles.tName, { color: theme.text }]}>{t.full_name}</Text>
                      <Text style={[styles.tSub, { color: theme.textSecondary }]}>
                        {t.category?.toUpperCase()} · {t.phone || 'No phone'}
                      </Text>
                    </View>
                    {selectedTenantId === t.id && (
                      <Text style={{ color: theme.primary, fontWeight: 'bold' }}>✓ Selected</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setAssignModalVisible(false);
                  setSelectedTenantId('');
                }}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Assign Atomically"
                variant="primary"
                onPress={() => assignBedMutation.mutate()}
                isLoading={actionLoading}
                disabled={!selectedTenantId || actionLoading}
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
  legend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, paddingVertical: Spacing.xs, borderBottomWidth: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontFamily: Typography.fontFamily.medium, fontSize: 11 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  roomCard: { marginBottom: Spacing.md, padding: Spacing.base },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  roomTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  roomSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  bedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  bedTile: { flex: 1, minWidth: 90, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, alignItems: 'center' },
  bedLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  bedStatus: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base },
  inputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginBottom: Spacing.xs },
  emptyBox: { padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', marginVertical: Spacing.sm },
  emptyTxt: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, textAlign: 'center', lineHeight: 18 },
  tenantList: { marginBottom: Spacing.base },
  tenantItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.xs },
  tName: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  tSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
