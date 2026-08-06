import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from "react";
import { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/services/supabase";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  disabled: boolean;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  /** True when auth is unavailable (no Supabase) — app runs in open demo mode. */
  authDisabled: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const authDisabled = !isSupabaseConfigured;

  const loadProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    if (!supabase) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, is_admin, disabled")
      .eq("id", uid)
      .maybeSingle();
    return (data as Profile) ?? null;
  }, []);

  const applySession = useCallback(async (s: Session | null) => {
    setSession(s);
    if (s?.user) {
      const p = await loadProfile(s.user.id);
      // A disabled account is signed straight back out.
      if (p?.disabled) {
        await supabase?.auth.signOut();
        setSession(null);
        setProfile(null);
        return;
      }
      setProfile(p);
    } else {
      setProfile(null);
    }
  }, [loadProfile]);

  useEffect(() => {
    if (authDisabled) { setLoading(false); return; }
    let active = true;
    supabase!.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await applySession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => {
      applySession(s);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [authDisabled, applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { ok: false, error: "Authentication is not configured." };
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    const p = data.user ? await loadProfile(data.user.id) : null;
    if (p?.disabled) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has been disabled. Contact your administrator." };
    }
    return { ok: true };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) setProfile(await loadProfile(session.user.id));
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider value={{
      session, profile,
      isAdmin: !!profile?.is_admin,
      loading, authDisabled,
      signIn, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
