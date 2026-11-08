import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';
import { sendToMany } from '../../src/services/messaging';

export default function WardenNoticesScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-notices'],
    queryFn: async () => {
      const { data: membership } = await supabase
        .from('property_memberships')
        .select('property_id')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .maybeSingle();
      const propertyId = (membership as any)?.property_id;
      if (!propertyId && !user) return { propertyId: null, notices: [] };
      let q = supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(50);
      if (propertyId) q = q.eq('property_id', propertyId);
      const { data: notices } = await q;
      return { propertyId: propertyId ?? null, notices: notices || [] };
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error('Title and message are required');
      const propertyId = data?.propertyId;
      if (!propertyId) throw new Error('No property assigned to you. Ask the owner to assign one.');
      setSaving(true);
      const { error } = await supabase.from('notices').insert({
        property_id: propertyId,
        author_id: user?.id,
        type: 'general',
        title: title.trim(),
        body: body.trim(),
        is_pinned: false,
      } as any);
      if (error) throw new Error(friendlyDbError(error));

      const { data: tenants } = await supabase.from('tenants').select('user_id').eq('property_id', propertyId);
      const userIds = (tenants || []).map((t: any) => t.user_id).filter(Boolean);
      if (userIds.length) {
        await sendToMany(userIds, { type: 'notice', title: `📢 ${title.trim()}`, body: body.trim() });
      }
    },
    onSuccess: () => {
      setSaving(false);
      setTitle('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['warden-notices'] });
      Alert.alert('Notice Sent', 'All tenants in your property have been notified.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Send Failed', err?.message ?? 'Could not send notice');
    },
  });

  if (isLoading) return <LoadingView message="Loading notice board..." />;

  const notices = data?.notices || [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Broadcast Notices" subtitle="Send anytime updates to all tenants" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>SEND NOTICE TO ALL TENANTS</Text>
          <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Water supply maintenance today" required />
          <Input
            label="Message"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={3}
            placeholder="What do tenants need to know?"
            required
          />
          <Button title="📢 Send to All Tenants" onPress={() => createMutation.mutate()} isLoading={saving} />
        </Card>

        <Text style={[styles.heading, { color: theme.text }]}>PREVIOUS NOTICES</Text>
        {notices.length === 0 ? (
          <EmptyState icon="📢" title="No Notices Yet" description="Broadcast your first update above." />
        ) : (
          notices.slice(0, 20).map((n: any) => (
            <Card key={n.id} style={styles.noticeCard}>
              <View style={styles.noticeTop}>
                <Text style={[styles.noticeTitle, { color: theme.text }]}>{n.title}</Text>
                <Badge label={n.type} status={n.type} size="sm" />
              </View>
              <Text style={[styles.noticeMeta, { color: theme.textMuted }]}>{formatDate(n.created_at)}</Text>
              <Text style={[styles.noticeBody, { color: theme.textSecondary }]} numberOfLines={3}>{n.body}</Text>
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
  card: { padding: Spacing.base, marginBottom: Spacing.base },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  heading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  noticeCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  noticeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  noticeTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, flex: 1 },
  noticeMeta: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  noticeBody: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 4, lineHeight: 18 },
});
