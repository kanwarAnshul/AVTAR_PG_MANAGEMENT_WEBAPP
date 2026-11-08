import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { formatDate, formatRelativeTime } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

const ACTION_LABELS: Record<string, string> = {
  APPROVE_TENANT_DIGITAL: 'Approved tenant (digital KYC)',
  APPROVE_TENANT_MANUAL: 'Approved tenant (manual KYC)',
  REJECT_TENANT: 'Rejected tenant',
  OWNER_FINAL_APPROVE: 'Final owner approval',
  OWNER_ADD_ROOM: 'Added a room',
  ASSIGN_BED: 'Assigned a bed',
  RELEASE_BED: 'Released a bed',
  COLLECT_RENT: 'Collected rent',
  RESOLVE_COMPLAINT: 'Resolved a complaint',
  UPDATE_COMPLAINT: 'Updated a complaint',
};

export default function OwnerActivityScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-warden-activity'],
    queryFn: async () => {
      const { data: wardens } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'warden');
      const wardenIds = (wardens || []).map((w: any) => w.id);
      if (!wardenIds.length) return [];
      const { data: events } = await supabase
        .from('audit_events')
        .select('*')
        .in('actor_id', wardenIds)
        .order('created_at', { ascending: false })
        .limit(100);
      const nameMap = new Map((wardens || []).map((w: any) => [w.id, w.full_name || w.email]));
      return (events || []).map((e: any) => ({ ...e, actor_name: nameMap.get(e.actor_id) ?? 'Warden' }));
    },
  });

  if (isLoading) return <LoadingView message="Loading warden activity..." />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Warden Activity" subtitle="Audit trail — is the warden working properly?" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {data.length === 0 ? (
          <EmptyState
            icon="👁️"
            title="No Warden Activity Yet"
            description="Approvals, bed assignments and collections by wardens will appear here."
          />
        ) : (
          data.map((e: any) => (
            <Card key={e.id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.action, { color: theme.text }]}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    {e.actor_name} · {e.table_name ?? 'record'} · {formatDate(e.created_at)} ({formatRelativeTime(e.created_at)})
                  </Text>
                </View>
                <Badge label={e.action.includes('REJECT') ? 'rejected' : 'approved'} size="sm" />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { padding: Spacing.md, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  action: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});
