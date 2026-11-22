import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from '../../src/lib/supabase';
import { friendlyDbError } from '../../src/utils/helpers';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Password recovery is EMAIL ONLY. The owner enters the email address on the
 * account and Supabase sends a secure one-time recovery link. Opening that
 * link on this device signs the user in temporarily and routes them to the
 * reset-password screen where they choose a new password. No SMS provider,
 * phone number or OTP is involved in the mobile flow.
 */
export default function ForgotPasswordScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => Math.max(c - 1, 0)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendLink = async () => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError('Enter the email address linked to your account.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await sendPasswordResetEmail(clean, Linking.createURL('/reset-password'));
      if (!result.ok) {
        setError(result.error ?? 'Could not send the recovery email. Please try again.');
        return;
      }
      setSentTo(clean);
      setSent(true);
      setCooldown(45);
    } catch (err) {
      setError(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.emoji}>📧</Text>
            <Text style={[styles.title, { color: theme.text }]}>Forgot password?</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {sent
                ? 'Check your inbox for a secure recovery link.'
                : 'Enter the email address on your account. We will email you a secure one-time link to choose a new password.'}
            </Text>
          </View>

          {!sent ? (
            <View style={styles.form}>
              <Input
                label="Email Address"
                placeholder="your@email.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={sendLink}
                required
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                  <Text style={[styles.errorText, { color: theme.error }]}>⚠️ {error}</Text>
                </View>
              ) : null}

              <Button
                title="Send Recovery Link"
                onPress={sendLink}
                isLoading={loading}
                style={{ marginTop: Spacing.base }}
              />

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                style={[styles.linkBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <Text style={[styles.linkText, { color: theme.textSecondary }]}>
                  Remembered it?{' '}
                  <Text style={{ color: theme.primary, fontFamily: Typography.fontFamily.semiBold }}>
                    Sign in
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={[styles.successBox, { backgroundColor: Colors.success + '15', borderColor: Colors.success + '40' }]}>
                <Text style={[styles.successIcon]}>✅</Text>
                <Text style={[styles.successTitle, { color: theme.text }]}>Recovery email sent</Text>
                <Text style={[styles.successText, { color: theme.textSecondary }]}>
                  We sent a one-time recovery link to {sentTo}. Open it on this device — the app will open automatically and
                  take you to the new-password screen.
                </Text>
              </View>

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                  <Text style={[styles.errorText, { color: theme.error }]}>⚠️ {error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={sendLink}
                disabled={cooldown > 0 || loading}
                style={[styles.resendBtn, { opacity: cooldown > 0 || loading ? 0.5 : 1 }]}
              >
                <Text style={[styles.resendText, { color: cooldown > 0 ? theme.textMuted : Colors.primary }]}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                style={[styles.linkBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <Text style={[styles.linkText, { color: theme.textSecondary }]}>
                  Back to{' '}
                  <Text style={{ color: theme.primary, fontFamily: Typography.fontFamily.semiBold }}>
                    Sign in
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.noteBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[styles.noteText, { color: theme.textSecondary }]}>
              🔒 The recovery link expires shortly and can be used once. Password reset is email-only — no SMS, phone
              number or OTP is required. If you do not see the email, check your spam folder or ask the Super Admin to
              verify the address on your profile.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.xl },
  backBtn: { marginBottom: Spacing.xl },
  backText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  form: { marginBottom: Spacing.xl },
  errorBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },
  successBox: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  successIcon: { fontSize: 34, marginBottom: Spacing.sm },
  successTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.md,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  successText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  linkBtn: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
  },
  resendBtn: { alignItems: 'center', paddingVertical: Spacing.lg },
  resendText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
  },
  noteBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  noteText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },
});
