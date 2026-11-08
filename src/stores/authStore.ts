import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, UserRole } from '../types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isInitialized: boolean;
  configError: string | null;

  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  isLoading: false,
  isInitialized: false,
  configError: null,

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
    });
  },

  setProfile: (profile) => {
    set({ profile, role: profile?.role ?? null });
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      if (!isSupabaseConfigured) {
        set({
          isLoading: false,
          isInitialized: true,
          configError:
            'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (and EAS secrets for builds), then restart.',
        });
        return;
      }

      // Add a 3-second timeout so the app never hangs on startup
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null }; error: null }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null }, error: null }), 3000)
      );

      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      set({ session, user: session?.user ?? null });

      if (session?.user) {
        try {
          await Promise.race([
            get().refreshProfile(),
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch {
          // Non-blocking profile fetch
        }
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          await get().refreshProfile();
        } else {
          set({ profile: null, role: null });
        }
      });
    } catch (error) {
      console.warn('Auth init note:', error);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        set({ profile: data as Profile, role: data.role as UserRole });
      }
    } catch (error) {
      console.error('Profile refresh error:', error);
    }
  },

  signOut: async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    set({ session: null, user: null, profile: null, role: null });
  },
}));
