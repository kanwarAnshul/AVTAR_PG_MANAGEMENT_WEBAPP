import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function OwnerWardensScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-wardens-list'],
    queryFn: async () => {
      // 1. Get properties
      const { data: properties } = await supabase.from('properties').select('id, name');

      // 2. Get wardens with memberships
      const { data: memberships, error } = await supabase
        .from('property_memberships')
        .select(`
          *,
          warden:profiles(id, email, full_name, phone, is_active),
          property:properties(name)
        `)
        .eq('role', 'warden');

      if (error) throw error;
      return { memberships: memberships || [], properties: properties || [] };
    },
  });

  const addWardenMutation = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        throw new Error('Please fill all required fields');
      }
      setActionLoading(true);

      // Create warden auth user with role 'warden'
      const { data: authData, error: aError } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: {
            role: 'warden',
            full_name: fullName.trim(),
          },
        },
      });

      if (aError || !authData.user) throw aError || new Error('Failed to register warden user');

      const wardenId = authData.user.id;
      const defaultProperty = data?.properties?.[0]?.id;

      if (defaultProperty) {
        await supabase.from('property_memberships').insert({
          user_id: wardenId,
          property_id: defaultProperty,
          role: 'warden',
          assigned_by: user?.id,
          is_active: true,
        });
      }

      // Invite: in-app push if the warden has the app, otherwise SMS/mail link.
      const { sendNotification } = await import('../../src/services/messaging');
      await sendNotification({
        userId: wardenId,
        type: 'invite',
        title: '🛡️ Welcome to AVTAR PG Warden Portal',
        body: 'You have been assigned as a property warden. Open the app to start managing beds, approvals and dues.',
        data: { property_id: defaultProperty },
      });
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('id')
        .eq('user_id', wardenId);
      return { wardenId, hasPushToken: (tokens?.length ?? 0) > 0 };
    },
    onSuccess: async ({ hasPushToken }) => {
      setActionLoading(false);
      setAddModalVisible(false);
      const invitedEmail = email;
      const invitedPhone = phone;
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['owner-wardens-list'] });
      if (hasPushToken) {
        Alert.alert('Warden Added + Invited', 'Account created. A push notification has been sent to the installed app.');
        return;
      }
      Alert.alert(
        'Warden Added — Invite Needed',
        'Account created. The warden does not have the app installed yet.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Send Invite Link',
            onPress: async () => {
              try {
                const { sendWardenInvite } = await import('../../src/services/messaging');
                await sendWardenInvite(invitedEmail, invitedPhone);
              } catch {
                Alert.alert('Invite', 'Could not open the mailer/SMS app on this device.');
              }
            },
          },
        ]
      );
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Failed to add warden');
    },
  });

  if (isLoading) return <LoadingView message="Loading property wardens..." />;

  const { memberships = [] } = data || {};

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Warden Management"
        subtitle="Manage property managers & authorizations"
        right={
          <Button
            title="+ Add"
            size="sm"
            fullWidth={false}
            onPress={() => setAddModalVisible(true)}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {memberships.length === 0 ? (
          <EmptyState
            icon="🛡️"
            title="No Wardens Assigned"
            description="Add wardens to delegate day-to-day operations like KYC reviews, check-ins, and dues collection."
            action={{ label: 'Add First Warden', onPress: () => setAddModalVisible(true) }}
          />
        ) : (
          memberships.map((m: any) => (
            <Card key={m.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={{ fontSize: 20 }}>🛡️</Text>
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={[styles.name, { color: theme.text }]}>
                    {m.warden?.full_name || 'Assigned Warden'}
                  </Text>
                  <Text style={[styles.email, { color: theme.textSecondary }]}>
                    {m.warden?.email} {m.warden?.phone ? `· ${m.warden.phone}` : ''}
                  </Text>
                  <Text style={[styles.prop, { color: Colors.primary }]}>
                    📍 Assigned: {m.property?.name || 'Main Property'}
                  </Text>
                </View>
                <Badge
                  label={m.is_active ? 'Active' : 'Inactive'}
                  status={m.is_active ? 'approved' : 'rejected'}
                  size="sm"
                />
              </View>

              <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                <Text style={[styles.assignedDate, { color: theme.textMuted }]}>
                  Assigned on {formatDate(m.created_at)}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Add Warden Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Property Warden</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              The warden will be granted access to review tenants, manage beds, and log dues.
            </Text>

            <Input
              label="Full Name"
              placeholder="e.g. Ramesh Kumar"
              value={fullName}
              onChangeText={setFullName}
              required
            />
            <Input
              label="Email Address (Login ID)"
              placeholder="warden@avtarpg.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              required
            />
            <Input
              label="Temporary Password"
              placeholder="Minimum 8 characters"
              value={password}
              onChangeText={setPassword}
              isPassword
              required
            />
            <Input
              label="Phone Number"
              placeholder="10-digit mobile number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setAddModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Create Warden"
                variant="primary"
                onPress={() => addWardenMutation.mutate()}
                isLoading={actionLoading}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { marginBottom: Spacing.md, padding: Spacing.base },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  email: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  prop: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginTop: 4 },
  cardFooter: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.xs },
  assignedDate: { fontFamily: Typography.fontFamily.regular, fontSize: 10 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base, lineHeight: 18 },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
