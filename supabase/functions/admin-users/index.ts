// ============================================================================
// admin-users — Supabase Edge Function (Deno)
//
// Privileged user management for the NSE dashboard. Every call:
//   1. verifies the caller's JWT,
//   2. confirms the caller is an admin (profiles.is_admin),
//   3. performs the requested action with the service role.
//
// Auto-injected secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Missing authorization token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ── Verify caller and admin rights ──────────────────────────────────────
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: "Invalid session" }, 401);

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("is_admin, disabled")
    .eq("id", caller.user.id)
    .maybeSingle();

  if (!callerProfile?.is_admin || callerProfile.disabled) {
    return json({ error: "Admin privileges required" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const action = body?.action;

  try {
    switch (action) {
      case "list": {
        const { data, error } = await admin
          .from("profiles")
          .select("id, email, full_name, is_admin, disabled, created_at")
          .order("created_at", { ascending: true });
        if (error) throw error;
        return json({ data });
      }

      case "create": {
        const { email, password, full_name, is_admin } = body;
        if (!email || !password) return json({ error: "Email and password are required" }, 400);
        if (String(password).length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: String(email).trim(),
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });
        if (createErr) throw createErr;

        const profileRow = {
          id: created.user.id,
          email: String(email).trim(),
          full_name: full_name ?? null,
          is_admin: !!is_admin,
          disabled: false,
        };
        const { error: profErr } = await admin.from("profiles").upsert(profileRow, { onConflict: "id" });
        if (profErr) throw profErr;

        return json({ data: { ...profileRow, created_at: created.user.created_at } });
      }

      case "set_admin": {
        const { id, is_admin } = body;
        if (id === caller.user.id && is_admin === false) {
          return json({ error: "You cannot remove your own admin rights." }, 400);
        }
        const { error } = await admin.from("profiles").update({ is_admin: !!is_admin }).eq("id", id);
        if (error) throw error;
        return json({ data: { id, is_admin: !!is_admin } });
      }

      case "set_disabled": {
        const { id, disabled } = body;
        if (id === caller.user.id && disabled === true) {
          return json({ error: "You cannot disable your own account." }, 400);
        }
        const { error } = await admin.from("profiles").update({ disabled: !!disabled }).eq("id", id);
        if (error) throw error;
        // Optionally ban at the auth layer so existing sessions can't refresh.
        await admin.auth.admin.updateUserById(id, { ban_duration: disabled ? "876000h" : "none" }).catch(() => {});
        return json({ data: { id, disabled: !!disabled } });
      }

      case "reset_password": {
        const { id, password } = body;
        if (!password || String(password).length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw error;
        return json({ data: { id } });
      }

      case "delete": {
        const { id } = body;
        if (id === caller.user.id) return json({ error: "You cannot delete your own account." }, 400);
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
        return json({ data: { id } });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
