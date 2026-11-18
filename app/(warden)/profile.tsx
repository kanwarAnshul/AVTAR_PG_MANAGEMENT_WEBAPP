import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Spacing, Typography } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { ScreenHeader } from '../../src/components/ui';
import { ProfileEditor } from '../../src/components/ProfileEditor';
import { ThemePicker } from '../../src/components/ThemePicker';
import { Card } from '../../src/components/ui/Card';

export default function WardenProfileScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const policyRows: { title: string; sub: string; icon: string; href: any }[] = [
    { title: 'Privacy Policy', sub: 'How tenant data is handled', icon: '📜', href: '/policy?type=privacy' },
    { title: 'Terms & Conditions', sub: 'Rules tenants accept at login', icon: '🧾', href: '/policy?type=terms' },
  ];

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

        <Card style={styles.card}>
          <Text style={[styles.title, { color: theme.text }]}>📄 PG POLICIES</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Published by the owner and visible to every warden and tenant.
          </Text>
          {policyRows.map((row, i) => (
            <TouchableOpacity
              key={row.title}
              style={[
                styles.prefRow,
                { borderBottomColor: theme.border, borderBottomWidth: i === policyRows.length - 1 ? 0 : 1 },
              ]}
              onPress={() => router.push(row.href as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.prefTitle, { color: theme.text }]}>
                  {row.icon} {row.title}
                </Text>
                <Text style={[styles.prefSub, { color: theme.textSecondary }]}>{row.sub}</Text>
              </View>
              <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
            </TouchableOpacity>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { padding: Spacing.base, marginTop: Spacing.base },
  title: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: 4 },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.sm },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  prefTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  prefSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});
