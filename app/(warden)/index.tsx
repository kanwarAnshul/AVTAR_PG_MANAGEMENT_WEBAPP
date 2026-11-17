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
          <Text style={[styles.roleTag, { color: theme.primary }]}>🛡️ WARDEN PORTAL</Text>
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
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: isDark ? '#2A2415' : '#FBF0D6', borderColor: isDark ? '#4A4220' : '#EBD9A8' }]}
            onPress={() => router.push('/(warden)/approvals')}
          >
            <Text style={[styles.kpiValue, { color: isDark ? '#E8A33D' : '#8A6111' }]}>{pendingCount}</Text>
            <Text style={[styles.kpiLabel, { color: isDark ? '#E8A33D' : '#8A6111' }]}>Pending KYC</Text>
            <Text style={[styles.kpiHint, { color: isDark ? '#C9964A' : '#9A6B1F' }]}>Tap to review →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: isDark ? '#1E2417' : '#E8EDD4', borderColor: isDark ? '#3A4430' : '#C7D69B' }]}
            onPress={() => router.push('/(warden)/beds')}
          >
            <Text style={[styles.kpiValue, { color: isDark ? '#A8BC6B' : '#3F4C1C' }]}>
              {occupiedBeds}/{totalBeds}
            </Text>
            <Text style={[styles.kpiLabel, { color: isDark ? '#A8BC6B' : '#3F4C1C' }]}>Occupancy ({occRate}%)</Text>
            <Text style={[styles.kpiHint, { color: isDark ? '#8FA34E' : '#5E7030' }]}>Manage beds →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: isDark ? '#2A1B19' : '#FBE3E1', borderColor: isDark ? '#4A2C28' : '#F3C9C4' }]}
            onPress={() => router.push('/(warden)/dues')}
          >
            <Text style={[styles.kpiValue, { color: isDark ? '#E07066' : '#9B2C22' }]}>
              {formatCurrency(totalDuesPaise, true)}
            </Text>
            <Text style={[styles.kpiLabel, { color: isDark ? '#E07066' : '#9B2C22' }]}>Rent Dues</Text>
            <Text style={[styles.kpiHint, { color: isDark ? '#C4675E' : '#B03A30' }]}>Collect dues →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: isDark ? '#1E2A1C' : '#E4F0DC', borderColor: isDark ? '#33472F' : '#C6DFB8' }]}
            onPress={() => router.push('/(warden)/complaints')}
          >
            <Text style={[styles.kpiValue, { color: isDark ? '#7FB85C' : '#3D6B2A' }]}>{openComplaints}</Text>
            <Text style={[styles.kpiLabel, { color: isDark ? '#7FB85C' : '#3D6B2A' }]}>Active Tickets</Text>
            <Text style={[styles.kpiHint, { color: isDark ? '#6FA652' : '#4A7D33' }]}>Resolve issues →</Text>
          </TouchableOpacity>
        </View>

        {/* Occupancy Progress Bar */}
        <Card style={styles.occCard}>
          <View style={styles.occHeader}>
            <Text style={[styles.occTitle, { color: theme.text }]}>Real-time Bed Capacity</Text>
            <Text style={[styles.occPct, { color: theme.primary }]}>{occRate}% Filled</Text>
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
            <View style={[styles.actionIconBox, { backgroundColor: isDark ? '#2A3122' : '#EFF1E6' }]}>
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
            <View style={[styles.actionIconBox, { backgroundColor: isDark ? '#2A3122' : '#EFF1E6' }]}>
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
            <View style={[styles.actionIconBox, { backgroundColor: isDark ? '#2A3122' : '#EFF1E6' }]}>
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
            <View style={[styles.actionIconBox, { backgroundColor: isDark ? '#2A3122' : '#EFF1E6' }]}>
              <Text style={{ fontSize: 20 }}>🚪</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.actionTitle, { color: theme.error }]}>Sign Out</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>Exit warden session</Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.error }}>›</Text>
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
  actionIconBox: { width: 36, height: 36, borderRadius: BorderRadius.md, backgroundColor: '#EFF1E6', justifyContent: 'center', alignItems: 'center' },
  actionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  actionSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 1 },
});
