import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, UserRole } from '../types';

export type DemoPersona = 'student' | 'employee' | 'warden' | 'owner';

export const DEMO_PROFILES: Record<DemoPersona, { profile: Profile; session: any }> = {
  student: {
    profile: {
      id: 'demo-tenant-student-001',
      email: 'rahul.sharma@college.edu',
      full_name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      role: 'tenant',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    session: {
      user: {
        id: 'demo-tenant-student-001',
        email: 'rahul.sharma@college.edu',
      },
    },
  },
  employee: {
    profile: {
      id: 'demo-tenant-employee-002',
      email: 'priya.verma@techcorp.com',
      full_name: 'Priya Verma',
      phone: '+91 98111 22334',
      avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
      role: 'tenant',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    session: {
      user: {
        id: 'demo-tenant-employee-002',
        email: 'priya.verma@techcorp.com',
      },
    },
  },
  warden: {
    profile: {
      id: 'demo-warden-001',
      email: 'warden.gurgaon@avtarpg.com',
      full_name: 'Sukhvinder Singh (Head Warden)',
      phone: '+91 98765 00001',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      role: 'warden',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    session: {
      user: {
        id: 'demo-warden-001',
        email: 'warden.gurgaon@avtarpg.com',
      },
    },
  },
  owner: {
    profile: {
      id: 'demo-owner-001',
      email: 'avtar.singh@avtarpg.com',
      full_name: 'Avtar Singh (Super Admin)',
      phone: '+91 98765 99999',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    session: {
      user: {
        id: 'demo-owner-001',
        email: 'avtar.singh@avtarpg.com',
      },
    },
  },
};

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isInitialized: boolean;
  isDemoMode: boolean;

  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  loginAsDemo: (persona: DemoPersona) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  isLoading: false,
  isInitialized: false,
  isDemoMode: false,

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
    });
  },

  setProfile: (profile) => {
    set({ profile, role: profile?.role ?? null });
  },

  loginAsDemo: (persona: DemoPersona) => {
    const demo = DEMO_PROFILES[persona];
    set({
      session: demo.session as Session,
      user: demo.session.user as User,
      profile: demo.profile,
      role: demo.profile.role,
      isDemoMode: true,
      isInitialized: true,
    });
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      if (!isSupabaseConfigured) {
        // Safe demo fallback when cloud credentials are not linked yet
        set({ isLoading: false, isInitialized: true });
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
          set({ profile: null, role: null, isDemoMode: false });
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
    if (get().isDemoMode) return;

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
    if (!get().isDemoMode && isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    set({ session: null, user: null, profile: null, role: null, isDemoMode: false });
  },
}));
