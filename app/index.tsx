import React, { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { LoadingView } from '../src/components/ui';
import {
  fetchTerms,
  fetchTermsGateEnabled,
  fetchTermsUpdatedAt,
} from '../src/services/messaging';

type GateState = 'idle' | 'checking' | 'allow' | 'required';

export default function Index() {
  const { session, profile, isInitialized, configError } = useAuthStore();
  const [safetyReady, setSafetyReady] = useState(false);
  const [gate, setGate] = useState<GateState>('idle');

  const sessionId = session?.user?.id ?? null;
  const profileId = profile?.id ?? null;
  const profileRole = profile?.role ?? null;
  const termsAcceptedAt = profile?.terms_accepted_at ?? null;

  useEffect(() => {
    const timer = setTimeout(() => setSafetyReady(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  // ── Terms & Conditions gate (tenants only) ──────────────────
  // A tenant must accept the Terms once, and again whenever the owner
  // updates the terms text. Wardens and the owner are never gated.
  useEffect(() => {
    let alive = true;

    const check = async () => {
      if (!sessionId || !profileId) return;
      if (profileRole !== 'tenant') {
        if (alive) setGate('allow');
        return;
      }
      if (alive) setGate('checking');
      try {
        const [enabled, terms, updatedAt] = await Promise.all([
          fetchTermsGateEnabled(),
          fetchTerms(),
          fetchTermsUpdatedAt(),
        ]);
        if (!alive) return;
        if (!enabled || !terms.trim()) {
          setGate('allow'); // gate switched off, or nothing published yet
          return;
        }
        const acceptedAt = termsAcceptedAt ? new Date(termsAcceptedAt).getTime() : 0;
        const changedAt = updatedAt ? new Date(updatedAt).getTime() : 0;
        setGate(acceptedAt >= changedAt ? 'allow' : 'required');
      } catch {
        if (alive) setGate('allow'); // never lock a user out on a blip
      }
    };

    check();
    return () => {
      alive = false;
    };
  }, [sessionId, profileId, profileRole, termsAcceptedAt]);

  if (!isInitialized && !safetyReady) {
    return <LoadingView message="Starting AVTAR PG..." />;
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;

  // Real auth only: no session means welcome; role from live profile.
  if (configError) return <Redirect href="/(auth)/welcome" />;

  // Give the profile (and therefore the role) a moment to arrive so a
  // tenant is never routed past the terms gate on a slow start.
  if (session && !profile && !safetyReady) {
    return <LoadingView message="Loading your account..." />;
  }

  if (gate === 'checking') {
    return <LoadingView message="Checking Terms & Conditions..." />;
  }
  if (gate === 'required') {
    return <Redirect href="/(auth)/terms-accept" />;
  }

  // Role-based redirect
  switch (profile?.role) {
    case 'owner':  return <Redirect href="/(owner)" />;
    case 'warden': return <Redirect href="/(warden)" />;
    default:       return <Redirect href="/(tenant)" />;
  }
}
