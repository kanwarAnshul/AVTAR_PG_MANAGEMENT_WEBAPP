import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { friendlyDbError } from '../../src/utils/helpers';
import {
  DEFAULT_TERMS,
  fetchTerms,
  saveTerms,
  fetchTermsGateEnabled,
  saveTermsGateEnabled,
} from '../../src/services/messaging';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader, LoadingView } from '../../src/components/ui';

/**
 * Owner-authored Terms & Conditions.
 *
 * Two ways to write it:
 *   1. Free text — type or paste directly into the editor.
 *   2. Template  — "Insert Template" drops in a standard PG boilerplate
 *                  that can then be edited line by line.
 *
 * The gate switch decides whether a tenant must accept the terms before
 * entering the app (optional, ON by default).
 */
export default function OwnerTermsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [gateOn, setGateOn] = useState(true);

  const { isLoading } = useQuery({
    queryKey: ['terms-conditions'],
    queryFn: async () => {
      const value = await fetchTerms();
      setText(value);
      return value;
    },
  });

  const { isLoading: gateLoading } = useQuery({
    queryKey: ['terms-gate'],
    queryFn: async () => {
      const enabled = await fetchTermsGateEnabled();
      setGateOn(enabled);
      return enabled;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!text.trim()) throw new Error('Terms text cannot be empty');
      setSaving(true);
      await saveTerms(text.trim(), user?.id);
    },
    onSuccess: () => {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: ['terms-conditions'] });
      Alert.alert(
        'Terms Saved',
        'Tenants will be asked to accept the updated Terms & Conditions at their next login.'
      );
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Save Failed', err?.message ?? friendlyDbError(err));
    },
  });

  const toggleGate = async (value: boolean) => {
    const previous = gateOn;
    setGateOn(value);
    try {
      await saveTermsGateEnabled(value, user?.id);
      queryClient.invalidateQueries({ queryKey: ['terms-gate'] });
      Alert.alert(
        value ? 'Login Gate Enabled' : 'Login Gate Disabled',
        value
          ? 'Tenants must read and accept the Terms & Conditions before entering the app.'
          : 'Tenants can now enter the app without accepting the Terms.'
      );
    } catch (err: any) {
      setGateOn(previous);
      Alert.alert('Could Not Save', err?.message ?? friendlyDbError(err));
    }
  };

  const insertTemplate = () => {
    Alert.alert(
      'Insert Template?',
      'This replaces the current text with a standard PG terms template you can then edit.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Insert', onPress: () => setText(DEFAULT_TERMS) },
      ]
    );
  };

  if (isLoading || gateLoading) return <LoadingView message="Loading terms..." />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Terms & Conditions" subtitle="Owner-authored, visible to all roles" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <View style={styles.badgeRow}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
              WRITE YOUR TERMS
            </Text>
            <Badge label={gateOn ? 'LOGIN GATE ON' : 'LOGIN GATE OFF'} status={gateOn ? 'approved' : 'pending'} size="sm" />
          </View>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Write it yourself, or start from the template and edit it. Tenants see it under
            Profile → Terms & Conditions.
          </Text>
          <Input
            label="Terms Text"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={16}
            style={{ minHeight: 260, textAlignVertical: 'top' }}
            placeholder="Type the terms and conditions tenants must accept"
          />
          <View style={styles.btnRow}>
            <Button
              title="Insert Template"
              variant="outline"
              onPress={insertTemplate}
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="Reset"
              variant="secondary"
              onPress={() => setText(DEFAULT_TERMS)}
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="Save"
              variant="primary"
              onPress={() => saveMutation.mutate()}
              isLoading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>🚪 TENANT LOGIN GATE (OPTIONAL)</Text>
          <View style={styles.gateRow}>
            <View style={{ flex: 1, paddingRight: Spacing.md }}>
              <Text style={[styles.gateTitle, { color: theme.text }]}>
                Require acceptance before login
              </Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                When ON, a tenant cannot enter the app until they read and accept these Terms.
                They are asked again whenever you save a change here. Wardens and you are never
                blocked.
              </Text>
            </View>
            <Switch
              value={gateOn}
              onValueChange={toggleGate}
              trackColor={{ false: theme.border, true: Colors.primary + '99' }}
              thumbColor={gateOn ? Colors.primary : '#f4f3f4'}
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
  sectionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  hint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  btnRow: { flexDirection: 'row', marginTop: Spacing.sm },
  gateRow: { flexDirection: 'row', alignItems: 'center' },
  gateTitle: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    marginBottom: 4,
  },
  preview: { borderWidth: 1, borderRadius: 10, padding: Spacing.md },
  previewText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 22,
  },
});
