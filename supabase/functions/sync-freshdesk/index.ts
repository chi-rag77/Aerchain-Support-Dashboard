// ============================================================================
// sync-freshdesk — Supabase Edge Function (Deno)
//
// Pulls tickets (and their conversations) from the Freshdesk API and upserts
// them into public.tickets / public.conversations.
//
// Company scoping: this dashboard is the multi-customer roll-up — it syncs
// EVERY company EXCEPT the ones listed in FRESHDESK_EXCLUDE_COMPANY_NAME
// (default "NSE", which has its own dedicated dashboard). Each ticket carries
// its company in the custom field cf_company (native company_id is often null);
// we persist that as company_name so the app can group/filter and apply
// per-customer SLA.
//
//   • FRESHDESK_COMPANY_NAME          keep ONLY this cf_company (single-customer)
//   • FRESHDESK_EXCLUDE_COMPANY_NAME  drop these cf_company values (comma-sep.)
// The include filter (if set) is applied first, then the exclude filter.
//
// Required secrets:  FRESHDESK_DOMAIN, FRESHDESK_API_KEY,
//                    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// Optional secrets:  FRESHDESK_COMPANY_NAME          (cf_company to keep; default ""
//                                                     = sync ALL companies)
//                    FRESHDESK_EXCLUDE_COMPANY_NAME  (cf_company values to drop,
//                                                     comma-separated; default "NSE")
//                    SYNC_CREATED_AFTER              (ISO date, default 2026-08-01T00:00:00Z)
//                    SYNC_CONVERSATIONS              ("false" to skip conversations)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const rawDomain = Deno.env.get("FRESHDESK_DOMAIN");
  const DOMAIN = rawDomain && !rawDomain.includes(".") ? `${rawDomain}.freshdesk.com` : rawDomain;
  const API_KEY = Deno.env.get("FRESHDESK_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const SYNC_CONVOS = Deno.env.get("SYNC_CONVERSATIONS") !== "false";

  if (!DOMAIN || !API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing required env: FRESHDESK_DOMAIN, FRESHDESK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const fdAuth = "Basic " + btoa(`${API_KEY}:X`);
  const fdHeaders = { Authorization: fdAuth, "Content-Type": "application/json" };
  const baseUrl = `https://${DOMAIN}/api/v2`;

  // Scope by the cf_company custom field (native company_id is often null).
  // Include filter: default "" → keep every company (multi-customer roll-up).
  const COMPANY_FILTER = (Deno.env.get("FRESHDESK_COMPANY_NAME") ?? "").trim().toUpperCase();
  // Exclude filter: comma-separated cf_company values to drop. Default "NSE",
  // which has its own dedicated dashboard, so this roll-up covers everyone else.
  const EXCLUDE_FILTER = new Set(
    (Deno.env.get("FRESHDESK_EXCLUDE_COMPANY_NAME") ?? "NSE")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  const cfCompany = (t: any) => String(t.custom_fields?.cf_company ?? "").trim().toUpperCase();
  const matchesCompany = (t: any) => {
    const c = cfCompany(t);
    if (COMPANY_FILTER && c !== COMPANY_FILTER) return false; // include filter
    if (EXCLUDE_FILTER.has(c)) return false;                   // exclude filter
    return true;
  };

  // open a sync_log row
  const { data: logRow } = await supabase
    .from("sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  try {
    // ── 1. Agents map (id → name) ─────────────────────────────────────────
    const agentsMap: Record<number, string> = {};
    try {
      const aRes = await fetch(`${baseUrl}/agents?per_page=100`, { headers: fdHeaders });
      if (aRes.ok) {
        const agents = await aRes.json();
        for (const a of agents) agentsMap[a.id] = a.contact?.name ?? a.contact?.email ?? "Agent";
      }
    } catch { /* non-fatal */ }

    // ── 2. Fetch tickets created on/after the cutoff (all companies) ──────
    // Ordered created_at desc so we can stop as soon as we cross the cutoff.
    // We do NOT filter by native company_id (it's null for NSE) — scoping by
    // cf_company happens client-side below. include=stats gives due dates.
    const createdAfter = Deno.env.get("SYNC_CREATED_AFTER") ?? "2026-08-01T00:00:00Z";
    const parsedCutoff = Date.parse(createdAfter);
    const createdAfterMs = Number.isNaN(parsedCutoff) ? 0 : parsedCutoff;
    const baseFilter = `?include=requester,company,stats&per_page=100&order_by=created_at&order_type=desc`;

    const allTickets: any[] = [];
    let page = 1;
    while (page <= 20) {
      const res = await fetch(`${baseUrl}/tickets${baseFilter}&page=${page}`, { headers: fdHeaders });
      if (!res.ok) throw new Error(`Freshdesk tickets ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      const fresh = batch.filter((t: any) => Date.parse(t.created_at) >= createdAfterMs);
      allTickets.push(...fresh);
      if (fresh.length < batch.length) break; // crossed the cutoff boundary
      if (batch.length < 100) break;
      page++;
    }

    // ── 3. Scope to the target company via cf_company ──────────────────────
    const scoped = allTickets.filter(matchesCompany);

    const now = new Date().toISOString();
    const ticketRows = scoped.map((t) => ({
      id: t.id,
      subject: t.subject ?? "",
      description: t.description_text ?? t.description ?? "",
      priority: t.priority ?? 1,
      status: t.status ?? 2,
      created_at: t.created_at,
      updated_at: t.updated_at,
      requester_id: t.requester_id ?? null,
      company_id: t.company_id ?? null,
      responder_id: t.responder_id ?? null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      ticket_type: t.type ?? null,
      module: t.custom_fields?.cf_module ?? null,
      sub_type: t.custom_fields?.cf_issue_type ?? null,
      fr_due_by: t.fr_due_by ?? null,
      due_by: t.due_by ?? null,
      fr_escalated: t.fr_escalated ?? false,
      is_escalated: t.is_escalated ?? false,
      spam: t.spam ?? false,
      company_name: t.company?.name ?? t.custom_fields?.cf_company ?? "Unknown",
      requester_name: t.requester?.name ?? null,
      requester_email: t.requester?.email ?? null,
      responder_name: t.responder_id ? (agentsMap[t.responder_id] ?? null) : null,
      sla_policy_id: t.sla_policy_id ?? null,
      custom_fields: t.custom_fields ?? {},
      synced_at: now,
    }));

    if (ticketRows.length) {
      const { error } = await supabase.from("tickets").upsert(ticketRows, { onConflict: "id" });
      if (error) throw error;
    }

    // Purge tickets created before the cutoff (self-corrects older rows).
    let purged = 0;
    if (createdAfterMs > 0) {
      const { data: removed, error: purgeErr } = await supabase
        .from("tickets")
        .delete()
        .lt("created_at", new Date(createdAfterMs).toISOString())
        .select("id");
      if (purgeErr) throw purgeErr;
      purged = removed?.length ?? 0;
    }

    // ── 4. Conversations for the scoped tickets ────────────────────────────
    let convoCount = 0;
    if (SYNC_CONVOS) {
      for (const t of scoped) {
        const res = await fetch(`${baseUrl}/tickets/${t.id}/conversations?per_page=100`, { headers: fdHeaders });
        if (!res.ok) continue;
        const convos = await res.json();
        if (!Array.isArray(convos) || !convos.length) continue;
        const rows = convos.map((c: any) => ({
          id: c.id,
          ticket_id: t.id,
          body: c.body ?? "",
          body_text: c.body_text ?? c.body ?? "",
          incoming: c.incoming ?? true,
          private: c.private ?? false,
          user_id: c.user_id ?? null,
          created_at: c.created_at,
          updated_at: c.updated_at,
          attachments: c.attachments ?? [],
        }));
        const { error } = await supabase.from("conversations").upsert(rows, { onConflict: "id" });
        if (!error) convoCount += rows.length;
      }
    }

    if (logId) {
      await supabase
        .from("sync_log")
        .update({ status: "success", finished_at: new Date().toISOString(), tickets_synced: ticketRows.length, conversations_synced: convoCount })
        .eq("id", logId);
    }

    return json({ ok: true, company_filter: COMPANY_FILTER || "(all)", excluded: [...EXCLUDE_FILTER].join(",") || "(none)", fetched: allTickets.length, tickets_synced: ticketRows.length, conversations_synced: convoCount, tickets_purged: purged });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabase
        .from("sync_log")
        .update({ status: "error", finished_at: new Date().toISOString(), error: message })
        .eq("id", logId);
    }
    return json({ ok: false, error: message }, 500);
  }
});
