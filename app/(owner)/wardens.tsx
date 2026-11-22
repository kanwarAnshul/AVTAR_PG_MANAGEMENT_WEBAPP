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
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, createIsolatedClient } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate, friendlyDbError } from '../../src/utils/helpers';
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
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-wardens-list'],
    queryFn: async () => {
      // Properties are queried independently from memberships. An empty or
      // failed memberships query must never be reported as "no property".
      const { data: properties, error: propertyError } = await supabase
        .from('properties')
        .select('id, name')
        .order('created_at', { ascending: true });
      if (propertyError) throw new Error(friendlyDbError(propertyError));

      // property_memberships has two FKs to profiles (user_id, assigned_by),
      // so the FK hint is REQUIRED — without it PostgREST returns an
      // ambiguous-relationship error and the whole screen fails to load.
      const { data: memberships, error: memberError } = await supabase
        .from('property_memberships')
        .select(`
          *,
          warden:profiles!property_memberships_user_id_fkey(id, email, full_name, phone, is_active),
          property:properties!property_memberships_property_id_fkey(name)
        `)
        .eq('role', 'warden')
        .order('created_at', { ascending: false });

      return {
        memberships: memberError ? [] : memberships || [],
        properties: properties || [],
        memberError: memberError ? friendlyDbError(memberError) : null,
      };
    },
  });

  const properties = data?.properties ?? [];
  // Default to the first property without calling setState in an effect.
  const effectivePropertyId = selectedPropertyId ?? properties[0]?.id ?? null;

  const addWardenMutation = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        throw new Error('Please fill all required fields');
      }

      // Check live properties at submit time — a stale query cache or a
      // failed memberships join must not block warden creation.
      const { data: liveProperties, error: liveError } = await supabase
        .from('properties')
        .select('id, name')
        .order('created_at', { ascending: true });
      if (liveError) throw new Error(friendlyDbError(liveError));
      const defaultProperty = effectivePropertyId || liveProperties?.[0]?.id || null;
      if (!defaultProperty) {
        const err: any = new Error('You need at least one property before adding a warden.');
        err.noProperty = true;
        throw err;
      }
      setActionLoading(true);

      // Create the auth account on an ISOLATED client: signUp() on the shared
      // client would swap the owner's session for the new warden's session.
      // Migration 004 always creates the profile as 'tenant', so the role is
      // promoted afterwards by the owner-only RPC (migration 005).
      const isolated = createIsolatedClient();
      const { data: authData, error: aError } = await isolated.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (aError) throw new Error(friendlyDbError(aError));
      const wardenId = authData.user?.id;
      if (!wardenId) throw new Error('Failed to register warden user');

      const { error: promoteError } = await supabase.rpc('promote_to_warden', {
        target_user_id: wardenId,
        warden_name: fullName.trim(),
        warden_phone: phone.trim() || null,
      });
      if (promoteError) throw new Error(friendlyDbError(promoteError));

      if (defaultProperty) {
        const { error: memberError } = await supabase.from('property_memberships').insert({
          user_id: wardenId,
          property_id: defaultProperty,
          role: 'warden',
          assigned_by: user?.id,
          is_active: true,
        });
        if (memberError) throw new Error(friendlyDbError(memberError));
      }

      // Invite: in-app push if the warden has the app, otherwise an email
      // invite. Password recovery is email-only — no SMS provider is used.
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
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['owner-wardens-list'] });
      if (hasPushToken) {
        Alert.alert(
          'Warden Added + Invited',
          'Account created and promoted to warden. A push notification has been sent to the installed app.\n\nThe warden signs in with the email and temporary password you entered.'
        );
        return;
      }
      Alert.alert(
        'Warden Added — Send Invite',
        'Account created and promoted to warden. Email them the app link so they can sign in with the credentials you set.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Email Invite',
            onPress: async () => {
              try {
                const { sendWardenInvite } = await import('../../src/services/messaging');
                await sendWardenInvite(invitedEmail);
              } catch {
                Alert.alert('Invite', 'Could not open the mail app on this device. You can share the app link manually.');
              }
            },
          },
        ]
      );
    },
    onError: (err: any) => {
      setActionLoading(false);
      if (err.noProperty) {
        Alert.alert('Create a Property First', err.message, [
          { text: 'Later', style: 'cancel' },
          { text: 'Create Property', onPress: () => router.push('/(owner)/rooms') },
        ]);
        return;
      }
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
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {memberships.length === 0 ? (
          <EmptyState
            icon="🛡️"
            title="No Wardens Assigned"
            description={properties.length
              ? 'Add wardens to delegate day-to-day operations like KYC reviews, check-ins, and dues collection.'
              : 'Create a property first, then add wardens to manage it.'}
            action={{
              label: properties.length ? 'Add First Warden' : 'Create Property',
              onPress: () => (properties.length ? setAddModalVisible(true) : router.push('/(owner)/rooms')),
            }}
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
                  <Text style={[styles.prop, { color: theme.primary }]}>
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
              label="Phone Number (optional)"
              placeholder="Contact number for records"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={[styles.fieldLabel, { color: theme.text }]}>Assign to Property *</Text>
            {properties.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propertyRow}>
                {properties.map((p: any) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelectedPropertyId(p.id)}
                    style={[
                      styles.propertyChip,
                      {
                        borderColor: effectivePropertyId === p.id ? theme.primary : theme.border,
                        backgroundColor: effectivePropertyId === p.id ? theme.primary : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.propertyChipText,
                        { color: effectivePropertyId === p.id ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      📍 {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <TouchableOpacity onPress={() => router.push('/(owner)/rooms')}>
                <Text style={[styles.linkText, { color: theme.primary }]}>
                  No property yet — tap here to create one
                </Text>
              </TouchableOpacity>
            )}

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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8EDD4', justifyContent: 'center', alignItems: 'center' },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  email: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  prop: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginTop: 4 },
  cardFooter: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.xs },
  assignedDate: { fontFamily: Typography.fontFamily.regular, fontSize: 10 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base, lineHeight: 18 },
  fieldLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  propertyRow: { flexGrow: 0, marginBottom: Spacing.xs },
  propertyChip: { borderWidth: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginRight: Spacing.sm },
  propertyChipText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  linkText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, paddingVertical: Spacing.sm },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
