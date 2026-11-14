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

// Isolated client factory.
// Used when the owner creates another account (warden) from inside the app:
// auth.signUp() on the shared client would REPLACE the owner's session with
// the new user's session. This client never persists or refreshes sessions,
// so the caller's session stays intact.
export const createIsolatedClient = () => {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_CONFIG_ERROR);
  return createClient(configuredUrl as string, configuredAnonKey as string, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: `sb-isolated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
};

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

  // Storage RLS requires an authenticated session. This produces a clear
  // message instead of the raw "new row violates row level security policy".
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error(
      'You are not signed in, so the upload was blocked. If you just registered, confirm your email, sign in, and submit your documents again.'
    );
  }

  const response = await fetch(file.uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: file.type,
      // Retries are common (a registration insert can fail after the
      // upload). Overwriting the caller's own folder is allowed by the
      // UPDATE storage policies in migration 006.
      upsert: true,
    });
  if (error) throw error;
  return path;
};

// ── Password reset via SMS OTP ──────────────────────────────
export interface OtpRequestResult {
  ok: boolean;
  error?: string;
  delivery?: 'sms' | 'demo';
  phone?: string;
  dev_otp?: string;
  message?: string;
}

export interface OtpResetResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export const requestPasswordOtp = async (identifier: string): Promise<OtpRequestResult> => {
  assertConfigured();
  const { data, error } = await supabase.rpc('request_password_otp', {
    p_identifier: identifier,
  });
  if (error) throw error;
  return data as OtpRequestResult;
};

export const resetPasswordWithOtp = async (
  identifier: string,
  otp: string,
  newPassword: string
): Promise<OtpResetResult> => {
  assertConfigured();
  const { data, error } = await supabase.rpc('reset_password_with_otp', {
    p_identifier: identifier,
    p_otp: otp,
    p_new_password: newPassword,
  });
  if (error) throw error;
  return data as OtpResetResult;
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
