import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import { friendlyDbError, formatDate } from '../../src/utils/helpers';
import { fetchPrivacyPolicy, savePrivacyPolicy, DEFAULT_PRIVACY_POLICY } from '../../src/services/messaging';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, LoadingView } from '../../src/components/ui';

const normalize = (s: string) => s.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');

export default function OwnerPrivacyScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [usesTemplate, setUsesTemplate] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isSet, setIsSet] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['privacy-policy'],
    queryFn: async () => {
      const value = await fetchPrivacyPolicy();
      setText(value);
      setIsSet(Boolean(value?.trim()));
      setUsesTemplate(normalize(value) === normalize(DEFAULT_PRIVACY_POLICY));
      const { data } = await supabase
        .from('app_settings')
        .select('updated_at')
        .eq('key', 'privacy_policy')
        .maybeSingle();
      setUpdatedAt((data as any)?.updated_at ?? null);
      return value;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!text.trim()) throw new Error('Policy text cannot be empty');
      setSaving(true);
      await savePrivacyPolicy(text.trim(), user?.id);
    },
    onSuccess: () => {
      setSaving(false);
      setIsSet(true);
      setUsesTemplate(normalize(text.trim()) === normalize(DEFAULT_PRIVACY_POLICY));
      queryClient.invalidateQueries({ queryKey: ['privacy-policy'] });
      Alert.alert('Policy Published', 'The updated privacy policy is now live for all tenants and wardens.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Save Failed', err?.message ?? friendlyDbError(err));
    },
  });

  if (isLoading) return <LoadingView message="Loading policy..." />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Privacy Policy" subtitle="Tenant-visible policy (owner editable)" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.statusBox,
            {
              backgroundColor: isSet ? Colors.success + '15' : Colors.warning + '15',
              borderColor: isSet ? Colors.success + '45' : Colors.warning + '45',
            },
          ]}
        >
          <View style={styles.statusRow}>
            <Text style={[styles.statusTitle, { color: theme.text }]}>Live Privacy Policy</Text>
            <Badge
              label={isSet ? 'SET & VISIBLE' : 'NOT SET'}
              status={isSet ? 'approved' : 'rejected'}
              size="sm"
            />
          </View>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {usesTemplate
              ? 'Currently using the built-in policy template. Edit the text below to publish your own version.'
              : 'A custom owner-authored policy is published and visible to every tenant.'}
          </Text>
          {updatedAt ? (
            <Text style={[styles.statusMeta, { color: theme.textMuted }]}>
              Last published {formatDate(updatedAt, 'dd MMM yyyy, hh:mm a')}
            </Text>
          ) : null}
        </View>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>CURRENT POLICY</Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Write it yourself, or start from the template and edit it. Tenants and wardens read it
            under Profile → Privacy Policy.
          </Text>
          <Input
            label="Policy Text"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={14}
            style={{ minHeight: 220, textAlignVertical: 'top' }}
            placeholder="Type the privacy policy tenants will see"
          />
          <View style={styles.btnRow}>
            <Button
              title="Insert Template"
              variant="outline"
              onPress={() =>
                Alert.alert(
                  'Insert Template?',
                  'This replaces the current text with a standard privacy policy template you can then edit.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Insert', onPress: () => setText(DEFAULT_PRIVACY_POLICY) },
                  ]
                )
              }
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="Reset to Default"
              variant="secondary"
              onPress={() => setText(DEFAULT_PRIVACY_POLICY)}
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="Save Policy"
              variant="primary"
              onPress={() => saveMutation.mutate()}
              isLoading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>HOW TENANTS SEE IT</Text>
          <View style={[styles.preview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[styles.previewText, { color: theme.textSecondary }]}>{text || '—'}</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { padding: Spacing.base, marginBottom: Spacing.base },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  statusBox: { padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.base },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  statusTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  statusText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 18 },
  statusMeta: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: Spacing.xs },
  hint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  btnRow: { flexDirection: 'row', marginTop: Spacing.sm },
  preview: { borderWidth: 1, borderRadius: 10, padding: Spacing.md },
  previewText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 22 },
});
