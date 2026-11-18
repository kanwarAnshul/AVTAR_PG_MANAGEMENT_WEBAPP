import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { useThemeStore } from '../src/stores/themeStore';
import { fetchPrivacyPolicy, fetchTerms } from '../src/services/messaging';
import { ScreenHeader, EmptyState, LoadingView } from '../src/components/ui';

/**
 * Read-only viewer for the two owner-authored documents.
 *   /policy?type=privacy  — Privacy Policy
 *   /policy?type=terms    — Terms & Conditions
 * Reachable from every role (tenant, warden, owner).
 */
export default function PolicyScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { type } = useLocalSearchParams<{ type?: string }>();

  const isTerms = type === 'terms';

  const { data, isLoading } = useQuery({
    queryKey: ['policy-view', isTerms ? 'terms' : 'privacy'],
    queryFn: () => (isTerms ? fetchTerms() : fetchPrivacyPolicy()),
  });

  const title = isTerms ? 'Terms & Conditions' : 'Privacy Policy';
  const subtitle = isTerms
    ? 'Accepted by tenants at login'
    : 'How your data is handled';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        left={
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.textSecondary }]}>←</Text>
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <LoadingView message={`Loading ${title.toLowerCase()}...`} />
      ) : !data?.trim() ? (
        <EmptyState
          icon="📄"
          title={`No ${title} Published`}
          description="The PG owner has not published this document yet."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View
            style={[
              styles.doc,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.docText, { color: theme.text }]}>{data}</Text>
          </View>
          <Text style={[styles.updated, { color: theme.textMuted }]}>
            Published by AVTAR SINGH PG management
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  backBtn: { padding: Spacing.xs, marginLeft: -Spacing.xs },
  backText: { fontSize: 22, fontFamily: Typography.fontFamily.medium },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  doc: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  docText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    lineHeight: 24,
  },
  updated: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
