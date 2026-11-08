import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors, Typography } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useEffect } from 'react';

export default function WardenLayout() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const TAB_ICONS: Record<string, string> = {
    index: '🏠',
    approvals: '✅',
    beds: '🛏️',
    dues: '💰',
    complaints: '🛠️',
    requests: '📋',
    presence: '👥',
    notices: '📢',
    profile: '👤',
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
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Tabs.Screen name="beds" options={{ title: 'Beds' }} />
      <Tabs.Screen name="dues" options={{ title: 'Dues' }} />
      <Tabs.Screen name="complaints" options={{ title: 'Complaints' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
      <Tabs.Screen name="presence" options={{ title: 'Presence' }} />
      <Tabs.Screen name="notices" options={{ title: 'Notices' }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
    </Tabs>
  );
}
