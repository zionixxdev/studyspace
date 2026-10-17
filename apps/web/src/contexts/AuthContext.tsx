import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@studyspace/shared';

interface AuthValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<{ needsVerification: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId: string) {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
    setProfileLoading(false);
  }

  useEffect(() => {
    if (session?.user) void loadProfile(session.user.id);
    else setProfile(null);
  }, [session?.user?.id]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      async signUp(email, password, username, displayName) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, display_name: displayName },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) throw new Error(error.message);
        return { needsVerification: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
        // Clear anything cached for this user; never leave private data behind.
        sessionStorage.clear();
        setProfile(null);
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(error.message);
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
      },
      async refreshProfile() {
        if (session?.user) await loadProfile(session.user.id);
      },
    }),
    [session, profile, loading, profileLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
