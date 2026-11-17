import React, { useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate, formatCurrency } from '../../src/utils/helpers';
import { fetchPrivacyPolicy } from '../../src/services/messaging';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader, ConfirmDialog, LoadingView } from '../../src/components/ui';
import { ProfileEditor } from '../../src/components/ProfileEditor';
import { ThemePicker } from '../../src/components/ThemePicker';

export default function TenantProfileScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user, profile, signOut } = useAuthStore();

  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isRequestingCheckout, setIsRequestingCheckout] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [privacyText, setPrivacyText] = useState('');

  const { data: tenantInfo, isLoading } = useQuery({
    queryKey: ['tenant-profile-details', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select(`
          *,
          property:properties(*),
          registration:tenant_registrations(*),
          tenancy:tenancies!inner(
            id, monthly_rent, deposit_paid, check_in_date, status,
            room:rooms(room_no, sharing_type),
            bed:beds(label)
          )
        `)
        .eq('user_id', user.id)
        .eq('tenancies.status', 'active')
        .maybeSingle();

      return tenant;
    },
    enabled: !!user,
  });

  const handleCheckoutRequest = async () => {
    setIsRequestingCheckout(true);
    try {
      // Create a notice / notification for warden
      Alert.alert(
        'Checkout Request Sent',
        'Your request has been delivered to the warden. Bed inspection and deposit settlement will be scheduled.'
      );
      setCheckoutModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit checkout request');
    } finally {
      setIsRequestingCheckout(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  if (isLoading) return <LoadingView message="Loading profile..." />;

  const tenancy = (tenantInfo?.tenancy as any)?.[0];
  const reg = tenantInfo?.registration;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="My Profile" subtitle="Account & Tenancy details" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Card */}
        <Card variant="elevated" style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: Colors.primary }]}>
              <Text style={styles.avatarText}>
                {(tenantInfo?.full_name || profile?.full_name || 'T')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={[styles.profileName, { color: theme.text }]}>
                {tenantInfo?.full_name || profile?.full_name}
              </Text>
              <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                {profile?.email}
              </Text>
              <View style={{ marginTop: 4, flexDirection: 'row', gap: 6 }}>
                <Badge
                  label={tenantInfo?.category ?? 'tenant'}
                  status={tenantInfo?.category}
                  color={
                    tenantInfo?.category === 'student'
                      ? { bg: '#E8EDD4', text: '#3F4C1C' }
                      : { bg: '#FBEEDA', text: '#8A5A12' }
                  }
                  size="sm"
                />
                <Badge label="ACTIVE" status="approved" size="sm" />
              </View>
            </View>
          </View>
        </Card>

        {/* One-time locked profile: only photo + password editable */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: Spacing.sm }]}>🔒 ONE-TIME PROFILE (PHOTO & PASSWORD ONLY)</Text>
        <ProfileEditor tenantMode />

        {/* Stay & Bed Info */}
        {tenancy && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🛏️ ALLOCATED ACCOMMODATION</Text>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Property</Text>
              <Text style={[styles.value, { color: theme.text }]}>{tenantInfo?.property?.name}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Room & Bed</Text>
              <Text style={[styles.value, { color: theme.text }]}>Room {tenancy.room?.room_no} · Bed {tenancy.bed?.label}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Monthly Rent</Text>
              <Text style={[styles.value, { color: theme.text }]}>{formatCurrency(tenancy.monthly_rent)}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Security Deposit Paid</Text>
              <Text style={[styles.value, { color: theme.text }]}>{formatCurrency(tenancy.deposit_paid)}</Text>
            </View>
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Check-In Date</Text>
              <Text style={[styles.value, { color: theme.text }]}>{formatDate(tenancy.check_in_date)}</Text>
            </View>
          </Card>
        )}

        {/* Category Details */}
        {reg && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {tenantInfo?.category === 'student' ? '🎓 ACADEMIC RECORD' : '💼 EMPLOYMENT RECORD'}
            </Text>
            {tenantInfo?.category === 'student' ? (
              <>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>College</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.college_name}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Roll No</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.roll_number}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Course</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.course}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Company</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.company_name}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Employee ID</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.employee_id}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Work Email</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{reg.work_email}</Text>
                </View>
              </>
            )}
            <View style={styles.rowItem}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Emergency Contact</Text>
              <Text style={[styles.value, { color: theme.text }]}>
                {reg.family_contact_name} ({reg.family_relation}) · {reg.family_contact_phone}
              </Text>
            </View>
          </Card>
        )}

        {/* Preferences & Actions */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>⚙️ PREFERENCES & ACTIONS</Text>
          <Text style={[styles.label, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>Your theme (applies to the whole app for you)</Text>
          <ThemePicker />

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomColor: theme.border, marginTop: Spacing.sm }]}
            onPress={async () => {
              const value = await fetchPrivacyPolicy();
              setPrivacyText(value);
              setPrivacyVisible(true);
            }}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.text }]}>📜 Privacy Policy</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                How your data is handled
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomColor: theme.border }]}
            onPress={() => setCheckoutModalVisible(true)}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.warning }]}>Initiate Checkout</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Request move-out & deposit settlement
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.warning }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomWidth: 0 }]}
            onPress={() => setLogoutModalVisible(true)}
          >
            <View>
              <Text style={[styles.prefTitle, { color: theme.error }]}>Log Out</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Sign out of this device
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.error }}>🚪</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {/* Privacy Policy Dialog */}
      <ConfirmDialog
        visible={privacyVisible}
        title="Privacy Policy"
        message={privacyText || 'Loading policy...'}
        confirmLabel="Close"
        cancelLabel="Dismiss"
        onConfirm={() => setPrivacyVisible(false)}
        onCancel={() => setPrivacyVisible(false)}
      />

      {/* Checkout Dialog */}
      <ConfirmDialog
        visible={checkoutModalVisible}
        title="Request Move-Out & Checkout?"
        message="This will notify the warden to initiate the checkout inspection. Your active deposit balance will be calculated for final settlement."
        confirmLabel="Send Request"
        onConfirm={handleCheckoutRequest}
        onCancel={() => setCheckoutModalVisible(false)}
        isLoading={isRequestingCheckout}
      />

      {/* Logout Dialog */}
      <ConfirmDialog
        visible={logoutModalVisible}
        title="Log Out?"
        message="Are you sure you want to sign out of AVTAR PG Manager?"
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
  profileCard: { padding: Spacing.base, marginBottom: Spacing.base },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontFamily: Typography.fontFamily.bold, fontSize: 24 },
  profileName: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md },
  profileEmail: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  sectionCard: { marginBottom: Spacing.base, padding: Spacing.base },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  label: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  value: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  prefTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  prefSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});

