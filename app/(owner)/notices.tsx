import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../../src/lib/supabase';
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatCurrency, formatDate, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';
import { sendToMany } from '../../src/services/messaging';

type NoticeType = 'general' | 'fine' | 'maintenance' | 'rules' | 'emergency' | 'rent_reminder';

export default function OwnerNoticesScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [type, setType] = useState<NoticeType>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [damagedItem, setDamagedItem] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-notices'],
    queryFn: async () => {
      const { data: properties } = await supabase.from('properties').select('id, name');
      const { data: notices } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return { properties: properties || [], notices: notices || [] };
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error('Title and message are required');
      const propertyId = data?.properties?.[0]?.id;
      if (!propertyId) throw new Error('No property found. Add a property first.');
      setSaving(true);

      const finePaise = type === 'fine' && fineAmount ? Math.round(parseFloat(fineAmount) * 100) : null;
      const { error } = await supabase.from('notices').insert({
        property_id: propertyId,
        author_id: user?.id,
        type,
        title: title.trim(),
        body: body.trim(),
        is_pinned: isPinned,
        fine_amount: finePaise,
        damaged_item: type === 'fine' ? damagedItem.trim() || null : null,
      } as any);
      if (error) throw new Error(friendlyDbError(error));

      // Notify every tenant in this property.
      const { data: tenants } = await supabase
        .from('tenants')
        .select('user_id')
        .eq('property_id', propertyId);
      const userIds = (tenants || []).map((t: any) => t.user_id).filter(Boolean);
      if (userIds.length) {
        await sendToMany(userIds, {
          type: type === 'fine' ? 'fine' : 'notice',
          title: `📢 ${title.trim()}`,
          body: type === 'fine' && finePaise
            ? `${body.trim()} Fine: ${formatCurrency(finePaise)}${damagedItem ? ` for ${damagedItem}` : ''}`
            : body.trim(),
        });
      }
    },
    onSuccess: () => {
      setSaving(false);
      setTitle('');
      setBody('');
      setDamagedItem('');
      setFineAmount('');
      setIsPinned(false);
      queryClient.invalidateQueries({ queryKey: ['owner-notices'] });
      Alert.alert('Notice Published', 'All tenants in the property have been notified.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Publish Failed', err?.message ?? 'Could not publish notice');
    },
  });

  if (isLoading) return <LoadingView message="Loading notices..." />;

  const notices = data?.notices || [];
  const typeOptions: { value: NoticeType; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'fine', label: '💸 Fine' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'rules', label: 'Rules' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'rent_reminder', label: 'Rent Reminder' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Notices & Fines" subtitle="Publish to all tenants" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>NEW NOTICE</Text>
          <View style={styles.typeRow}>
            {typeOptions.map((opt) => (
              <Button
                key={opt.value}
                title={opt.label}
                size="sm"
                fullWidth={false}
                variant={type === opt.value ? 'primary' : 'secondary'}
                onPress={() => setType(opt.value)}
              />
            ))}
            <Button
              title={isPinned ? '📌 Pinned' : 'Pin'}
              size="sm"
              fullWidth={false}
              variant={isPinned ? 'primary' : 'outline'}
              onPress={() => setIsPinned(!isPinned)}
            />
          </View>
          <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Fine for damaged property" required />
          <Input
            label="Message"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={3}
            placeholder="Details visible to all tenants"
            required
          />
          {type === 'fine' && (
            <>
              <Input label="Damaged Item" value={damagedItem} onChangeText={setDamagedItem} placeholder="e.g. Broken window glass" />
              <Input
                label="Fine Amount (₹)"
                value={fineAmount}
                onChangeText={setFineAmount}
                keyboardType="numeric"
                placeholder="e.g. 1500"
                required
              />
            </>
          )}
          <Button
            title={saving ? 'Publishing...' : 'Publish to All Tenants'}
            onPress={() => createMutation.mutate()}
            isLoading={saving}
            style={{ marginTop: Spacing.sm }}
          />
          {!isSupabaseConfigured && (
            <Text style={[styles.demoNote, { color: theme.textMuted }]}>Live data: notices publish to Supabase and notify all tenants.</Text>
          )}
        </Card>

        <Text style={[styles.heading, { color: theme.text }]}>RECENT NOTICES</Text>
        {notices.length === 0 ? (
          <EmptyState icon="📢" title="No Notices Yet" description="Publish your first notice above." />
        ) : (
          notices.map((n: any) => (
            <Card key={n.id} style={styles.noticeCard}>
              <View style={styles.noticeTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.noticeTitle, { color: theme.text }]}>{n.title}</Text>
                  <Text style={[styles.noticeMeta, { color: theme.textMuted }]}>
                    {formatDate(n.created_at)} · {n.type?.toUpperCase()}
                    {n.is_pinned ? ' · 📌' : ''}
                  </Text>
                </View>
                <Badge
                  label={n.type === 'fine' ? 'FINE' : n.type}
                  status={n.type === 'fine' ? 'urgent' : n.type === 'emergency' ? 'rejected' : 'approved'}
                  size="sm"
                />
              </View>
              {n.fine_amount ? (
                <Text style={[styles.fineLine, { color: Colors.error }]}>
                  Fine: {formatCurrency(n.fine_amount)}{n.damaged_item ? ` · ${n.damaged_item}` : ''}
                </Text>
              ) : null}
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  demoNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: Spacing.xs },
  heading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  noticeCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  noticeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  noticeTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  noticeMeta: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  fineLine: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, marginTop: 4 },
  noticeBody: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 4, lineHeight: 18 },
});
