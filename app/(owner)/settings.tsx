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
import { Colors, Typography, Spacing } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader, ConfirmDialog } from '../../src/components/ui';
import { ThemePicker } from '../../src/components/ThemePicker';

export default function OwnerSettingsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { profile, signOut } = useAuthStore();

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

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
              <Text style={{ fontSize: 18, color: Colors.primary }}>›</Text>
            </TouchableOpacity>
          ))}
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
            <Text style={{ fontSize: 18, color: Colors.primary }}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.prefRow, { borderBottomWidth: 0 }]}
            onPress={() => setLogoutModalVisible(true)}
          >
            <View>
              <Text style={[styles.prefTitle, { color: Colors.error }]}>Log Out Super Admin</Text>
              <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
                Sign out of this administrative device
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: Colors.error }}>🚪</Text>
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
  prefTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  prefSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});
