import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { todayLocalISO, formatRelativeTime } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function WardenPresenceScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();

  const today = todayLocalISO();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-presence-today', today],
    queryFn: async () => {
      const { data: membership } = await supabase
        .from('property_memberships')
        .select('property_id')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .maybeSingle();
      const propertyId = (membership as any)?.property_id;

      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, full_name, category')
        .eq(propertyId ? 'property_id' : 'id', propertyId ?? '');
      const tenantRows = tenants || [];

      const { data: presence } = await supabase
        .from('daily_presence')
        .select('*')
        .eq('presence_date', today);
      const presenceByTenant = new Map(
        ((presence as any[]) || []).map((p: any) => [p.tenant_id, p])
      );

      const listed = tenantRows.map((t: any) => ({
        ...t,
        presence: presenceByTenant.get(t.id) ?? null,
      }));
      const presentCount = listed.filter((t: any) => t.presence?.status === 'present').length;
      const absentCount = listed.filter((t: any) => t.presence?.status === 'absent').length;
      const unmarked = listed.length - presentCount - absentCount;
      return { listed, presentCount, absentCount, unmarked };
    },
    enabled: !!user,
  });

  if (isLoading) return <LoadingView message="Loading presence..." />;

  const { listed = [], presentCount = 0, absentCount = 0, unmarked = 0 } = data || {};

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Presence Board"
        subtitle={`Today ${today} · ${presentCount} present · ${absentCount} absent`}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        <View style={styles.statsRow}>
          <Card style={[styles.stat, { backgroundColor: '#F0FDF4' }]}>
            <Text style={[styles.statNum, { color: '#166534' }]}>{presentCount} 🟢</Text>
            <Text style={[styles.statLabel, { color: '#166534' }]}>Present</Text>
          </Card>
          <Card style={[styles.stat, { backgroundColor: '#FEF2F2' }]}>
            <Text style={[styles.statNum, { color: '#991B1B' }]}>{absentCount} 🔴</Text>
            <Text style={[styles.statLabel, { color: '#991B1B' }]}>Not Present</Text>
          </Card>
          <Card style={[styles.stat, { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.statNum, { color: theme.text }]}>{unmarked} ⚪</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Not Marked</Text>
          </Card>
        </View>

        {listed.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No Tenants Found"
            description="Tenants who mark themselves present/absent will appear here."
          />
        ) : (
          listed.map((t: any) => (
            <Card key={t.id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]}>{t.full_name}</Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    {t.category?.toUpperCase()}
                    {t.presence ? ` · marked ${formatRelativeTime(t.presence.marked_at)}` : ' · not marked yet'}
                  </Text>
                </View>
                <Badge
                  label={t.presence?.status ?? 'not marked'}
                  status={t.presence?.status ?? 'draft'}
                  size="sm"
                />
              </View>
            </Card>
          ))
        )}
        <Text style={[styles.note, { color: theme.textMuted }]}>
          Tenants mark present/absent from their own app; absent tenants simply do not check in today.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  stat: { flex: 1, padding: Spacing.md, alignItems: 'center' },
  statNum: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size.lg },
  statLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginTop: 2 },
  card: { padding: Spacing.md, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  note: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
});
