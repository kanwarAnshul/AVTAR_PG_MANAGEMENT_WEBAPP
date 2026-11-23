import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// expo-notifications is native-only (Android/iOS). The PWA relies on the
// in-app notices list, so none of these calls run on web.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function registerForPushNotificationsAsync(userId: string): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  let token: string | undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('avtar_pg_notifications', {
      name: 'AVTAR PG Notifications',
      importance: 7, // AndroidImportance.MAX
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8FA34E',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return undefined;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

      // Save token in Supabase
      if (token && userId) {
        await supabase.from('push_tokens').upsert(
          {
            user_id: userId,
            token,
            platform: Platform.OS,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id, token' }
        );
      }
    } catch (e) {
      console.log('Error registering push token:', e);
    }
  }

  return token;
}

export function usePushNotifications(userId?: string) {
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    registerForPushNotificationsAsync(userId);

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification clicked:', response);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [userId]);
}

