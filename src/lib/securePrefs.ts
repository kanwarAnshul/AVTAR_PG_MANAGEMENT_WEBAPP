import * as SecureStore from 'expo-secure-store';

/**
 * Small key/value facade for non-sensitive preferences.
 *
 * Native builds use the encrypted Keychain / Keystore implementation.
 * The web build resolves securePrefs.web.ts instead, where localStorage is
 * the correct browser equivalent (expo-secure-store has no web platform).
 */
export const securePrefs = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
