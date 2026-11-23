import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Registers the PWA offline shell in the browser only. */
export function useServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Offline support is optional — never block the app if registration fails.
    });
  }, []);
}
