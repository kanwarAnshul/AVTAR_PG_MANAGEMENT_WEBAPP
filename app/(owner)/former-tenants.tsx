import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

/**
 * Owner-only archive of every tenant whose checkout was approved.
 * Populated by decide_checkout() (migration 010) — name, address,
 * phone, family contact number and the feedback they left.
 */
export default function OwnerFormerTenantsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: former = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['former-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('former_tenants')
        .select('*')
        .order('archived_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) return <LoadingView message="Loading former tenants..." />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Former Tenants"
        subtitle={`${former.length} archived · feedback & contact details`}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />
        }
      >
        {former.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title="No Former Tenants Yet"
            description="When you approve a tenant checkout, their name, address, phone, family contact and feedback are archived here."
          />
        ) : (
          former.map((t: any) => {
            const open = expandedId === t.id;
            return (
              <Card key={t.id} style={styles.card}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpandedId(open ? null : t.id)}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: theme.text }]}>{t.full_name}</Text>
                      <Text style={[styles.sub, { color: theme.textSecondary }]}>
                        {t.phone || 'No phone'}
                        {t.room_no ? ` · Room ${t.room_no}` : ''}
                        {t.bed_label ? ` · Bed ${t.bed_label}` : ''}
                      </Text>
                      <Text style={[styles.date, { color: theme.textMuted }]}>
                        {t.check_in_date ? `In ${formatDate(t.check_in_date)}` : ''}
                        {t.check_out_date ? ` → Out ${formatDate(t.check_out_date)}` : ''}
                        {t.check_out_time ? ` at ${t.check_out_time}` : ''}
                      </Text>
                    </View>
                    <View style={styles.rightCol}>
                      <Badge label={t.category || 'tenant'} status="approved" size="sm" />
                      <Text style={[styles.chevron, { color: theme.primary }]}>{open ? '▾' : '›'}</Text>
                    </View>
                  </View>

                  <View style={[styles.feedbackBox, { backgroundColor: theme.surfaceAlt }]}>
                    <Text style={[styles.feedbackLabel, { color: theme.textSecondary }]}>
                      FEEDBACK LEFT FOR THE OWNER
                    </Text>
                    <Text style={[styles.feedback, { color: theme.text }]} numberOfLines={open ? undefined : 2}>
                      {t.feedback}
                    </Text>
                  </View>
                </TouchableOpacity>

                {open && (
                  <View style={[styles.detail, { borderTopColor: theme.border }]}>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Address</Text>
                      <Text style={[styles.value, { color: theme.text }]}>
                        {t.permanent_address || t.current_address || '—'}
                      </Text>
                    </View>
                    {t.current_address && t.permanent_address && t.current_address !== t.permanent_address && (
                      <View style={styles.rowItem}>
                        <Text style={[styles.label, { color: theme.textSecondary }]}>Current address</Text>
                        <Text style={[styles.value, { color: theme.text }]}>{t.current_address}</Text>
                      </View>
                    )}
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Phone</Text>
                      <Text style={[styles.value, { color: theme.text }]}>{t.phone || '—'}</Text>
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Emergency phone</Text>
                      <Text style={[styles.value, { color: theme.text }]}>{t.emergency_phone || '—'}</Text>
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Family contact</Text>
                      <Text style={[styles.value, { color: theme.text }]}>
                        {t.family_contact_name
                          ? `${t.family_contact_name}${t.family_relation ? ` (${t.family_relation})` : ''} · ${t.family_contact_phone || '—'}`
                          : '—'}
                      </Text>
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
                      <Text style={[styles.value, { color: theme.text }]}>{t.email || '—'}</Text>
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Archived</Text>
                      <Text style={[styles.value, { color: theme.text }]}>{formatDate(t.archived_at)}</Text>
                    </View>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  card: { marginBottom: Spacing.md, padding: Spacing.base },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  date: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  chevron: { fontSize: 16, fontFamily: Typography.fontFamily.medium },
  feedbackBox: { padding: Spacing.sm, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  feedbackLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  feedback: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  detail: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.xs },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  label: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  value: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.xs,
    textAlign: 'right',
    flex: 1,
    marginLeft: Spacing.md,
  },
});
