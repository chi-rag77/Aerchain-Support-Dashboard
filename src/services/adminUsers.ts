// ============================================================================
// Admin user management — talks to the `admin-users` Edge Function, which
// performs privileged auth operations with the service role after verifying
// the caller is an admin.
// ============================================================================

import { supabase } from "./supabase";

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  disabled: boolean;
  created_at: string;
}

const invoke = async <T,>(action: string, payload: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: T; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, ...payload },
  });
  if (error) return { ok: false, error: error.message };
  if (data && data.error) return { ok: false, error: data.error };
  return { ok: true, data: data?.data as T };
};

export const listUsers = () => invoke<ManagedUser[]>("list");

export const createUser = (input: {
  email: string; password: string; full_name: string; is_admin: boolean;
}) => invoke<ManagedUser>("create", input);

export const setUserAdmin = (id: string, is_admin: boolean) =>
  invoke("set_admin", { id, is_admin });

export const setUserDisabled = (id: string, disabled: boolean) =>
  invoke("set_disabled", { id, disabled });

export const resetUserPassword = (id: string, password: string) =>
  invoke("reset_password", { id, password });

export const deleteUser = (id: string) => invoke("delete", { id });
