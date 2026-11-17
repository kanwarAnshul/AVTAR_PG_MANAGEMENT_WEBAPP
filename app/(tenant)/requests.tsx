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

const REQUEST_CATEGORIES = [
  { label: '💧 Water', value: 'water' },
  { label: '⚡ Electricity', value: 'electricity' },
  { label: '🧹 Cleaning', value: 'cleaning' },
  { label: '🪑 Furniture', value: 'furniture' },
  { label: '📶 WiFi', value: 'wifi' },
  { label: '📋 Other', value: 'other' },
];

export default function TenantRequestsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tenant-requests', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, property_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!tenant) return null;
      const { data: requests } = await supabase
        .from('tenant_requests')
        .select('*')
        .eq('tenant_id', (tenant as any).id)
        .order('created_at', { ascending: false });
      return { tenant, requests: requests || [] };
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Please give your request a title');
      if (!data?.tenant) throw new Error('Tenant record not found');
      setSaving(true);
      const { error } = await supabase.from('tenant_requests').insert({
        tenant_id: (data.tenant as any).id,
        property_id: (data.tenant as any).property_id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        status: 'pending',
      } as any);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      setSaving(false);
      setTitle('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['tenant-requests'] });
      Alert.alert('Request Sent', 'The warden will review your requirement and respond here.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Send Failed', err?.message ?? 'Could not send request');
    },
  });

  if (isLoading) return <LoadingView message="Loading requests..." />;

  const requests = data?.requests || [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="My Requests" subtitle="Ask the warden for property requirements" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>NEW REQUIREMENT REQUEST</Text>
          <View style={styles.catRow}>
            {REQUEST_CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                title={cat.label}
                size="sm"
                fullWidth={false}
                variant={category === cat.value ? 'primary' : 'secondary'}
                onPress={() => setCategory(cat.value)}
              />
            ))}
          </View>
          <Input label="What do you need?" value={title} onChangeText={setTitle} placeholder="e.g. New water filter at our floor" required />
          <Input
            label="Details (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
            placeholder="Explain why it is actually required"
          />
          <Button title="Send Request to Warden" onPress={() => createMutation.mutate()} isLoading={saving} style={{ marginTop: Spacing.sm }} />
        </Card>

        <Text style={[styles.heading, { color: theme.text }]}>MY REQUESTS ({requests.length})</Text>
        {requests.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No Requests Yet"
            description="Send your first requirement request above — approve or reject will show here with the warden reason."
          />
        ) : (
          requests.map((r: any) => (
            <Card key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.text }]}>{r.title}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {r.category?.toUpperCase()} · {formatDate(r.created_at)}
                  </Text>
                </View>
                <Badge label={r.status} status={r.status} size="sm" />
              </View>
              {r.description ? <Text style={[styles.body, { color: theme.textSecondary }]}>{r.description}</Text> : null}
              {r.decision_reason ? (
                <Text style={[styles.decision, { color: r.status === 'approved' ? Colors.success : Colors.error }]}>
                  {r.status === 'approved' ? '✅ Warden: ' : '❌ Warden: '}{r.decision_reason}
                </Text>
              ) : null}
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
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  heading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  body: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: 4, lineHeight: 20 },
  decision: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginTop: 6, lineHeight: 20 },
});
