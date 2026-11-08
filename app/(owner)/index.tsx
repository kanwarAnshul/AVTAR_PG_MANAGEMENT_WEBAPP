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

export default function OwnerHomeScreen() {
  const { isDark, toggleTheme } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { profile, user } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  const { data: stats, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['owner-overall-stats', user?.id],
    queryFn: async () => {
      // Live queries only — zeros until real records exist (no dummy totals).
      const { data: payments } = await supabase.from('payments').select('amount');
      const totalCollections = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

      // 2. Total expenses
      const { data: expenses } = await supabase.from('expenses').select('amount');
      const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);

      // 3. Beds capacity
      const { data: beds } = await supabase.from('beds').select('status');
      const totalBeds = beds?.length || 0;
      const occupiedBeds = beds?.filter((b) => b.status === 'occupied').length || 0;

      // 4. Pending approvals
      const { count: pendingCount } = await supabase
        .from('tenant_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 5. Total active tenants
      const { count: tenantCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true });

      // 6. Security deposits held
      const { data: deposits } = await supabase.from('deposit_transactions').select('amount');
      const totalDeposits = (deposits || []).reduce((sum, d) => sum + (d.amount || 0), 0);

      return {
        totalCollections,
        totalExpenses,
        netCashFlow: totalCollections - totalExpenses,
        totalBeds,
        occupiedBeds,
        pendingApprovals: pendingCount || 0,
        totalTenants: tenantCount || 0,
        totalDeposits,
      };
    },
  });

  if (isLoading) return <LoadingView message="Loading master dashboard..." />;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.errorWrap}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.errorTitle, { color: theme.text }]}>Could not load live data</Text>
          <Text style={[styles.errorSub, { color: theme.textSecondary }]}>
            {(error as any)?.message ?? 'Check your connection and Supabase migration (003_updates.sql), then retry.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Live data only — zeros until real records exist (no dummy totals).
  const {
    totalCollections = 0,
    totalExpenses = 0,
    netCashFlow = 0,
    totalBeds = 0,
    occupiedBeds = 0,
    pendingApprovals = 0,
    totalTenants = 0,
    totalDeposits = 0,
  } = stats || {};

  const hasLiveData = totalCollections > 0 || totalTenants > 0 || totalBeds > 0 || pendingApprovals > 0;

  const occRate = occupancyPercent(occupiedBeds, totalBeds);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.roleLabel, { color: Colors.accent }]}>👑 SUPER ADMIN (OWNER)</Text>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {profile?.full_name || 'Avtar Singh'}
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
        {!hasLiveData && (
          <View style={[styles.emptyHint, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={{ fontSize: 28 }}>📭</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No live data yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Add rooms, tenants and payments — this dashboard will update automatically from your database.
            </Text>
          </View>
        )}

        {/* Master Financial Card — adaptive to light/dark */}
        <Card variant="elevated" style={[styles.financeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.finLabel, { color: isDark ? '#FFFFFF90' : theme.textSecondary }]}>MONTHLY CASH FLOW OVERVIEW</Text>
          <Text style={[styles.finBigNumber, { color: theme.text }]}>{formatCurrency(netCashFlow)}</Text>
          <Text style={[styles.finSub, { color: theme.textSecondary }]}>Net surplus after operational expenses</Text>

          <View style={[styles.finGrid, { borderTopColor: isDark ? '#FFFFFF20' : theme.border }]}>
            <View style={styles.finItem}>
              <Text style={[styles.finSubLabel, { color: theme.textSecondary }]}>Total Inflow</Text>
              <Text style={[styles.finVal, { color: Colors.success }]}>
                +{formatCurrency(totalCollections, true)}
              </Text>
            </View>
            <View style={styles.finItem}>
              <Text style={[styles.finSubLabel, { color: theme.textSecondary }]}>Expenses</Text>
              <Text style={[styles.finVal, { color: Colors.error }]}>
                -{formatCurrency(totalExpenses, true)}
              </Text>
            </View>
            <View style={styles.finItem}>
              <Text style={[styles.finSubLabel, { color: theme.textSecondary }]}>Deposits Held</Text>
              <Text style={[styles.finVal, { color: Colors.accent }]}>
                {formatCurrency(totalDeposits, true)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Operational Metrics */}
        <View style={styles.kpiRow}>
          <TouchableOpacity
            style={[styles.kpiBox, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/(owner)/approvals')}
          >
            <Text style={{ fontSize: 24 }}>⏳</Text>
            <Text style={[styles.kpiNum, { color: Colors.accent }]}>{pendingApprovals}</Text>
            <Text style={[styles.kpiText, { color: theme.textSecondary }]}>Pending KYC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiBox, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/(owner)/reports')}
          >
            <Text style={{ fontSize: 24 }}>🛏️</Text>
            <Text style={[styles.kpiNum, { color: Colors.primary }]}>{occupiedBeds}/{totalBeds}</Text>
            <Text style={[styles.kpiText, { color: theme.textSecondary }]}>Occupancy ({occRate}%)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiBox, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/(owner)/wardens')}
          >
            <Text style={{ fontSize: 24 }}>🛡️</Text>
            <Text style={[styles.kpiNum, { color: Colors.success }]}>{totalTenants}</Text>
            <Text style={[styles.kpiText, { color: theme.textSecondary }]}>Active Tenants</Text>
          </TouchableOpacity>
        </View>

        {/* Visual Occupancy Breakdown */}
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: theme.text }]}>Property Occupancy Capacity</Text>
            <Text style={[styles.chartRate, { color: Colors.primary }]}>{occRate}%</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.barFill, { width: `${occRate}%`, backgroundColor: Colors.primary }]} />
          </View>
          <View style={styles.chartLegend}>
            <Text style={[styles.legendItemText, { color: theme.textSecondary }]}>
              🟢 {occupiedBeds} Beds Occupied
            </Text>
            <Text style={[styles.legendItemText, { color: theme.textSecondary }]}>
              ⚪ {totalBeds - occupiedBeds} Beds Available
            </Text>
          </View>
        </Card>

        {/* Action Shortcuts */}
        <Card style={styles.actionCard}>
          <Text style={[styles.actionHeading, { color: theme.text }]}>SUPER ADMIN SHORTCUTS</Text>

          <TouchableOpacity
            style={[styles.shortcutRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/(owner)/reports')}
          >
            <Text style={{ fontSize: 20 }}>⚡</Text>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.shortcutTitle, { color: theme.text }]}>Generate Monthly Invoices</Text>
              <Text style={[styles.shortcutSub, { color: theme.textSecondary }]}>
                Idempotent bulk billing for all active tenancies
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: Colors.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shortcutRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/(owner)/reports')}
          >
            <Text style={{ fontSize: 20 }}>📥</Text>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.shortcutTitle, { color: theme.text }]}>Financial Export (CSV)</Text>
              <Text style={[styles.shortcutSub, { color: theme.textSecondary }]}>
                Sanitized spreadsheet export for accounts & tax
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: Colors.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shortcutRow, { borderBottomWidth: 0 }]}
            onPress={() => router.push('/(owner)/wardens')}
          >
            <Text style={{ fontSize: 20 }}>🛡️</Text>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[styles.shortcutTitle, { color: theme.text }]}>Manage Property Wardens</Text>
              <Text style={[styles.shortcutSub, { color: theme.textSecondary }]}>
                Add managers, assign properties & roles
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: Colors.primary }}>›</Text>
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
  roleLabel: { fontFamily: Typography.fontFamily.bold, fontSize: 11, letterSpacing: 1 },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, maxWidth: width * 0.65 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconBtn: { padding: Spacing.xs },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  financeCard: { padding: Spacing.lg, borderRadius: BorderRadius['2xl'], marginBottom: Spacing.base, ...Shadows.lg },
  finLabel: { color: '#FFFFFF90', fontFamily: Typography.fontFamily.semiBold, fontSize: 11, letterSpacing: 1 },
  finBigNumber: { color: '#FFFFFF', fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size['3xl'], marginVertical: Spacing.xs },
  finSub: { color: '#FFFFFF70', fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  finGrid: { flexDirection: 'row', marginTop: Spacing.lg, borderTopWidth: 1, borderTopColor: '#FFFFFF20', paddingTop: Spacing.md },
  finItem: { flex: 1 },
  finSubLabel: { color: '#FFFFFF70', fontFamily: Typography.fontFamily.regular, fontSize: 10 },
  finVal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  kpiBox: { flex: 1, padding: Spacing.base, borderRadius: BorderRadius.xl, borderWidth: 1, alignItems: 'center' },
  kpiNum: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size.lg, marginTop: Spacing.xs },
  kpiText: { fontFamily: Typography.fontFamily.medium, fontSize: 10, marginTop: 2, textAlign: 'center' },
  chartCard: { padding: Spacing.base, marginBottom: Spacing.base },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  chartTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  chartRate: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  barTrack: { height: 12, borderRadius: BorderRadius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: BorderRadius.full },
  chartLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  legendItemText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  actionCard: { padding: Spacing.base },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, marginTop: Spacing.md, textAlign: 'center' },
  errorSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: Spacing.base, backgroundColor: '#6366F1', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl, borderRadius: 10 },
  retryText: { color: '#FFF', fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  emptyHint: { padding: Spacing.base, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: Spacing.base },
  emptyTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, marginTop: Spacing.sm },
  emptySub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  actionHeading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  shortcutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1 },
  shortcutTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  shortcutSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});
