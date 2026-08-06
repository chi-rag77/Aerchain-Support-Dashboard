// ============================================================================
// App settings data layer — admin-editable key/value settings stored in the
// `app_settings` Supabase table. Currently used for the branding logo.
//
// When Supabase is not configured (demo mode) settings persist in
// localStorage so the feature still works locally.
// ============================================================================

import { supabase } from "./supabase";

const BRAND_LOGO_KEY = "brand_logo";
const LS_PREFIX = "nse-app-setting:";

const lsGet = (key: string): string | null => {
  try {
    return localStorage.getItem(LS_PREFIX + key);
  } catch {
    return null;
  }
};

const lsSet = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(LS_PREFIX + key);
    else localStorage.setItem(LS_PREFIX + key, value);
  } catch {
    /* storage full / unavailable — non-fatal */
  }
};

/**
 * Generic key/value settings reader. Reads from the Supabase `app_settings`
 * table when configured, else from localStorage. Falls back to any local
 * mirror if the remote read fails.
 */
export const loadSetting = async (key: string): Promise<string | null> => {
  if (!supabase) return lsGet(key);

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load setting "${key}":`, error.message);
    return lsGet(key);
  }
  return data?.value ?? lsGet(key);
};

/** Generic key/value settings writer (Supabase when configured, else local). */
export const saveSetting = async (
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) {
    lsSet(key, value);
    return { ok: true };
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: error.message };
  lsSet(key, value); // local mirror for instant reloads
  return { ok: true };
};

/** Read the current brand logo (base64 data URI), or null if none set. */
export const loadBrandLogo = async (): Promise<string | null> => {
  if (!supabase) return lsGet(BRAND_LOGO_KEY);

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BRAND_LOGO_KEY)
    .maybeSingle();

  if (error) {
    console.error("Failed to load brand logo:", error.message);
    return lsGet(BRAND_LOGO_KEY); // fall back to any local copy
  }
  return data?.value ?? null;
};

/** Admin: persist the brand logo (base64 data URI). */
export const saveBrandLogo = async (
  dataUri: string,
): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) {
    lsSet(BRAND_LOGO_KEY, dataUri);
    return { ok: true };
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: BRAND_LOGO_KEY, value: dataUri, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: error.message };
  lsSet(BRAND_LOGO_KEY, dataUri); // keep a local mirror for instant reloads
  return { ok: true };
};

/** Admin: remove the custom brand logo (revert to the built-in mark). */
export const clearBrandLogo = async (): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) {
    lsSet(BRAND_LOGO_KEY, null);
    return { ok: true };
  }

  const { error } = await supabase
    .from("app_settings")
    .delete()
    .eq("key", BRAND_LOGO_KEY);
  if (error) return { ok: false, error: error.message };
  lsSet(BRAND_LOGO_KEY, null);
  return { ok: true };
};
