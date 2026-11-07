import { create } from 'zustand';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type ColorScheme = 'dark' | 'light';

interface ThemeState {
  colorScheme: ColorScheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (scheme: ColorScheme) => void;
  loadSavedTheme: () => Promise<void>;
}

const THEME_KEY = 'avtar_pg_theme';

export const useThemeStore = create<ThemeState>((set) => ({
  colorScheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  isDark: Appearance.getColorScheme() === 'dark',

  toggleTheme: () => {
    set((state) => {
      const newScheme: ColorScheme = state.colorScheme === 'dark' ? 'light' : 'dark';
      SecureStore.setItemAsync(THEME_KEY, newScheme).catch(() => {});
      return { colorScheme: newScheme, isDark: newScheme === 'dark' };
    });
  },

  setTheme: (scheme: ColorScheme) => {
    SecureStore.setItemAsync(THEME_KEY, scheme).catch(() => {});
    set({ colorScheme: scheme, isDark: scheme === 'dark' });
  },

  loadSavedTheme: async () => {
    try {
      const saved = await SecureStore.getItemAsync(THEME_KEY);
      if (saved === 'dark' || saved === 'light') {
        set({ colorScheme: saved, isDark: saved === 'dark' });
      }
    } catch {}
  },
}));

