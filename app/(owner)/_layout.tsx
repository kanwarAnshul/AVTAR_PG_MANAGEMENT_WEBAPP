import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors, Typography } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useEffect } from 'react';

export default function OwnerLayout() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const { unreadCount, fetchNotifications, subscribeToNotifications } = useNotificationStore();

  useEffect(() => {
    if (user) {
      fetchNotifications(user.id);
      const unsub = subscribeToNotifications(user.id);
      return unsub;
    }
  }, [user?.id]);

  const TAB_ICONS: Record<string, string> = {
    index: '👑',
    wardens: '🛡️',
    approvals: '✅',
    reports: '📊',
    settings: '⚙️',
  };

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontFamily: Typography.fontFamily.medium,
          fontSize: 10,
        },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6 }}>
            {TAB_ICONS[route.name] ?? '•'}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="wardens" options={{ title: 'Wardens' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

