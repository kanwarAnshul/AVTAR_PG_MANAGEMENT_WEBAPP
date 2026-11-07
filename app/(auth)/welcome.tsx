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
import { useAuthStore, DemoPersona } from '../../src/stores/authStore';
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
  const { isDark, toggleTheme } = useThemeStore();
  const { loginAsDemo } = useAuthStore();

  const handleDemoSelect = (persona: DemoPersona) => {
    loginAsDemo(persona);
    if (persona === 'owner') {
      router.replace('/(owner)');
    } else if (persona === 'warden') {
      router.replace('/(warden)');
    } else {
      router.replace('/(tenant)');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: isDark ? '#0F172A' : '#0B1329' }]}>
      {/* Dynamic Background Orbs */}
      <View style={styles.bgGradient}>
        <View style={[styles.orb1, { backgroundColor: Colors.primary + '35' }]} />
        <View style={[styles.orb2, { backgroundColor: Colors.accent + '25' }]} />
      </View>

      <SafeAreaView style={styles.safe}>
        {/* Top Controls */}
        <View style={styles.topBar}>
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>v1.0 · Android & iOS Ready</Text>
          </View>
          <TouchableOpacity onPress={toggleTheme} style={styles.themeBtn} activeOpacity={0.8}>
            <Text style={{ fontSize: 20 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
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
            <Text style={styles.appName}>AVTAR SINGH PG</Text>
            <Text style={styles.tagline}>Enterprise Multi-Role PG Management</Text>
          </View>

          {/* Feature Badges */}
          <View style={styles.featureGrid}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.featureItem}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* Live Persona Quick Test Bar */}
          <View style={styles.demoSection}>
            <View style={styles.demoHeader}>
              <Text style={styles.demoTitle}>⚡ 1-Tap Role Preview (Demo Mode)</Text>
              <Text style={styles.demoSubtitle}>Experience any portal instantly:</Text>
            </View>
            <View style={styles.demoPills}>
              <TouchableOpacity
                onPress={() => handleDemoSelect('student')}
                style={[styles.demoPill, { backgroundColor: '#1E3A8A' }]}
                activeOpacity={0.7}
              >
                <Text style={styles.demoPillText}>🎓 Student Tenant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDemoSelect('employee')}
                style={[styles.demoPill, { backgroundColor: '#581C87' }]}
                activeOpacity={0.7}
              >
                <Text style={styles.demoPillText}>💼 Employee Tenant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDemoSelect('warden')}
                style={[styles.demoPill, { backgroundColor: '#14532D' }]}
                activeOpacity={0.7}
              >
                <Text style={styles.demoPillText}>🛡️ Property Warden</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDemoSelect('owner')}
                style={[styles.demoPill, { backgroundColor: '#7C2D12' }]}
                activeOpacity={0.7}
              >
                <Text style={styles.demoPillText}>👑 Super Admin Owner</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Standard Auth Actions */}
          <View style={styles.actions}>
            <Button
              title="Sign In with Email"
              onPress={() => router.push('/(auth)/login')}
              style={styles.primaryBtn}
            />
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register/category')}
              style={styles.registerBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.registerBtnText}>New Tenant? Register Here</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Protected by Supabase Row-Level-Security & AES-256 Storage
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
  },
  badgePill: {
    backgroundColor: '#FFFFFF18',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FFFFFF25',
  },
  badgePillText: {
    color: '#E2E8F0',
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.xs,
  },
  themeBtn: {
    padding: Spacing.sm,
    backgroundColor: '#FFFFFF15',
    borderRadius: BorderRadius.full,
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
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  tagline: {
    color: '#94A3B8',
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
    backgroundColor: '#FFFFFF12',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FFFFFF15',
    gap: Spacing.xs,
  },
  featureIcon: { fontSize: 16 },
  featureLabel: {
    color: '#E2E8F0',
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
  },
  demoSection: {
    width: '100%',
    backgroundColor: '#FFFFFF0C',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: '#FFFFFF1E',
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  demoHeader: {
    marginBottom: Spacing.sm,
  },
  demoTitle: {
    color: '#F8FAFC',
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    marginBottom: 2,
  },
  demoSubtitle: {
    color: '#94A3B8',
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
    borderColor: '#FFFFFF40',
    alignItems: 'center',
    backgroundColor: '#FFFFFF0A',
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.base,
  },
  footer: {
    color: '#64748B',
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
