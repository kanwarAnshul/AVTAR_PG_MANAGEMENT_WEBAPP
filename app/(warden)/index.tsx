import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { formatCurrency, occupancyPercent } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { NotificationBell, LoadingView } from '../../src/components/ui';

const { width } = Dimensions.get('window');

export default function WardenHomeScreen() {
  const { isDark, toggleTheme } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { profile, user, signOut } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-dashboard-stats', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // 1. Get assigned property for this warden
      const { data: membership } = await supabase
        .from('property_memberships')
        .select('property_id, property:properties(name, address)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      const propertyId = membership?.property_id;
      const propertyName = (membership?.property as any)?.name || 'AVTAR SINGH PG';

      // 2. Pending registrations count
      let pendingCount = 0;
      const { count: regCount } = await supabase
        .from('tenant_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingCount = regCount || 0;

      // 3. Beds count (total vs occupied)
      let totalBeds = 0;
      let occupiedBeds = 0;
      const { data: beds } = await supabase
        .from('beds')
        .select('id, status');
      if (beds) {
        totalBeds = beds.length;
        occupiedBeds = beds.filter((b) => b.status === 'occupied').length;
      }

      // 4. Overdue rent count & amount
      let totalDuesPaise = 0;
      const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('balance_due')
        .in('status', ['sent', 'partial', 'overdue']);
      if (overdueInvoices) {
        totalDuesPaise = overdueInvoices.reduce((sum, i) => sum + (i.balance_due || 0), 0);
      }

      // 5. Open complaints count
      let openComplaints = 0;
      const { count: cCount } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);
      openComplaints = cCount || 0;

      return {
        propertyName,
        pendingCount,
        totalBeds,
        occupiedBeds,
        totalDuesPaise,
        openComplaints,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <LoadingView message="Loading warden portal..." />;

  const {
    propertyName = 'AVTAR SINGH PG',
    pendingCount = 0,
    totalBeds = 0,
    occupiedBeds = 0,
    totalDuesPaise = 0,
    openComplaints = 0,
  } = stats || {};

  const occRate = occupancyPercent(occupiedBeds, totalBeds);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.roleTag, { color: Colors.primary }]}>🛡️ WARDEN PORTAL</Text>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {profile?.full_name || 'Property Warden'}
          </Text>
          <Text style={[styles.propertySub, { color: theme.textSecondary }]}>
            📍 {propertyName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleTheme} style={styles.iconBtn}>
            <Text style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <NotificationBell count={unreadCount} onPress={() => {}} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
            onPress={() => router.push('/(warden)/approvals')}
          >
            <Text style={[styles.kpiValue, { color: '#92400E' }]}>{pendingCount}</Text>
            <Text style={[styles.kpiLabel, { color: '#92400E' }]}>Pending KYC</Text>
            <Text style={[styles.kpiHint, { color: '#B45309' }]}>Tap to review →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: '#DBEAFE', borderColor: '#BFDBFE' }]}
            onPress={() => router.push('/(warden)/beds')}
          >
            <Text style={[styles.kpiValue, { color: '#1E40AF' }]}>
              {occupiedBeds}/{totalBeds}
            </Text>
            <Text style={[styles.kpiLabel, { color: '#1E40AF' }]}>Occupancy ({occRate}%)</Text>
            <Text style={[styles.kpiHint, { color: '#2563EB' }]}>Manage beds →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
            onPress={() => router.push('/(warden)/dues')}
          >
            <Text style={[styles.kpiValue, { color: '#991B1B' }]}>
              {formatCurrency(totalDuesPaise, true)}
            </Text>
            <Text style={[styles.kpiLabel, { color: '#991B1B' }]}>Rent Dues</Text>
            <Text style={[styles.kpiHint, { color: '#DC2626' }]}>Collect dues →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}
            onPress={() => router.push('/(warden)/complaints')}
          >
            <Text style={[styles.kpiValue, { color: '#166534' }]}>{openComplaints}</Text>
            <Text style={[styles.kpiLabel, { color: '#166534' }]}>Active Tickets</Text>
            <Text style={[styles.kpiHint, { color: '#16A34A' }]}>Resolve issues →</Text>
          </TouchableOpacity>
        </View>

        {/* Occupancy Progress Bar */}
        <Card style={styles.occCard}>
          <View style={styles.occHeader}>
            <Text style={[styles.occTitle, { color: theme.text }]}>Real-time Bed Capacity</Text>
            <Text style={[styles.occPct, { color: Colors.primary }]}>{occRate}% Filled</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.progressBar, { width: `${occRate}%`, backgroundColor: Colors.primary }]} />
          </View>
          <Text style={[styles.occFooter, { color: theme.textSecondary }]}>
            {totalBeds - occupiedBeds} beds currently available for booking
          </Text>
        </Card>

        {/* Action Panel */}
        <Card style={styles.actionCard}>
          <Text style={[styles.actionSectionTitle, { color: theme.text }]}>OPERATIONAL ACTIONS</Text>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/(warden)/approvals')}
          >
            <View style={styles.actionIconBox}>
              <Text style={{ fontSize: 20 }}>📋</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>Tenant Approval Queue</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                Verify Student / Employee KYC documents
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.textSecondary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/(warden)/beds')}
          >
            <View style={styles.actionIconBox}>
              <Text style={{ fontSize: 20 }}>🛏️</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>Room & Bed Grid</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                Atomic allocation, check-ins & releases
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.textSecondary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/(warden)/dues')}
          >
            <View style={styles.actionIconBox}>
              <Text style={{ fontSize: 20 }}>💵</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>Rent Collections</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                Confirm UPI/Cash receipts from tenants
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.textSecondary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomWidth: 0 }]}
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/welcome');
            }}
          >
            <View style={styles.actionIconBox}>
              <Text style={{ fontSize: 20 }}>🚪</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.actionTitle, { color: Colors.error }]}>Sign Out</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>Exit warden session</Text>
            </View>
            <Text style={{ fontSize: 18, color: Colors.error }}>›</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  roleTag: { fontFamily: Typography.fontFamily.semiBold, fontSize: 11, letterSpacing: 1 },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, maxWidth: width * 0.65 },
  propertySub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconBtn: { padding: Spacing.xs },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  kpiCard: {
    width: (width - Spacing.base * 2 - Spacing.sm) / 2,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
  },
  kpiValue: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size['2xl'] },
  kpiLabel: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, marginTop: 2 },
  kpiHint: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: Spacing.xs },
  occCard: { padding: Spacing.base, marginBottom: Spacing.base },
  occHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  occTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  occPct: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  progressTrack: { height: 10, borderRadius: BorderRadius.full, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: BorderRadius.full },
  occFooter: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: Spacing.sm },
  actionCard: { padding: Spacing.base },
  actionSectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1 },
  actionIconBox: { width: 36, height: 36, borderRadius: BorderRadius.md, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  actionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  actionSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 1 },
});
