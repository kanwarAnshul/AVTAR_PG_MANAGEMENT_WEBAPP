import { create } from 'zustand';
import { Appearance } from 'react-native';
import { securePrefs } from '../lib/securePrefs';
import type { ThemePreference } from '../types';

type ColorScheme = 'dark' | 'light';

interface ThemeState {
  /** User-selected preference: 'system' follows the device, otherwise forced. */
  preference: ThemePreference;
  colorScheme: ColorScheme;
  isDark: boolean;
  /** Toggle cycles system → light → dark so device detection stays obvious. */
  toggleTheme: () => void;
  setTheme: (scheme: ColorScheme) => void;
  setPreference: (pref: ThemePreference) => void;
  loadSavedTheme: (userId?: string) => Promise<void>;
  /** Must be attached once at app entry so live device-theme changes propagate. */
  initSystemListener: () => void;
}

const baseKey = 'avtar_pg_theme';

const storedKey = (userId?: string) => (userId ? `${baseKey}:${userId}` : baseKey);

const resolveScheme = (pref: ThemePreference): ColorScheme => {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
};

let listenerAttached = false;

export const useThemeStore = create<ThemeState>((set, get) => ({
  // Start in sync with the device — never force dark on first launch.
  preference: 'system',
  colorScheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  isDark: Appearance.getColorScheme() === 'dark',

  toggleTheme: () => {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const current = get().preference;
    const next = order[(order.indexOf(current) + 1) % order.length];
    get().setPreference(next);
  },

  setTheme: (scheme) => {
    set({ preference: scheme, colorScheme: scheme, isDark: scheme === 'dark' });
  },

  setPreference: (pref) => {
    const scheme = resolveScheme(pref);
    set({ preference: pref, colorScheme: scheme, isDark: scheme === 'dark' });
    // Per-user persistence: the key is owned by the signed-in user so each
    // user controls their own app theme independently of other accounts.
    // The caller passes no userId here; save under both keys is avoided —
    // RootLayout re-saves on user change via loadSavedTheme. We persist
    // to the base key for signed-out (welcome) screens and let the
    // per-user key take over once a user is known.
    securePrefs.set(baseKey, pref).catch(() => {});
  },

  loadSavedTheme: async (userId?: string) => {
    try {
      const key = storedKey(userId);
      let saved: string | null = await securePrefs.get(key);
      if (!saved && userId) {
        saved = await securePrefs.get(baseKey);
      }
      const pref = (saved === 'light' || saved === 'dark' || saved === 'system'
        ? saved
        : 'system') as ThemePreference;
      const scheme = resolveScheme(pref);
      set({ preference: pref, colorScheme: scheme, isDark: scheme === 'dark' });
      if (userId) {
        securePrefs.set(key, pref).catch(() => {});
      }
    } catch {
      const scheme = resolveScheme(get().preference);
      set({ colorScheme: scheme, isDark: scheme === 'dark' });
    }
  },

  initSystemListener: () => {
    if (listenerAttached) return;
    listenerAttached = true;
    Appearance.addChangeListener(({ colorScheme }) => {
      // Only follow the device when the user chose "Follow device".
      if (get().preference === 'system') {
        const scheme: ColorScheme = colorScheme === 'dark' ? 'dark' : 'light';
        set({ colorScheme: scheme, isDark: scheme === 'dark' });
      }
    });
  },
}));
