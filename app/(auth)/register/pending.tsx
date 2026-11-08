import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../../../src/constants/theme';
import { useThemeStore } from '../../../src/stores/themeStore';

// Pending approval screen shown after registration
export default function PendingScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <Text style={styles.icon}>⏳</Text>
        <Text style={[styles.title, { color: theme.text }]}>Registration Submitted!</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Your registration is pending warden review.
        </Text>

        <View style={[styles.timeline, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
          <TimelineStep icon="✅" label="Submitted" done />
          <TimelineStep icon="🔍" label="Warden Review" active />
          <TimelineStep icon="👑" label="Owner Approval" />
          <TimelineStep icon="🎉" label="Account Activated" />
        </View>

        <View style={[styles.infoBox, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '30' }]}>
          <Text style={[styles.infoText, { color: Colors.info }]}>
            📧 You will receive a notification when your registration is reviewed. This typically takes 24 hours.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={[styles.btn, { backgroundColor: Colors.primary }]}
        >
          <Text style={styles.btnText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const TimelineStep: React.FC<{ icon: string; label: string; done?: boolean; active?: boolean }> = ({
  icon, label, done, active,
}) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  return (
    <View style={styles.step}>
      <Text style={[styles.stepIcon, { opacity: done || active ? 1 : 0.4 }]}>{icon}</Text>
      <Text style={[styles.stepLabel, {
        color: done ? Colors.success : active ? Colors.primary : theme.textMuted,
        fontFamily: active ? Typography.fontFamily.semiBold : Typography.fontFamily.regular,
      }]}>{label}</Text>
      {active && <View style={[styles.activeDot, { backgroundColor: Colors.primary }]} />}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 72, marginBottom: Spacing.xl },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, textAlign: 'center', marginBottom: Spacing['3xl'], lineHeight: 22 },
  timeline: { width: '100%', borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.base, marginBottom: Spacing.xl, gap: Spacing.base },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepIcon: { fontSize: 20 },
  stepLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, flex: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  infoBox: { width: '100%', padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.xl },
  infoText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 20 },
  btn: { paddingVertical: Spacing.md, paddingHorizontal: Spacing['3xl'], borderRadius: BorderRadius.lg },
  btnText: { color: '#FFF', fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base },
});

