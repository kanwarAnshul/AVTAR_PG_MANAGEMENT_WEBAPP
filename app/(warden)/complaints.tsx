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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, getSignedUrl } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function WardenComplaintsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: tickets = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-complaints-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints')
        .select(`
          *,
          tenant:tenants(
            full_name, phone,
            tenancy:tenancies(room:rooms(room_no), bed:beds(label))
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const openTicketModal = async (ticket: any) => {
    setSelectedTicket(ticket);
    setPhotoUrl(null);
    if (ticket.photo_url) {
      try {
        const url = await getSignedUrl('complaint_photos', ticket.photo_url, 120);
        setPhotoUrl(url);
      } catch {}
    }
    setResolveModalVisible(true);
  };

  const resolveMutation = useMutation({
    mutationFn: async (status: 'in_progress' | 'resolved') => {
      if (!selectedTicket) return;
      setActionLoading(true);

      const { error } = await supabase
        .from('complaints')
        .update({
          status,
          resolution_note: resolutionNote.trim() || (status === 'resolved' ? 'Issue resolved by warden' : null),
          resolved_by: status === 'resolved' ? user?.id : null,
          resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        })
        .eq('id', selectedTicket.id);

      if (error) throw error;
    },
    onSuccess: () => {
      setActionLoading(false);
      setResolveModalVisible(false);
      setSelectedTicket(null);
      setResolutionNote('');
      queryClient.invalidateQueries({ queryKey: ['warden-complaints-list'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dashboard-stats'] });
      Alert.alert('Status Updated', 'Ticket status saved and tenant notified.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Failed to update ticket');
    },
  });

  if (isLoading) return <LoadingView message="Loading maintenance tickets..." />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Complaints & Maintenance"
        subtitle={`${tickets.filter((t: any) => t.status !== 'resolved').length} open tickets pending action`}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {tickets.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="All Issues Resolved"
            description="No pending maintenance or repair requests from tenants."
          />
        ) : (
          tickets.map((t: any) => {
            const tenancy = (t.tenant?.tenancy as any)?.[0];
            return (
              <Card key={t.id} style={styles.card}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => openTicketModal(t)}>
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1, marginRight: Spacing.sm }}>
                      <Text style={[styles.title, { color: theme.text }]}>{t.title}</Text>
                      <Text style={[styles.meta, { color: theme.textSecondary }]}>
                        {t.tenant?.full_name} · Room {tenancy?.room?.room_no || 'N/A'} · {t.category?.toUpperCase()}
                      </Text>
                      <Text style={[styles.date, { color: theme.textMuted }]}>
                        Raised {formatDate(t.created_at)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Badge label={t.status} status={t.status} size="sm" />
                      <Badge label={t.priority} status={t.priority} size="sm" />
                    </View>
                  </View>

                  {t.description && (
                    <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={2}>
                      {t.description}
                    </Text>
                  )}

                  <View style={[styles.footerRow, { borderTopColor: theme.border }]}>
                    <Text style={[styles.actionPrompt, { color: theme.primary }]}>
                      {t.status === 'resolved' ? 'View Details ✓' : 'Update Status & Resolve →'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Ticket Action Modal */}
      <Modal visible={resolveModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Ticket Resolution</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {selectedTicket?.title} · Tenant: {selectedTicket?.tenant?.full_name}
            </Text>

            {selectedTicket?.description ? (
              <View style={[styles.descBox, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.descLabel, { color: theme.textSecondary }]}>Description:</Text>
                <Text style={[styles.descFull, { color: theme.text }]}>{selectedTicket.description}</Text>
              </View>
            ) : null}

            {photoUrl && (
              <View style={styles.photoWrap}>
                <Text style={[styles.descLabel, { color: theme.textSecondary }]}>Attached Photo:</Text>
                <Image source={{ uri: photoUrl }} style={styles.photoImg} />
              </View>
            )}

            <Input
              label="Resolution Note for Tenant"
              placeholder="e.g. Electrician visited and repaired the switchboard"
              value={resolutionNote}
              onChangeText={setResolutionNote}
              multiline
              numberOfLines={2}
              style={{ minHeight: 60 }}
            />

            <View style={styles.modalBtns}>
              <Button
                title="Mark In-Progress"
                variant="secondary"
                onPress={() => resolveMutation.mutate('in_progress')}
                isLoading={actionLoading}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Mark Resolved ✓"
                variant="success"
                onPress={() => resolveMutation.mutate('resolved')}
                isLoading={actionLoading}
                style={{ flex: 1 }}
              />
            </View>

            <Button
              title="Close"
              variant="ghost"
              onPress={() => setResolveModalVisible(false)}
              style={{ marginTop: Spacing.xs }}
            />
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  date: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  desc: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: Spacing.xs, lineHeight: 18 },
  footerRow: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.xs },
  actionPrompt: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, textAlign: 'right' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base },
  descBox: { padding: Spacing.sm, borderRadius: BorderRadius.md, marginBottom: Spacing.base },
  descLabel: { fontFamily: Typography.fontFamily.medium, fontSize: 11, marginBottom: 2 },
  descFull: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 18 },
  photoWrap: { marginBottom: Spacing.base },
  photoImg: { width: '100%', height: 140, borderRadius: BorderRadius.md, marginTop: 4, resizeMode: 'cover' },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.xs },
});
