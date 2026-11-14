import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestPasswordOtp, resetPasswordWithOtp } from '../../src/lib/supabase';
import { friendlyDbError } from '../../src/utils/helpers';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';

type Step = 'identify' | 'reset';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^[6-9]\d{9}$/;

export default function ForgotPasswordScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [resolvedIdentifier, setResolvedIdentifier] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => Math.max(c - 1, 0)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const cleanIdentifier = (raw: string) => {
    const trimmed = raw.trim();
    if (EMAIL_RE.test(trimmed)) return trimmed.toLowerCase();
    const digits = trimmed.replace(/\D/g, '').slice(-10);
    if (PHONE_RE.test(digits)) return digits;
    return null;
  };

  const sendOtp = async () => {
    const value = cleanIdentifier(identifier);
    if (!value) {
      setError('Enter the email address or 10-digit mobile number linked to your account.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    try {
      const result = await requestPasswordOtp(value);
      if (!result.ok) {
        setError(result.error ?? 'Could not send the OTP. Please try again.');
        return;
      }

      setResolvedIdentifier(value);
      setMaskedPhone(result.phone ?? '');
      setDevOtp(result.delivery === 'demo' ? result.dev_otp ?? null : null);
      setInfo(result.message ?? 'OTP sent.');
      setStep('reset');
      setCooldown(45);
    } catch (err) {
      setError(friendlyDbError(err));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit OTP from your SMS.');
      return;
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await resetPasswordWithOtp(resolvedIdentifier, otp.trim(), password);
      if (!result.ok) {
        setError(result.error ?? 'Could not reset the password.');
        return;
      }

      Alert.alert('Password updated', result.message ?? 'You can now sign in with your new password.', [
        { text: 'Sign In', onPress: () => router.replace('/(auth)/login') },
      ]);
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
          <TouchableOpacity
            onPress={() => (step === 'reset' ? setStep('identify') : router.back())}
            style={styles.backBtn}
          >
            <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.emoji}>🔑</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              {step === 'identify' ? 'Forgot password?' : 'Enter OTP'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {step === 'identify'
                ? 'Works for students, employees, wardens and the Super Admin. We will send a 6-digit OTP to the mobile number on your account.'
                : `Enter the OTP sent to ${maskedPhone || 'your mobile number'} and choose a new password.`}
            </Text>
          </View>

          {step === 'identify' ? (
            <View style={styles.form}>
              <Input
                label="Email or Mobile Number"
                placeholder="your@email.com or 9876543210"
                autoCapitalize="none"
                keyboardType="email-address"
                value={identifier}
                onChangeText={setIdentifier}
                required
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                  <Text style={[styles.errorText, { color: Colors.error }]}>⚠️ {error}</Text>
                </View>
              ) : null}

              <Button
                title="Send OTP"
                onPress={sendOtp}
                isLoading={loading}
                style={{ marginTop: Spacing.base }}
              />

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                style={[styles.linkBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <Text style={[styles.linkText, { color: theme.textSecondary }]}>
                  Remembered it?{' '}
                  <Text style={{ color: Colors.primary, fontFamily: Typography.fontFamily.semiBold }}>
                    Sign in
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              {info ? (
                <View style={[styles.infoBox, { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '40' }]}>
                  <Text style={[styles.infoText, { color: theme.text }]}>{info}</Text>
                </View>
              ) : null}

              {devOtp ? (
                <View style={[styles.demoBox, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '55' }]}>
                  <Text style={[styles.demoTitle, { color: theme.text }]}>
                    ⚠️ Demo mode — SMS provider not configured
                  </Text>
                  <Text style={[styles.demoOtp, { color: theme.text }]}>{devOtp}</Text>
                  <Text style={[styles.demoHint, { color: theme.textSecondary }]}>
                    Use this OTP to continue. Ask the Super Admin to connect an SMS provider to receive it on the phone.
                  </Text>
                </View>
              ) : null}

              <Input
                label="6-digit OTP"
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
                required
              />
              <Input
                label="New Password"
                placeholder="Minimum 8 characters"
                isPassword
                value={password}
                onChangeText={setPassword}
                required
              />
              <Input
                label="Confirm New Password"
                placeholder="Re-enter new password"
                isPassword
                value={confirm}
                onChangeText={setConfirm}
                required
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                  <Text style={[styles.errorText, { color: Colors.error }]}>⚠️ {error}</Text>
                </View>
              ) : null}

              <Button
                title="Reset Password"
                onPress={resetPassword}
                isLoading={loading}
                style={{ marginTop: Spacing.base }}
              />

              <TouchableOpacity
                onPress={sendOtp}
                disabled={cooldown > 0 || loading}
                style={styles.resendBtn}
              >
                <Text style={[styles.resendText, { color: cooldown > 0 ? theme.textMuted : Colors.primary }]}>
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.noteBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[styles.noteText, { color: theme.textSecondary }]}>
              🔒 OTPs expire after 10 minutes and can be used once. The OTP is sent to the mobile number saved on your
              profile. If no number is saved, ask the Super Admin to add it in your profile first.
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
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },
  infoBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.base,
  },
  infoText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },
  demoBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.base,
    alignItems: 'center',
  },
  demoTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  demoOtp: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 34,
    letterSpacing: 8,
    marginVertical: Spacing.xs,
  },
  demoHint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    lineHeight: 17,
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
  resendBtn: { alignItems: 'center', paddingVertical: Spacing.md },
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
