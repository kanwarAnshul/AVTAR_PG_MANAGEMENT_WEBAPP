/**
 * Web implementation of the preference facade.
 * expo-secure-store is unavailable on web, so browser localStorage is used
 * for the only value kept here (the per-user theme preference).
 */
const memory = new Map<string, string>();

const storage = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Storage can be blocked in private browsing.
  }
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
})();

export const securePrefs = {
  get: async (key: string): Promise<string | null> => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string): Promise<void> => {
    try {
      storage.setItem(key, value);
    } catch {
      // Ignore storage quota / privacy errors.
    }
  },
  remove: async (key: string): Promise<void> => {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  },
};
