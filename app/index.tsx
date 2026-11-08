import React, { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { LoadingView } from '../src/components/ui';

export default function Index() {
  const { session, profile, isInitialized, configError } = useAuthStore();
  const [safetyReady, setSafetyReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSafetyReady(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!isInitialized && !safetyReady) {
    return <LoadingView message="Starting AVTAR PG..." />;
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;

  // Real auth only: no session means welcome; role from live profile.
  if (configError) return <Redirect href="/(auth)/welcome" />;

  // Role-based redirect
  switch (profile?.role) {
    case 'owner':  return <Redirect href="/(owner)" />;
    case 'warden': return <Redirect href="/(warden)" />;
    default:       return <Redirect href="/(tenant)" />;
  }
}

