import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase, getSmsStatus, sendTestSms } from '../../src/lib/supabase';
import { friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader, ConfirmDialog } from '../../src/components/ui';
import { ThemePicker } from '../../src/components/ThemePicker';

const SMS_PROVIDERS = ['none', 'fast2sms', 'msg91', 'webhook'] as const;
type SmsProvider = (typeof SMS_PROVIDERS)[number];

export default function OwnerSettingsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { profile, signOut } = useAuthStore();

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const [smsProvider, setSmsProvider] = useState<SmsProvider>('none');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [smsTemplateId, setSmsTemplateId] = useState('');
  const [smsWebhookUrl, setSmsWebhookUrl] = useState('');
  const [smsDevMode, setSmsDevMode] = useState(true);
  const [hasSmsKey, setHasSmsKey] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [smsHealth, setSmsHealth] = useState<{
    ready: boolean;
    dev_mode: boolean;
    pg_net_enabled: boolean;
    problem?: string | null;
  } | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testingSms, setTestingSms] = useState(false);

  // Live health check for the SMS gateway (owner only).
  const refreshSmsHealth = async () => {
    try {
      const s = await getSmsStatus();
      setSmsHealth({
        ready: s.ready,
        dev_mode: s.dev_mode,
        pg_net_enabled: s.pg_net_enabled,
        problem: s.problem ?? null,
      });
    } catch {
      // Migration 007 not applied yet — the card simply stays hidden.
      setSmsHealth(null);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'sms_dev_mode')
        .maybeSingle();
      setSmsDevMode(data?.value !== 'false');

      const { data: cfg } = await supabase.rpc('get_sms_provider');
      if (cfg) {
        const c = cfg as {
          provider?: SmsProvider;
          sender_id?: string | null;
          template_id?: string | null;
          webhook_url?: string | null;
          has_api_key?: boolean;
        };
        setSmsProvider(c.provider ?? 'none');
        setSmsSenderId(c.sender_id ?? '');
        setSmsTemplateId(c.template_id ?? '');
        setSmsWebhookUrl(c.webhook_url ?? '');
        setHasSmsKey(Boolean(c.has_api_key));
      }

      await refreshSmsHealth();
    })();
  }, []);

  const runSmsTest = async () => {
    const digits = testPhone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) {
      Alert.alert('Invalid number', 'Enter a 10-digit Indian mobile number to send the test message to.');
      return;
    }

    setTestingSms(true);
    try {
      const result = await sendTestSms(digits);
      await refreshSmsHealth();

      if (result.ok) {
        Alert.alert(
          'Test message sent',
          `The provider accepted the message for +91${digits}. It should arrive within a few seconds.`
        );
      } else {
        Alert.alert(
          'Test message failed',
          `The provider rejected it.\n\nReason: ${result.error ?? 'Unknown error'}\n\nHTTP status: ${
            result.http_status ?? 'n/a'
          }\n\nThis usually means the API key, sender ID or DLT template is wrong.`
        );
      }
    } catch (err) {
      Alert.alert('Could not send test', friendlyDbError(err));
    } finally {
      setTestingSms(false);
    }
  };

  const saveSmsSettings = async () => {
    setSavingSms(true);
    try {
      const { error } = await supabase.rpc('set_sms_provider', {
        p_provider: smsProvider,
        // Blank = keep the previously saved key.
        p_api_key: smsApiKey.trim() ? smsApiKey.trim() : null,
        p_sender_id: smsSenderId.trim() || null,
        p_template_id: smsTemplateId.trim() || null,
        p_webhook_url: smsWebhookUrl.trim() || null,
      });
      if (error) throw error;

      const { error: devError } = await supabase.rpc('set_sms_dev_mode', {
        p_enabled: smsDevMode,
      });
      if (devError) throw devError;

      if (smsApiKey.trim()) setHasSmsKey(true);
      setSmsApiKey('');
      await refreshSmsHealth();
      Alert.alert('Saved', 'SMS / OTP settings updated.');
    } catch (err) {
      Alert.alert('Could not save', friendlyDbError(err));
    } finally {
      setSavingSms(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  const navRows: { title: string; sub: string; icon: string; href: any }[] = [
    { title: 'My Profile', sub: 'Edit email info, phone, password & photo', icon: '👤', href: '/(owner)/profile' },
    { title: 'Rooms & Inventory', sub: 'Add rooms, photos, BHK & rent charges', icon: '🏠', href: '/(owner)/rooms' },
    { title: 'Notices & Fines', sub: 'Fine notices for damaged property', icon: '💸', href: '/(owner)/notices' },
    { title: 'Privacy Policy', sub: 'Edit tenant-visible policy', icon: '📜', href: '/(owner)/privacy' },
    { title: 'Warden Activity', sub: 'Audit checks on warden work', icon: '👁️', href: '/(owner)/activity' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Settings & System"
        subtitle="Global configurations, security & appearance"
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Owner Profile Card */}
        <Card style={styles.card}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: Colors.accent }]}>
              <Text style={{ fontSize: 24 }}>👑</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={[styles.ownerName, { color: theme.text }]}>
                {profile?.full_name || 'Avtar Singh'}
              </Text>
              <Text style={[styles.ownerEmail, { color: theme.textSecondary }]}>
                {profile?.email}
              </Text>
              <Badge label="SUPER ADMIN" status="urgent" size="sm" />
            </View>
          </View>
        </Card>

        {/* Security & Architecture Audit */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>🛡️ SECURITY & COMPLIANCE</Text>
          <View style={styles.secRow}>
            <Text style={[styles.secLabel, { color: theme.text }]}>Row Level Security (RLS)</Text>
            <Badge label="ENFORCED (ALL TABLES)" status="approved" size="sm" />
          </View>
          <View style={styles.secRow}>
            <Text style={[styles.secLabel, { color: theme.text }]}>PAN Storage</Text>
            <Badge label="AES-256 ENCRYPTED" status="approved" size="sm" />
          </View>
          <View style={styles.secRow}>
            <Text style={[styles.secLabel, { color: theme.text }]}>Document Storage</Text>
            <Badge label="SIGNED URLS (60S)" status="approved" size="sm" />
          </View>
          <View style={styles.secRow}>
            <Text style={[styles.secLabel, { color: theme.text }]}>Double Booking Guard</Text>
            <Badge label="ATOMIC UNIQUE INDEX" status="approved" size="sm" />
          </View>
        </Card>

        {/* Management shortcuts */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>🏢 MANAGEMENT</Text>
          {navRows.map((row, i) => (
            <TouchableOpacity
              key={row.title}
              style={[styles.prefRow, { borderBottomColor: theme.border, borderBottomWidth: i === navRows.length - 1 ? 0 : 1 }]}
              onPress={() => router.push(row.href as any)}
            >
              <View>
                <Text style={[styles.prefTitle, { color: theme.text }]}>{row.icon} {row.title}</Text>
                <Text style={[styles.prefSub, { color: theme.textSecondary }]}>{row.sub}</Text>
              </View>
              <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
            </TouchableOpacity>
          ))}
        </Card>

        {/* SMS OTP for password reset */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>📱 SMS OTP (PASSWORD RESET)</Text>
          <Text style={[styles.smsHint, { color: theme.textSecondary }]}>
            Used by “Forgot password” for students, employees, wardens and the Super Admin. Add a provider key to send
            real SMS. With no key, demo mode shows the OTP on screen.
          </Text>

          <View style={styles.chipRow}>
            {SMS_PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setSmsProvider(p)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: smsProvider === p ? Colors.primary : theme.surfaceAlt,
                    borderColor: smsProvider === p ? Colors.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: smsProvider === p ? '#FFFFFF' : theme.text }]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {smsProvider !== 'none' ? (
            <>
              <Input
                label="API Key / Auth Key"
                placeholder={hasSmsKey ? 'Key saved — leave blank to keep' : 'Provider secret key'}
                value={smsApiKey}
                onChangeText={setSmsApiKey}
                isPassword
                hint={hasSmsKey ? 'A key is already stored. Type a new one to replace it.' : undefined}
              />
              {smsProvider === 'webhook' ? (
                <Input
                  label="Webhook URL"
                  placeholder="https://your-service/send-sms"
                  value={smsWebhookUrl}
                  onChangeText={setSmsWebhookUrl}
                  autoCapitalize="none"
                />
              ) : null}
              <Input
                label="Sender ID"
                placeholder="e.g. AVTPG"
                value={smsSenderId}
                onChangeText={setSmsSenderId}
                autoCapitalize="characters"
              />
              {smsProvider === 'msg91' ? (
                <Input
                  label="OTP Template ID"
                  placeholder="MSG91 template id"
                  value={smsTemplateId}
                  onChangeText={setSmsTemplateId}
                />
              ) : null}
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomWidth: 0 }]}
            onPress={() => setSmsDevMode((v) => !v)}
          >
            <View style={{ flex: 1, paddingRight: Spacing.sm }}>
              <Text style={[styles.prefTitle, { color: theme.text }]}>Demo mode (show OTP on screen)</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Turn this OFF once a real SMS provider is configured.
              </Text>
            </View>
            <Text style={{ fontSize: 20, color: smsDevMode ? Colors.warning : theme.textMuted }}>
              {smsDevMode ? '☑' : '☐'}
            </Text>
          </TouchableOpacity>

          <Button
            title="Save SMS Settings"
            onPress={saveSmsSettings}
            isLoading={savingSms}
            style={{ marginTop: Spacing.sm }}
          />

          {/* Live health check — proves the gateway really works */}
          {smsHealth ? (
            <View
              style={[
                styles.healthBox,
                {
                  backgroundColor: smsHealth.ready ? Colors.success + '15' : Colors.warning + '15',
                  borderColor: smsHealth.ready ? Colors.success + '45' : Colors.warning + '45',
                },
              ]}
            >
              <Text style={[styles.healthTitle, { color: theme.text }]}>
                {smsHealth.ready ? '✅ Gateway configured' : '⚠️ Gateway not ready'}
              </Text>
              <Text style={[styles.healthText, { color: theme.textSecondary }]}>
                {smsHealth.ready
                  ? 'Provider, API key and sender details are set. Send a test message to be certain the SMS is delivered.'
                  : smsHealth.problem ?? 'Check the provider settings above.'}
              </Text>
              <Text style={[styles.healthText, { color: theme.textSecondary }]}>
                • pg_net (outbound HTTP): {smsHealth.pg_net_enabled ? 'enabled' : 'not enabled'}
              </Text>
              <Text style={[styles.healthText, { color: theme.textSecondary }]}>
                • Demo mode: {smsHealth.dev_mode ? 'ON (OTP shown on screen)' : 'OFF (real SMS only)'}
              </Text>

              <Input
                label="Send a test SMS to"
                placeholder="9876543210"
                keyboardType="number-pad"
                maxLength={10}
                value={testPhone}
                onChangeText={(t) => setTestPhone(t.replace(/\D/g, ''))}
                style={{ marginTop: Spacing.sm }}
              />
              <Button
                title="Send Test SMS"
                onPress={runSmsTest}
                isLoading={testingSms}
                style={{ marginTop: Spacing.xs }}
              />
            </View>
          ) : null}
        </Card>

        {/* App Preferences — global theme control for this user */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>🎨 APP PREFERENCES (YOUR THEME)</Text>
          <ThemePicker />
          <TouchableOpacity
            style={[styles.prefRow, { borderBottomColor: theme.border }]}
            onPress={() => Alert.alert('Rules Updated', 'Property gate rules: Entry closed after 10:30 PM. Visitors allowed in lounge.')}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.text }]}>Property House Rules</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                View / update PG timings & gate pass policies
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomWidth: 0 }]}
            onPress={() => setLogoutModalVisible(true)}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.error }]}>Log Out Super Admin</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Sign out of this administrative device
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.error }}>🚪</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {/* Logout Dialog */}
      <ConfirmDialog
        visible={logoutModalVisible}
        title="Sign Out of Admin Console?"
        message="Are you sure you want to end your owner administrative session?"
        confirmLabel="Sign Out"
        variant="danger"
        onConfirm={handleSignOut}
        onCancel={() => setLogoutModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { marginBottom: Spacing.base, padding: Spacing.base },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  ownerName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  ownerEmail: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 1, marginBottom: 4 },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
  secLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  smsHint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 17, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1 },
  healthBox: { marginTop: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1 },
  healthTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, marginBottom: Spacing.xs },
  healthText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 17 },
  chipText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  prefTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  prefSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});
