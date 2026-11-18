import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { fetchTerms } from '../../src/services/messaging';
import { friendlyDbError } from '../../src/utils/helpers';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader, LoadingView } from '../../src/components/ui';

/**
 * Tenant login gate (migration 010).
 *
 * A tenant cannot enter the app until they scroll through the Terms &
 * Conditions, tick the checkbox and tap Accept. The acceptance is stored
 * on profiles.terms_accepted_at; the owner is asked again whenever the
 * owner edits the terms text. Optional — the owner can switch the gate
 * off from Settings > Terms & Conditions.
 */
export default function TermsAcceptScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user, refreshProfile, signOut } = useAuthStore();

  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const { data: terms, isLoading } = useQuery({
    queryKey: ['terms-conditions'],
    queryFn: fetchTerms,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Session expired. Please sign in again.');
      const { error } = await supabase
        .from('profiles')
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw new Error(friendlyDbError(error));
      await refreshProfile();
    },
    onSuccess: () => {
      router.replace('/');
    },
    onError: (err: any) => {
      Alert.alert('Could not accept', err?.message ?? 'Please try again.');
    },
  });

  const handleDecline = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  // Nothing published (or the gate was switched off) — no reason to block.
  // Show a plain Continue button instead of redirecting, so a flaky fetch
  // can never bounce the user between two screens.
  const noTerms = !isLoading && terms !== undefined && !terms.trim();

  if (isLoading) return <LoadingView message="Loading Terms & Conditions..." />;

  const canAccept = agreed && scrolledToEnd && !acceptMutation.isPending;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Terms & Conditions"
        subtitle="Read to the end to continue"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 48) {
            setScrolledToEnd(true);
          }
        }}
        scrollEventThrottle={16}
      >
        <View style={[styles.doc, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.docText, { color: theme.text }]}>
            {noTerms
              ? 'No Terms & Conditions have been published yet. You can continue into the app.'
              : terms}
          </Text>
        </View>
        {!scrolledToEnd && !noTerms && (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            ↓ Scroll to the end to enable the agreement box
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {noTerms ? (
          <Button title="Continue" onPress={() => router.replace('/')} />
        ) : (
          <>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setAgreed((v) => !v)}
              disabled={!scrolledToEnd}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: agreed ? theme.primary : theme.border,
                    backgroundColor: agreed ? theme.primary : 'transparent',
                    opacity: scrolledToEnd ? 1 : 0.5,
                  },
                ]}
              >
                {agreed && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, { color: theme.text }]}>
                I have read and agree to the Terms & Conditions
              </Text>
            </TouchableOpacity>

            <Button
              title="Accept & Continue"
              onPress={() => acceptMutation.mutate()}
              disabled={!canAccept}
              isLoading={acceptMutation.isPending}
            />
            <TouchableOpacity onPress={handleDecline} style={styles.declineBtn}>
              <Text style={[styles.declineText, { color: theme.textSecondary }]}>
                Decline & sign out
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.base, paddingBottom: Spacing.lg },
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
  hint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    padding: Spacing.base,
    paddingBottom: Spacing.lg,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
  },
  checkLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
  },
  declineBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  declineText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
  },
});
