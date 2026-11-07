import React, { useState } from 'react';
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
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore, DemoPersona } from '../../src/stores/authStore';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { loginAsDemo } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleDemoLogin = (persona: DemoPersona) => {
    loginAsDemo(persona);
    if (persona === 'owner') {
      router.replace('/(owner)');
    } else if (persona === 'warden') {
      router.replace('/(warden)');
    } else {
      router.replace('/(tenant)');
    }
  };

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setLoginError('');
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email.toLowerCase().trim(),
        password: data.password,
      });

      if (error) {
        setLoginError(error.message);
        return;
      }

      // Check if tenant registration is approved
      if (authData.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();

        if (profile?.role === 'tenant') {
          const { data: reg } = await supabase
            .from('tenant_registrations')
            .select('status')
            .eq('user_id', authData.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (reg && reg.status !== 'approved') {
            await supabase.auth.signOut();
            setLoginError(
              reg.status === 'pending'
                ? 'Your registration is pending approval. Please wait for warden review.'
                : reg.status === 'rejected'
                ? 'Your registration was rejected. Please check your email for details.'
                : 'Your registration needs resubmission. Please contact the warden.'
            );
            return;
          }
        }
      }
      // Navigation happens via auth state change → index.tsx
    } catch (err: any) {
      setLoginError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.emoji}>🔐</Text>
            <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Sign in to your AVTAR PG account
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Email Address"
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                  error={errors.email?.message}
                  required
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Password"
                  placeholder="Enter your password"
                  isPassword
                  value={value}
                  onChangeText={onChange}
                  error={errors.password?.message}
                  required
                />
              )}
            />

            {loginError ? (
              <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                <Text style={[styles.errorText, { color: Colors.error }]}>⚠️ {loginError}</Text>
              </View>
            ) : null}

            <Button
              title="Sign In"
              onPress={() => handleSubmit(onSubmit)()}
              isLoading={isLoading}
              style={{ marginTop: Spacing.base }}
            />

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
              <Text style={[styles.orText, { color: theme.textMuted }]}>OR DEMO LOGIN</Text>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            {/* Quick Demo Switcher */}
            <View style={styles.demoBox}>
              <Text style={[styles.demoTitle, { color: theme.textSecondary }]}>⚡ 1-Tap Demo Switcher:</Text>
              <View style={styles.demoBtnRow}>
                <TouchableOpacity
                  onPress={() => handleDemoLogin('student')}
                  style={[styles.demoTag, { backgroundColor: '#1E3A8A' }]}
                >
                  <Text style={styles.demoTagText}>🎓 Student</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDemoLogin('employee')}
                  style={[styles.demoTag, { backgroundColor: '#581C87' }]}
                >
                  <Text style={styles.demoTagText}>💼 Employee</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDemoLogin('warden')}
                  style={[styles.demoTag, { backgroundColor: '#14532D' }]}
                >
                  <Text style={styles.demoTagText}>🛡️ Warden</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDemoLogin('owner')}
                  style={[styles.demoTag, { backgroundColor: '#7C2D12' }]}
                >
                  <Text style={styles.demoTagText}>👑 Owner</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/register/category')}
              style={[styles.registerLink, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
            >
              <Text style={[styles.registerText, { color: theme.textSecondary }]}>
                New tenant?{' '}
                <Text style={{ color: Colors.primary, fontFamily: Typography.fontFamily.semiBold }}>
                  Register here
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={[styles.infoBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              🛡️ Your login is protected by Supabase Auth with RLS security. Only approved tenants can access the app.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  backBtn: { marginBottom: Spacing.xl },
  backText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.base,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    textAlign: 'center',
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.base,
    gap: Spacing.sm,
  },
  line: { flex: 1, height: 1 },
  orText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
  },
  demoBox: {
    marginBottom: Spacing.base,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  demoTitle: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.xs,
  },
  demoBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  demoTag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
  },
  demoTagText: {
    color: '#FFFFFF',
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.semiBold,
  },
  registerLink: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  registerText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
  },
  infoBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  infoText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },
});

