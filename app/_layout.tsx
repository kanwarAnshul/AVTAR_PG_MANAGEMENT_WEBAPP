import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
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
import { sendDueReminders } from '../src/services/messaging';

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

  // Continue if fonts are loaded, or if font error occurred, or after 2s safety timeout
  if (!fontsLoaded && !fontError && !timedOut) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        <Text style={{ color: '#FFF', fontSize: 24, marginBottom: 8 }}>🏠</Text>
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>AVTAR SINGH PG</Text>
        <Text style={{ color: '#94A3B8', fontSize: 14, marginTop: 4 }}>Loading application...</Text>
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
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
