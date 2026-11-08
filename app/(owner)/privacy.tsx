import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { friendlyDbError } from '../../src/utils/helpers';
import { fetchPrivacyPolicy, savePrivacyPolicy, DEFAULT_PRIVACY_POLICY } from '../../src/services/messaging';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, LoadingView } from '../../src/components/ui';

export default function OwnerPrivacyScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['privacy-policy'],
    queryFn: async () => {
      const value = await fetchPrivacyPolicy();
      setText(value);
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
      queryClient.invalidateQueries({ queryKey: ['privacy-policy'] });
      Alert.alert('Policy Saved', 'Tenants will see the updated privacy policy.');
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
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>CURRENT POLICY</Text>
          <Input
            label="Policy Text"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={14}
            style={{ minHeight: 220 }}
            placeholder="Type the privacy policy tenants will see"
          />
          <View style={styles.btnRow}>
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
  btnRow: { flexDirection: 'row', marginTop: Spacing.sm },
  preview: { borderWidth: 1, borderRadius: 10, padding: Spacing.md },
  previewText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 22 },
});
