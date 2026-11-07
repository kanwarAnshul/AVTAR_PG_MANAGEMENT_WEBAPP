import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function TenantNoticesScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: notices = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tenant-notices', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: tenant } = await supabase
        .from('tenants')
        .select('property_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!tenant) return [];

      const { data } = await supabase
        .from('notices')
        .select('*')
        .eq('property_id', tenant.property_id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      return data || [];
    },
    enabled: !!user,
  });

  // Real-time subscription to notices
  useEffect(() => {
    const channel = supabase
      .channel('public:notices')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notices' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-notices'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (isLoading) return <LoadingView message="Loading notice board..." />;

  const getNoticeBadge = (type: string, isPinned: boolean) => {
    if (isPinned) return { label: 'PINNED', status: 'urgent' };
    if (type === 'emergency') return { label: 'EMERGENCY', status: 'rejected' };
    if (type === 'maintenance') return { label: 'MAINTENANCE', status: 'pending' };
    if (type === 'rent_reminder') return { label: 'RENT REMINDER', status: 'overdue' };
    return { label: 'ANNOUNCEMENT', status: 'approved' };
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Notice Board"
        subtitle="Official updates from PG management & warden"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {notices.length === 0 ? (
          <EmptyState
            icon="📢"
            title="No Notices Active"
            description="All official announcements and maintenance schedules will be posted here."
          />
        ) : (
          notices.map((n: any) => {
            const badge = getNoticeBadge(n.type, n.is_pinned);
            return (
              <Card
                key={n.id}
                style={[
                  styles.noticeCard,
                  n.is_pinned && { borderColor: Colors.accent, borderWidth: 1.5 },
                  n.type === 'emergency' && { borderColor: Colors.error, borderWidth: 1.5 },
                ]}
              >
                <View style={styles.noticeHeader}>
                  <Text style={[styles.noticeTitle, { color: theme.text }]}>
                    {n.is_pinned ? '📌 ' : n.type === 'emergency' ? '🚨 ' : '📢 '}
                    {n.title}
                  </Text>
                  <Badge label={badge.label} status={badge.status} size="sm" />
                </View>
                <Text style={[styles.noticeMeta, { color: theme.textSecondary }]}>
                  Posted on {formatDate(n.created_at)}
                </Text>
                <Text style={[styles.noticeBody, { color: theme.text, borderTopColor: theme.border }]}>
                  {n.body}
                </Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  noticeCard: { marginBottom: Spacing.md, padding: Spacing.base },
  noticeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  noticeTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, flex: 1 },
  noticeMeta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 4, marginBottom: Spacing.sm },
  noticeBody: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 22, borderTopWidth: 1, paddingTop: Spacing.sm },
});
