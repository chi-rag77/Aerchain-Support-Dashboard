import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when Supabase is configured — otherwise the app falls back to mock data. */
export const isSupabaseConfigured = !!(URL && ANON);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(URL!, ANON!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
