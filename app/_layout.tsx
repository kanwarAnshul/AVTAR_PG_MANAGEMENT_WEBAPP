import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/stores/authStore';
import { useThemeStore } from '../src/stores/themeStore';
import { Colors } from '../src/constants/theme';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { useServiceWorker } from '../src/hooks/useServiceWorker';
import { sendDueReminders } from '../src/services/messaging';
import { supabase } from '../src/lib/supabase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 min
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const { initialize, user } = useAuthStore();
  const { loadSavedTheme, isDark, initSystemListener } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  useServiceWorker();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [timedOut, setTimedOut] = React.useState(false);

  useEffect(() => {
    initSystemListener();
    loadSavedTheme();
    initialize();
    // Safety fallback: after 2 seconds, proceed with system fonts if custom fonts lag
    const timer = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reload per-user theme preference whenever the signed-in user changes.
    loadSavedTheme(user?.id);
  }, [user?.id, loadSavedTheme]);

  useEffect(() => {
    // Fire rent-due reminders (5-day lead) once per app foreground session.
    if (user) {
      sendDueReminders().catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    // Password-reset deep link (avtarpg://reset-password#access_token=...).
    // The recovery email opens the app; we exchange the tokens for a
    // session and route to the "set a new password" screen.
    const handleUrl = async (url: string) => {
      if (!url || !url.startsWith('avtarpg://reset-password')) return;

      const hashIndex = url.indexOf('#');
      const params = new URLSearchParams(hashIndex >= 0 ? url.slice(hashIndex + 1) : '');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) return;

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) return;

      router.replace('/reset-password');
    };

    // The app may have been launched straight from the link.
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleUrl(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  // Continue if fonts are loaded, or if font error occurred, or after 2s safety timeout
  if (!fontsLoaded && !fontError && !timedOut) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10130D' }}>
        <Text style={{ color: '#FFF', fontSize: 24, marginBottom: 8 }}>🏠</Text>
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>AVTAR SINGH PG</Text>
        <Text style={{ color: '#A8B396', fontSize: 14, marginTop: 4 }}>Loading application...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <OfflineBanner />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tenant)" />
            <Stack.Screen name="(warden)" />
            <Stack.Screen name="(owner)" />
            <Stack.Screen name="reset-password" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
