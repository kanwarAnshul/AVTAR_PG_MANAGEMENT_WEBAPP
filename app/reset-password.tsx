import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { useThemeStore } from '../src/stores/themeStore';
import { supabase } from '../src/lib/supabase';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';

/**
 * Opened by the "reset password" email link (avtarpg://reset-password#...).
 * The root layout listens for that deep link, exchanges the tokens for a
 * session, and then routes here. If the link is missing, expired or already
 * used, the screen explains what to do instead of failing silently.
 */
export default function ResetPasswordScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
      setReady(true);
    })();
  }, []);

  const submit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      Alert.alert('Password updated', 'Your new password is active. You can sign in now.', [
        {
          text: 'Sign In',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/(auth)/login');
          },
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>Checking your link…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.emoji}>🔑</Text>
            <Text style={[styles.title, { color: theme.text }]}>Set a new password</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {hasSession
                ? 'Choose a new password for your AVTAR SINGH PG account.'
                : 'This reset link is invalid, expired or has already been used. Request a new one from the Forgot Password screen.'}
            </Text>
          </View>

          {hasSession ? (
            <View style={styles.form}>
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

              <Button title="Update Password" onPress={submit} isLoading={loading} style={{ marginTop: Spacing.base }} />
            </View>
          ) : (
            <Button
              title="Back to Forgot Password"
              onPress={() => router.replace('/(auth)/forgot-password')}
              style={{ marginTop: Spacing.base }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, padding: Spacing.xl },
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
});
