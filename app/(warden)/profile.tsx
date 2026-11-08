import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { ScreenHeader } from '../../src/components/ui';
import { ProfileEditor } from '../../src/components/ProfileEditor';
import { ThemePicker } from '../../src/components/ThemePicker';
import { Card } from '../../src/components/ui/Card';

export default function WardenProfileScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Warden Profile" subtitle="Edit your manager identity" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ProfileEditor tenantMode={false} />
        <Card style={styles.card}>
          <Text style={[styles.title, { color: theme.text }]}>🎨 YOUR THEME CONTROL</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Your choice applies to the whole app for your account only.
          </Text>
          <ThemePicker />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { padding: Spacing.base },
  title: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: 4 },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.sm },
});
