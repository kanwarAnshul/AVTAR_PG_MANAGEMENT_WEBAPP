import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { formatCurrency, formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { NotificationBell, LoadingView } from '../../src/components/ui';

const { width } = Dimensions.get('window');

export default function TenantHomeScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { profile, user } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  const { data: tenantData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tenant-dashboard', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select(`
          *,
          property:properties(name, address),
          current_tenancy:tenancies!inner(
            id, monthly_rent, deposit_paid, check_in_date, status,
            room:rooms(room_no, floor, sharing_type),
            bed:beds(label)
          )
        `)
        .eq('user_id', user.id)
        .eq('tenancies.status', 'active')
        .maybeSingle();

      const { data: pendingInvoices } = await supabase
        .from('invoices')
        .select('id, billing_period, total_amount, paid_amount, balance_due, status, due_date')
        .eq('tenant_id', tenant?.id ?? '')
        .in('status', ['sent', 'partial', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(3);

      const { data: recentComplaints } = await supabase
        .from('complaints')
        .select('id, title, status, priority, created_at')
        .eq('tenant_id', tenant?.id ?? '')
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: notices } = await supabase
        .from('notices')
        .select('id, title, type, is_pinned, created_at')
        .eq('property_id', tenant?.property_id ?? '')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3);

      return { tenant, pendingInvoices, recentComplaints, notices };
    },
    enabled: !!user,
  });

  if (isLoading) return <LoadingView message="Loading dashboard..." />;

  const { tenant, pendingInvoices, recentComplaints, notices } = tenantData ?? {};
  const tenancy = (tenant?.current_tenancy as any)?.[0];
  const totalDue = pendingInvoices?.reduce((sum: number, inv: any) => sum + inv.balance_due, 0) ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>Good day,</Text>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {profile?.full_name ?? tenant?.full_name ?? 'Tenant'}
          </Text>
        </View>
        <NotificationBell count={unreadCount} onPress={() => {}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {/* Bed Card */}
        {tenancy ? (
          <View style={[styles.bedCard, { backgroundColor: isDark ? '#1E2417' : Colors.primary }]}>
            <View style={styles.bedCardTop}>
              <View>
                <Text style={styles.bedCardLabel}>YOUR BED</Text>
                <Text style={styles.bedCardBed}>
                  Room {tenancy.room?.room_no} · Bed {tenancy.bed?.label}
                </Text>
              </View>
              <Badge
                label={tenant?.category ?? 'tenant'}
                status={tenant?.category}
                color={tenant?.category === 'student'
                  ? { bg: '#E8EDD4', text: '#3F4C1C' }
                  : { bg: '#FBEEDA', text: '#8A5A12' }
                }
              />
            </View>
            <View style={styles.bedCardStats}>
              <View>
                <Text style={styles.bedStatLabel}>Monthly Rent</Text>
                <Text style={styles.bedStatValue}>{formatCurrency(tenancy.monthly_rent)}</Text>
              </View>
              <View>
                <Text style={styles.bedStatLabel}>Deposit Paid</Text>
                <Text style={styles.bedStatValue}>{formatCurrency(tenancy.deposit_paid)}</Text>
              </View>
              <View>
                <Text style={styles.bedStatLabel}>Check-in</Text>
                <Text style={styles.bedStatValue}>{formatDate(tenancy.check_in_date, 'dd MMM yy')}</Text>
              </View>
            </View>
            {tenant?.property && (
              <Text style={styles.propertyName}>📍 {tenant.property.name}</Text>
            )}
          </View>
        ) : (
          <Card style={[styles.pendingCard, { borderColor: Colors.warning + '50' }]}>
            <Text style={{ fontSize: 32 }}>⏳</Text>
            <Text style={[styles.pendingTitle, { color: theme.text }]}>Pending Bed Assignment</Text>
            <Text style={[styles.pendingSubtitle, { color: theme.textSecondary }]}>
              Warden will assign your bed shortly after account activation.
            </Text>
          </Card>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {[
            { icon: '💰', label: 'Pay Rent', onPress: () => router.push('/(tenant)/rent') },
            { icon: '🛠️', label: 'Complaint', onPress: () => router.push('/(tenant)/complaints') },
            { icon: '📋', label: 'Requests', onPress: () => router.push('/(tenant)/requests' as any) },
            { icon: '👥', label: 'Presence', onPress: () => router.push('/(tenant)/presence' as any) },
            { icon: '📢', label: 'Notices', onPress: () => router.push('/(tenant)/notices') },
            { icon: '👤', label: 'Profile', onPress: () => router.push('/(tenant)/profile') },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={action.onPress}
              style={[styles.quickBtn, { backgroundColor: theme.card, borderColor: theme.border }, Shadows.sm]}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 28 }}>{action.icon}</Text>
              <Text style={[styles.quickLabel, { color: theme.text }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pending Dues */}
        {pendingInvoices && pendingInvoices.length > 0 && (
          <Card variant="outlined" style={{ borderColor: Colors.error + '40' }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>💰 Pending Dues</Text>
              <Text style={[styles.totalDue, { color: theme.error }]}>{formatCurrency(totalDue)}</Text>
            </View>
            {pendingInvoices.map((inv: any) => (
              <TouchableOpacity
                key={inv.id}
                onPress={() => router.push('/(tenant)/rent')}
                style={[styles.dueItem, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <View>
                  <Text style={[styles.dueMonth, { color: theme.text }]}>{inv.billing_period}</Text>
                  <Text style={[styles.dueDue, { color: theme.textSecondary }]}>
                    Due: {formatDate(inv.due_date)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.dueAmount, { color: theme.error }]}>{formatCurrency(inv.balance_due)}</Text>
                  <Badge label={inv.status} size="sm" />
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => router.push('/(tenant)/rent')}>
              <Text style={[styles.viewAll, { color: theme.primary }]}>View all invoices →</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Recent Complaints */}
        {recentComplaints && recentComplaints.length > 0 && (
          <Card>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🛠️ My Complaints</Text>
            {recentComplaints.map((c: any) => (
              <View key={c.id} style={[styles.listRow, { borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={1}>{c.title}</Text>
                  <Text style={[styles.listSub, { color: theme.textSecondary }]}>{formatDate(c.created_at)}</Text>
                </View>
                <Badge label={c.status} size="sm" />
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push('/(tenant)/complaints')}>
              <Text style={[styles.viewAll, { color: theme.primary }]}>View all →</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Notices */}
        {notices && notices.length > 0 && (
          <Card>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>📢 Notices</Text>
            {notices.map((n: any) => (
              <View key={n.id} style={[styles.listRow, { borderColor: theme.border }]}>
                <Text style={{ fontSize: 18 }}>
                  {n.is_pinned ? '📌' : n.type === 'emergency' ? '🚨' : '📢'}
                </Text>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={2}>{n.title}</Text>
                  <Text style={[styles.listSub, { color: theme.textSecondary }]}>{formatDate(n.created_at)}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push('/(tenant)/notices')}>
              <Text style={[styles.viewAll, { color: theme.primary }]}>View all →</Text>
            </TouchableOpacity>
          </Card>
        )}
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
  greeting: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, maxWidth: width * 0.65 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  bedCard: {
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.base,
    marginBottom: Spacing.base,
    ...Shadows.primary,
  },
  bedCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  bedCardLabel: { color: '#FFFFFF90', fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, letterSpacing: 1 },
  bedCardBed: { color: '#FFFFFF', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], marginTop: 2 },
  bedCardStats: { flexDirection: 'row', gap: Spacing.base, marginBottom: Spacing.md },
  bedStatLabel: { color: '#FFFFFF80', fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  bedStatValue: { color: '#FFFFFF', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  propertyName: { color: '#FFFFFF80', fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  pendingCard: { borderWidth: 1.5, alignItems: 'center', padding: Spacing.xl, gap: Spacing.sm },
  pendingTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md },
  pendingSubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, textAlign: 'center' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  quickBtn: {
    width: (width - Spacing.base * 2 - Spacing.sm * 2) / 3,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  quickLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, marginBottom: Spacing.sm },
  totalDue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md },
  dueItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.sm },
  dueMonth: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base },
  dueDue: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  dueAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, gap: Spacing.sm },
  listTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  listSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  viewAll: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, marginTop: Spacing.sm, textAlign: 'right' },
});

