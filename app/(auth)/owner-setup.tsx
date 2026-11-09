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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';

type ScreenState = 'checking' | 'setup' | 'configured' | 'missing-migration' | 'unavailable';

export default function OwnerSetupScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  const [screen, setScreen] = useState<ScreenState>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const check = async () => {
      if (!isSupabaseConfigured) {
        if (active) setScreen('unavailable');
        return;
      }
      const { data, error: rpcError } = await supabase.rpc('owner_exists');
      if (!active) return;

      if (rpcError) {
        // PGRST202 = function not found → migration 004 not applied yet
        if (rpcError.code === 'PGRST202' || /could not find the function/i.test(rpcError.message)) {
          setScreen('missing-migration');
        } else {
          setError(rpcError.message);
          setScreen('setup');
        }
        return;
      }

      setScreen(data ? 'configured' : 'setup');
    };

    check();
    return () => {
      active = false;
    };
  }, []);

  const finishClaim = async (session: Session | null) => {
    if (session) {
      useAuthStore.getState().setSession(session);
    }
    await useAuthStore.getState().refreshProfile();

    // Already an owner (e.g. returning after email confirmation) → just enter.
    if (useAuthStore.getState().role === 'owner') {
      router.replace('/(owner)');
      return true;
    }

    const { error: claimError } = await supabase.rpc('claim_first_owner');
    if (claimError) {
      if (claimError.code === 'PGRST202' || /could not find the function/i.test(claimError.message)) {
        setError('Database update required: run supabase/migrations/004_owner_setup.sql in Supabase.');
      } else if (/already exists/i.test(claimError.message)) {
        setError('A Super Admin account already exists. Please sign in with that account.');
      } else {
        setError(claimError.message);
      }
      await supabase.auth.signOut();
      return false;
    }

    await useAuthStore.getState().refreshProfile();
    if (useAuthStore.getState().role !== 'owner') {
      setError('Setup did not complete. Please try again.');
      return false;
    }

    router.replace('/(owner)');
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    setInfo('');

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // 1) Existing account? Sign in (useful if email confirmation was required earlier).
      const signIn = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!signIn.error && signIn.data.session) {
        await finishClaim(signIn.data.session);
        return;
      }

      // 2) New account → create it.
      const signUp = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { role: 'tenant' } },
      });

      if (signUp.error) {
        setError(signUp.error.message);
        return;
      }

      if (signUp.data.session) {
        await finishClaim(signUp.data.session);
        return;
      }

      // 3) Email confirmation is enabled on this Supabase project.
      setInfo(
        'Account created. Check your email and confirm it, then come back to this screen and tap "Create Super Admin" again to finish setup.'
      );
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBody = () => {
    if (screen === 'checking') {
      return (
        <View style={styles.centerBox}>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Checking administrator status…
          </Text>
        </View>
      );
    }

    if (screen === 'unavailable') {
      return (
        <View style={styles.centerBox}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.centerTitle, { color: theme.text }]}>Live data not connected</Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then rebuild/restart.
          </Text>
        </View>
      );
    }

    if (screen === 'missing-migration') {
      return (
        <View style={styles.centerBox}>
          <Text style={{ fontSize: 40 }}>🗄️</Text>
          <Text style={[styles.centerTitle, { color: theme.text }]}>Database update required</Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Run supabase/migrations/004_owner_setup.sql in the Supabase SQL Editor, then reopen this screen.
          </Text>
        </View>
      );
    }

    if (screen === 'configured') {
      return (
        <View style={styles.centerBox}>
          <Text style={{ fontSize: 40 }}>👑</Text>
          <Text style={[styles.centerTitle, { color: theme.text }]}>Super Admin already configured</Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            A Super Admin account already exists. Sign in with that email and password — the app will open the owner
            portal automatically.
          </Text>
          <Button
            title="Go to Sign In"
            onPress={() => router.replace('/(auth)/login')}
            style={{ marginTop: Spacing.base }}
          />
        </View>
      );
    }

    // setup
    return (
      <>
        <View style={styles.header}>
          <Text style={styles.emoji}>👑</Text>
          <Text style={[styles.title, { color: theme.text }]}>Create Super Admin</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            One-time owner setup. This works only while no owner account exists.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Owner Email"
            placeholder="owner@avtarpg.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            required
          />
          <Input
            label="Password"
            placeholder="Minimum 6 characters"
            isPassword
            value={password}
            onChangeText={setPassword}
            required
          />
          <Input
            label="Confirm Password"
            placeholder="Re-enter password"
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

          {info ? (
            <View style={[styles.infoBox, { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '40' }]}>
              <Text style={[styles.infoText, { color: theme.text }]}>{info}</Text>
            </View>
          ) : null}

          <Button
            title="Create Super Admin"
            onPress={handleSubmit}
            isLoading={submitting}
            style={{ marginTop: Spacing.base }}
          />

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            style={[styles.linkBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
          >
            <Text style={[styles.linkText, { color: theme.textSecondary }]}>
              Already have an owner account?{' '}
              <Text style={{ color: Colors.primary, fontFamily: Typography.fontFamily.semiBold }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.noteBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>
            🔒 After the first owner is created, this setup is permanently locked. Wardens are added later from the
            owner portal, and tenants register from the Welcome screen.
          </Text>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
          </TouchableOpacity>
          {renderBody()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.xl },
  backBtn: { marginBottom: Spacing.xl },
  backText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.base,
  },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    textAlign: 'center',
    lineHeight: 22,
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
    marginBottom: Spacing.sm,
  },
  infoText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 20,
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
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'] },
  centerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  centerText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    textAlign: 'center',
    lineHeight: 22,
  },
});
