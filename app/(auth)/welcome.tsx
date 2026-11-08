import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { isSupabaseConfigured } from '../../src/lib/supabase';
import { Button } from '../../src/components/ui/Button';

const { width, height } = Dimensions.get('window');

const FEATURES = [
  { icon: '🏠', label: 'Bed Matrix' },
  { icon: '💰', label: 'Smart Billing' },
  { icon: '🛠️', label: 'Complaints' },
  { icon: '📢', label: 'Notices' },
  { icon: '🔒', label: 'AES-256 KYC' },
  { icon: '📊', label: 'Audit Reports' },
];

export default function WelcomeScreen() {
  const { isDark, preference, setPreference } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { configError } = useAuthStore();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Dynamic Background Orbs (soft in light mode too) */}
      <View style={styles.bgGradient}>
        <View style={[styles.orb1, { backgroundColor: isDark ? Colors.primary + '35' : Colors.primary + '14' }]} />
        <View style={[styles.orb2, { backgroundColor: isDark ? Colors.accent + '25' : Colors.accent + '10' }]} />
      </View>

      <SafeAreaView style={styles.safe}>
        {/* Top Controls */}
        <View style={styles.topBar}>
          <View style={[styles.badgePill, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.badgePillText, { color: theme.textSecondary }]}>
              v1.0 · Android & iOS Ready
            </Text>
          </View>
          <View style={styles.themePicker}>
            {(['system', 'light', 'dark'] as const).map((pref) => (
              <TouchableOpacity
                key={pref}
                onPress={() => setPreference(pref)}
                style={[
                  styles.themeChip,
                  { borderColor: theme.border, backgroundColor: theme.card },
                  preference === pref && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    { color: preference === pref ? '#FFF' : theme.textSecondary },
                  ]}
                >
                  {pref === 'system' ? '◐ Auto' : pref === 'light' ? '☀️' : '🌙'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Branding */}
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🏠</Text>
            </View>
            <Text style={[styles.appName, { color: theme.text }]}>AVTAR SINGH PG</Text>
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>Enterprise Multi-Role PG Management</Text>
          </View>

          {/* Feature Badges */}
          <View style={styles.featureGrid}>
            {FEATURES.map((f) => (
              <View key={f.label} style={[styles.featureItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={[styles.featureLabel, { color: theme.text }]}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* Live-data config guard */}
          {(!isSupabaseConfigured || configError) && (
            <View style={[styles.configWarn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Text style={styles.configWarnTitle}>⚠️ Live data not connected</Text>
              <Text style={styles.configWarnSub}>
                {configError ?? 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart the app.'}
              </Text>
            </View>
          )}

          {/* Standard Auth Actions */}
          <View style={styles.actions}>
            <Button
              title="Sign In with Email"
              onPress={() => router.push('/(auth)/login')}
              style={styles.primaryBtn}
            />
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register/category')}
              style={[styles.registerBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.registerBtnText, { color: theme.text }]}>New Tenant? Register Here</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={[styles.footer, { color: theme.textMuted }]}>
            Protected by Supabase Row-Level-Security & AES-256 Storage
          </Text>
          <Text style={[styles.footer, { color: theme.textMuted, marginTop: 2 }]}>
            Theme: {preference === 'system' ? 'Following your device' : preference} · Tap ☀️ / 🌙 to change
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  orb1: {
    position: 'absolute',
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    top: -width * 0.2,
    left: -width * 0.2,
  },
  orb2: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.6,
    borderRadius: width * 0.3,
    bottom: height * 0.1,
    right: -width * 0.1,
  },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badgePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  badgePillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.xs,
  },
  themePicker: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  themeChip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minWidth: 52,
    alignItems: 'center',
  },
  themeChipText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
  },
  configWarn: {
    width: '100%',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  configWarnTitle: {
    color: '#991B1B',
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
  },
  configWarnSub: {
    color: '#7F1D1D',
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
    alignItems: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    ...Shadows.lg,
  },
  logoEmoji: { fontSize: 40 },
  appName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    textAlign: 'center',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  featureIcon: { fontSize: 16 },
  featureLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
  },
  demoSection: {
    width: '100%',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  demoHeader: {
    marginBottom: Spacing.sm,
  },
  demoTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    marginBottom: 2,
  },
  demoSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
  },
  demoPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  demoPill: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FFFFFF30',
  },
  demoPillText: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
  },
  actions: {
    width: '100%',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
  },
  registerBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  registerBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.base,
  },
  footer: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
