import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
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

const RULES_TITLE = 'Property House Rules';

export default function OwnerNoticesScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ type?: string }>();
  const isRulesMode = params.type === 'rules';

  const [type, setType] = useState<NoticeType>(isRulesMode ? 'rules' : 'general');
  const [title, setTitle] = useState(isRulesMode ? RULES_TITLE : '');
  const [body, setBody] = useState('');
  const [damagedItem, setDamagedItem] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [isPinned, setIsPinned] = useState(isRulesMode);
  const [targetPropertyId, setTargetPropertyId] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  // Deep link from Settings → Property House Rules (and first-login prompt)
  // opens this screen pre-configured for authoring the property rules. The
  // initial useState values above already reflect isRulesMode, so no effect
  // (and no cascading re-render) is needed.

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-notices'],
    queryFn: async () => {
      const { data: properties, error: propError } = await supabase
        .from('properties')
        .select('id, name')
        .order('created_at', { ascending: true });
      if (propError) throw new Error(friendlyDbError(propError));
      const { data: notices, error: noticeError } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (noticeError) throw new Error(friendlyDbError(noticeError));
      return { properties: properties || [], notices: notices || [] };
    },
  });

  const chooseType = (t: NoticeType) => {
    setType(t);
    if (t === 'rules') {
      setIsPinned(true);
      setTitle((current) => current || RULES_TITLE);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error('Title and message are required');
      const properties = data?.properties ?? [];
      if (!properties.length) throw new Error('No property found. Add a property first.');

      // Rules and general notices always reach every tenant of every property.
      // Other notices default to "all" but may be targeted to one property.
      const targets =
        targetPropertyId === 'all' || type === 'rules'
          ? properties
          : properties.filter((p: any) => p.id === targetPropertyId);
      if (!targets.length) throw new Error('Select a valid property.');

      setSaving(true);
      const finePaise = type === 'fine' && fineAmount ? Math.round(parseFloat(fineAmount) * 100) : null;
      const pinned = type === 'rules' ? true : isPinned;

      // Insert one notice row per target property so RLS and tenant feeds
      // work correctly for every property (not just the first one).
      for (const prop of targets as any[]) {
        const { error } = await supabase.from('notices').insert({
          property_id: prop.id,
          author_id: user?.id,
          type,
          title: title.trim(),
          body: body.trim(),
          is_pinned: pinned,
          fine_amount: finePaise,
          damaged_item: type === 'fine' ? damagedItem.trim() || null : null,
        } as any);
        if (error) throw new Error(friendlyDbError(error));
      }

      // Notify every tenant in the target properties, de-duplicated so a
      // tenant belonging to multiple properties gets a single notification.
      const tenantIds = await Promise.all(
        (targets as any[]).map(async (prop) => {
          const { data: tenants } = await supabase
            .from('tenants')
            .select('user_id')
            .eq('property_id', prop.id);
          return (tenants || []).map((t: any) => t.user_id).filter(Boolean) as string[];
        })
      );
      const userIds = Array.from(new Set(tenantIds.flat()));
      if (userIds.length) {
        await sendToMany(userIds, {
          type: type === 'fine' ? 'fine' : 'notice',
          title: `📢 ${title.trim()}`,
          body:
            type === 'fine' && finePaise
              ? `${body.trim()} Fine: ${formatCurrency(finePaise)}${damagedItem ? ` for ${damagedItem}` : ''}`
              : body.trim(),
          data: { notice_type: type, property_ids: (targets as any[]).map((p) => p.id) },
        });
      }
    },
    onSuccess: () => {
      setSaving(false);
      setTitle(isRulesMode ? RULES_TITLE : '');
      setBody('');
      setDamagedItem('');
      setFineAmount('');
      setIsPinned(isRulesMode);
      queryClient.invalidateQueries({ queryKey: ['owner-notices'] });
      Alert.alert(
        'Published',
        `Your notice is now visible to tenants in ${
          targetPropertyId === 'all' || type === 'rules'
            ? 'all properties'
            : 'the selected property'
        }.`
      );
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Publish Failed', err?.message ?? 'Could not publish notice');
    },
  });

  if (isLoading) return <LoadingView message="Loading notices..." />;

  const notices = data?.notices || [];
  const properties = data?.properties || [];
  const typeOptions: { value: NoticeType; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'fine', label: '💸 Fine' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'rules', label: '📋 Rules' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'rent_reminder', label: 'Rent Reminder' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={isRulesMode ? 'Property House Rules' : 'Notices & Fines'}
        subtitle={isRulesMode ? 'Rules are pinned and shown to every tenant' : 'Publish to all tenants'}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {isRulesMode ? (
          <View style={[styles.rulesInfo, { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '40' }]}>
            <Text style={[styles.rulesInfoTitle, { color: theme.text }]}>📋 Property Rules</Text>
            <Text style={[styles.rulesInfoText, { color: theme.textSecondary }]}>
              Write the rules once and they are pinned for every tenant in every property. Tenants see them under Notices
              and in the Policies section of the app.
            </Text>
          </View>
        ) : null}

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {isRulesMode ? 'WRITE YOUR PROPERTY RULES' : 'NEW NOTICE'}
          </Text>
          <View style={styles.typeRow}>
            {typeOptions.map((opt) => (
              <Button
                key={opt.value}
                title={opt.label}
                size="sm"
                fullWidth={false}
                variant={type === opt.value ? 'primary' : 'secondary'}
                onPress={() => chooseType(opt.value)}
              />
            ))}
            <Button
              title={isPinned || type === 'rules' ? '📌 Pinned' : 'Pin'}
              size="sm"
              fullWidth={false}
              variant={isPinned || type === 'rules' ? 'primary' : 'outline'}
              onPress={() => (type === 'rules' ? null : setIsPinned(!isPinned))}
            />
          </View>
          <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Fine for damaged property" required />
          <Input
            label={type === 'rules' ? 'Rules & Regulations' : 'Message'}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={type === 'rules' ? 6 : 3}
            placeholder={
              type === 'rules'
                ? 'e.g. 1. Gate closes at 10:30 PM.\n2. Visitors allowed in the lounge only.\n3. Keep common areas clean.'
                : 'Details visible to all tenants'
            }
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

          {type !== 'rules' && properties.length > 1 ? (
            <View style={styles.targetWrap}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Publish to</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.targetRow}>
                <TouchableOpacity
                  onPress={() => setTargetPropertyId('all')}
                  style={[
                    styles.targetChip,
                    {
                      borderColor: targetPropertyId === 'all' ? theme.primary : theme.border,
                      backgroundColor: targetPropertyId === 'all' ? theme.primary : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.targetChipText, { color: targetPropertyId === 'all' ? '#FFFFFF' : theme.text }]}>
                    All Properties
                  </Text>
                </TouchableOpacity>
                {properties.map((p: any) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setTargetPropertyId(p.id)}
                    style={[
                      styles.targetChip,
                      {
                        borderColor: targetPropertyId === p.id ? theme.primary : theme.border,
                        backgroundColor: targetPropertyId === p.id ? theme.primary : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.targetChipText, { color: targetPropertyId === p.id ? '#FFFFFF' : theme.text }]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Button
            title={type === 'rules' ? 'Publish Rules to All Tenants' : 'Publish to All Tenants'}
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
                <Text style={[styles.fineLine, { color: theme.error }]}>
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
  rulesInfo: { padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.base },
  rulesInfoTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, marginBottom: Spacing.xs },
  rulesInfoText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 18 },
  targetWrap: { marginTop: Spacing.sm },
  fieldLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginBottom: Spacing.xs },
  targetRow: { flexGrow: 0 },
  targetChip: { borderWidth: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginRight: Spacing.sm },
  targetChipText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
});
