import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? Constants.expoConfig?.extra?.supabaseUrl;
// Auto-sanitize URL: strip accidental /rest/v1 or trailing slashes
const configuredUrl = rawUrl ? rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : '';
const configuredAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? Constants.expoConfig?.extra?.supabaseAnonKey)?.trim();

export const isSupabaseConfigured = Boolean(
  configuredUrl &&
  configuredUrl !== 'YOUR_SUPABASE_URL' &&
  configuredUrl.startsWith('http') &&
  configuredAnonKey &&
  configuredAnonKey !== 'YOUR_SUPABASE_ANON_KEY'
);

export const SUPABASE_CONFIG_ERROR =
  'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (and EAS secrets for builds), then restart.';

if (!isSupabaseConfigured) {
  console.warn('[supabase] NOT CONFIGURED — live data unavailable. Fix .env to enable the app.');
}

const assertConfigured = () => {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_CONFIG_ERROR);
};

// Create the client only when configured; otherwise use a minimal shape so
// the app can still launch and show the config error (no dummy data).
export const supabase = createClient(
  isSupabaseConfigured ? (configuredUrl as string) : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? (configuredAnonKey as string) : 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
    global: {
      headers: {
        'X-App-Version': '1.0.0',
        'X-Platform': 'mobile',
      },
    },
  }
);

// Storage helpers (live uploads only — no simulated data)
export const getSignedUrl = async (bucket: string, path: string, expiresIn = 60) => {
  assertConfigured();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
};

export const uploadFile = async (
  bucket: string,
  path: string,
  file: { uri: string; type: string; name: string }
) => {
  assertConfigured();
  const response = await fetch(file.uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;
  return path;
};

// PAN encryption helper (uses pgcrypto via RPC — only owner can decrypt)
export const encryptPAN = async (pan: string): Promise<string> => {
  assertConfigured();
  const { data, error } = await supabase.rpc('encrypt_pan', { pan_text: pan });
  if (error) throw error;
  return data as string;
};

// Format paise to INR display
export const formatCurrency = (paise: number): string => {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
};

export const paiseToRupees = (paise: number): number => paise / 100;
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
