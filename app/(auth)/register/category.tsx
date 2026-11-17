import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../src/constants/theme';
import { useThemeStore } from '../../../src/stores/themeStore';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  {
    value: 'student',
    icon: '🎓',
    title: 'Student',
    subtitle: 'College / School Student',
    // Fill colour (used at low alpha for borders/backgrounds); the
    // arrow glyph below uses the theme-aware text variant instead.
    color: Colors.info,
    description: 'College name, Roll no., Address proof, Family contact',
  },
  {
    value: 'employee',
    icon: '💼',
    title: 'Working Professional',
    subtitle: 'Employed / Self-employed',
    color: Colors.primary,
    description: 'Company, Employee ID, Aadhaar, PAN — secure KYC',
  },
];

export default function CategoryScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Register as Tenant</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Select your category to get started
          </Text>
        </View>

        {/* Category Cards */}
        <View style={styles.cards}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: `/(auth)/register/${cat.value}` as any,
                })
              }
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: cat.color + '30',
                  borderWidth: 2,
                  ...Shadows.md,
                },
              ]}
            >
              <View style={[styles.iconCircle, { backgroundColor: cat.color + '20' }]}>
                <Text style={styles.icon}>{cat.icon}</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{cat.title}</Text>
                <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                  {cat.subtitle}
                </Text>
                <Text style={[styles.cardDesc, { color: theme.textMuted }]}>
                  {cat.description}
                </Text>
              </View>
              <View style={[styles.arrow, { backgroundColor: cat.color + '20' }]}>
                <Text style={{ color: cat.value === 'student' ? theme.info : theme.primary, fontSize: 18 }}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer Note */}
        <View style={[styles.note, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>
            📋 After registration, your documents will be reviewed by the warden and owner before your account is activated.
          </Text>
        </View>

        {/* Already registered */}
        <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.loginLink}>
          <Text style={[styles.loginText, { color: theme.textSecondary }]}>
            Already registered?{' '}
            <Text style={{ color: theme.primary, fontFamily: Typography.fontFamily.semiBold }}>
              Login here
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.xl },
  backBtn: { marginBottom: Spacing.xl },
  backText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base },
  header: { marginBottom: Spacing['3xl'] },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], marginBottom: Spacing.sm },
  subtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, lineHeight: 22 },
  cards: { gap: Spacing.base, marginBottom: Spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 30 },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, marginBottom: 2 },
  cardSubtitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginBottom: 4 },
  cardDesc: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 16 },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.base,
  },
  noteText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 20 },
  loginLink: { alignItems: 'center', marginTop: Spacing.sm },
  loginText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base },
});

