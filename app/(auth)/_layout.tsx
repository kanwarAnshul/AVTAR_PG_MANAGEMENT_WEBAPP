import { Stack } from 'expo-router';
import { useThemeStore } from '../../src/stores/themeStore';
import { Colors } from '../../src/constants/theme';

export default function AuthLayout() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'slide_from_right',
      }}
    />
  );
}

