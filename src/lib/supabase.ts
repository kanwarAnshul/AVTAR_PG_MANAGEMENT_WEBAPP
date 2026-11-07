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

// Fallback placeholder credentials to prevent app crash on cold start
const DEFAULT_URL = 'https://avtarsingh-pg-placeholder.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.signature';

const supabaseUrl = isSupabaseConfigured ? (configuredUrl as string) : DEFAULT_URL;
const supabaseAnonKey = isSupabaseConfigured ? (configuredAnonKey as string) : DEFAULT_ANON_KEY;

if (!isSupabaseConfigured) {
  console.log('ℹ️ Running in Demo / Offline-Ready Mode. To connect live Supabase, configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
});

// Storage helpers
export const getSignedUrl = async (bucket: string, path: string, expiresIn = 60) => {
  if (!isSupabaseConfigured) {
    // Return sample preview URL in demo mode
    return `https://images.unsplash.com/photo-1544717305-2782549b5136?w=400&q=80`;
  }
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
  if (!isSupabaseConfigured) {
    // Simulated upload in demo mode
    return path;
  }
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
  if (!isSupabaseConfigured) {
    return `ENC_AES256_${pan.toUpperCase().trim()}`;
  }
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
