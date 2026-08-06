// ============================================================================
// slack-notify — Supabase Edge Function (Deno)
//
// Delivers Slack alerts SERVER-SIDE on a schedule (pg_cron), so they fire even
// when nobody has the dashboard open. Reads the admin-configured webhook(s)
// from app_settings (key 'slack_config', set via Admin → Slack) and the synced
// tickets table, then:
//
//   1. Assignee alerts — pings the team channel + @mentions the assignee for
//      each newly created/assigned ticket (deduped via slack_notified_assignments).
//   2. SLA reminders   — posts a digest of breached & at-risk tickets to a
//      group channel, throttled to slaReminderHours.
//
// No CORS concerns here (server-side fetch). Schedule it every 5 min with the
// block in supabase/cron.sql, or invoke with { "test": "assignee" | "sla" }
// to send a one-off test message.
//
// Secrets (auto-injected in the Supabase runtime):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface SlackConfig {
  enabled: boolean;
  assigneeWebhookUrl: string;
  slaWebhookUrl: string;
  notifyAssignee: boolean;
  notifySla: boolean;
  slaReminderHours: number;
  freshdeskDomain: string;
  userMap: Record<string, string>;
}

interface TicketRow {
  id: number;
  subject: string;
  priority: number;
  status: number;
  created_at: string;
  responder_id: number | null;
  responder_name: string | null;
  requester_name: string | null;
  company_name: string | null;
}

// Default calendar-hour SLA resolution targets (mirrors src/lib/tickets.ts).
const bizToCal = (bizHours: number) => Math.round((bizHours / 9) * 24);
const DEFAULT_RES_HOURS: Record<number, number> = {
  4: bizToCal(8), 3: bizToCal(32), 2: bizToCal(64), 1: bizToCal(120),
};
const SLA_DONE = [4, 5];       // resolved / closed
const SLA_PAUSED = 8;          // waiting on customer
const ATTENTION_PCT = 30;

const isWebhook = (url: string) => /^https:\/\/hooks\.slack\.com\/(services|triggers)\//.test((url ?? "").trim());

const sendWebhook = async (url: string, payload: Record<string, unknown>): Promise<boolean> => {
  if (!isWebhook(url)) return false;
  try {
    const r = await fetch(url.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch {
    return false;
  }
};

const priorityLabel = (p: number) =>
  p === 4 ? "Critical" : p === 3 ? "High" : p === 2 ? "Medium" : "Low";
const statusLabel = (s: number) =>
  ({ 2: "Open", 3: "Pending", 4: "Resolved", 5: "Closed", 7: "On Tech", 8: "Waiting on Customer", 9: "On Product" } as Record<number, string>)[s] ?? `Status ${s}`;
const priorityEmoji = (p: number) =>
  p === 4 ? ":red_circle:" : p === 3 ? ":large_orange_circle:" : p === 2 ? ":large_blue_circle:" : ":large_green_circle:";

const fmtDiff = (mins: number) => {
  const a = Math.abs(mins);
  const d = Math.floor(a / 1440), h = Math.floor((a % 1440) / 60), m = a % 60;
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const deepLink = (id: number, domain: string): string | null => {
  const d = (domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d ? `https://${d}/a/tickets/${id}` : null;
};

const assigneeMessage = (t: TicketRow, cfg: SlackConfig) => {
  const slackId = cfg.userMap[(t.responder_name ?? "").trim().toLowerCase()];
  const mention = slackId ? `<@${slackId}>` : `*${t.responder_name ?? "there"}*`;
  const link = deepLink(t.id, cfg.freshdeskDomain);
  const lines = [
    `:bell: ${mention} — a ticket has been assigned to you`,
    `${priorityEmoji(t.priority)} *#${t.id}* — ${t.subject}`,
    `*Priority:* ${priorityLabel(t.priority)}   ·   *Status:* ${statusLabel(t.status)}${t.requester_name ? `   ·   *Requester:* ${t.requester_name}` : ""}`,
  ];
  if (link) lines.push(`<${link}|Open in Freshdesk →>`);
  return { text: lines.join("\n"), unfurl_links: false };
};

// Per-company SLA resolver: an override for the ticket's company if present,
// else the shared default. Mirrors resolutionHoursFor() in src/lib/tickets.ts.
type ResHoursByCompany = { default: Record<number, number>; overrides: Record<string, Record<number, number>> };
const resolveHours = (map: ResHoursByCompany, company: string | null, priority: number): number => {
  const key = (company ?? "").trim().toUpperCase();
  const ov = map.overrides[key]?.[priority];
  if (ov != null) return ov;
  return map.default[priority] ?? DEFAULT_RES_HOURS[priority] ?? DEFAULT_RES_HOURS[1];
};

// SLA state for a ticket → remaining minutes + whether it's breached/at-risk.
const slaState = (t: TicketRow, resMap: ResHoursByCompany) => {
  if (SLA_DONE.includes(t.status)) return null;
  if (t.status === SLA_PAUSED) return null;
  const hours = resolveHours(resMap, t.company_name, t.priority);
  const limit = new Date(t.created_at).getTime() + hours * 3600_000;
  const remainingMin = Math.round((limit - Date.now()) / 60000);
  const total = hours * 60;
  const pct = Math.max(0, Math.min(100, (remainingMin / total) * 100));
  const state = remainingMin < 0 ? "breached" : pct < ATTENTION_PCT ? "attention" : "on_track";
  return { state, remainingMin };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing Supabase env" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const getSetting = async (key: string): Promise<string | null> => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
    return data?.value ?? null;
  };
  const setSetting = (key: string, value: string) =>
    supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  // ── Load config ──────────────────────────────────────────────────────────
  const raw = await getSetting("slack_config");
  if (!raw) return json({ ok: true, skipped: "no slack_config" });
  let cfg: SlackConfig;
  try { cfg = JSON.parse(raw); } catch { return json({ error: "slack_config is not valid JSON" }, 500); }

  // ── Test mode: send a one-off message and report real delivery status ──────
  let test: { test?: string; webhookUrl?: string } = {};
  try { test = await req.json(); } catch { /* no body */ }
  if (test?.test === "assignee" || test?.test === "sla") {
    const url = test.webhookUrl || (test.test === "assignee" ? cfg.assigneeWebhookUrl : cfg.slaWebhookUrl);
    const ok = await sendWebhook(url, {
      text: `:white_check_mark: *Test — ${test.test === "assignee" ? "Assignee alerts" : "SLA reminders"} connected.* Support dashboard will post here.`,
      unfurl_links: false,
    });
    return json({ ok, delivered: ok });
  }

  if (!cfg.enabled) return json({ ok: true, skipped: "disabled" });

  // ── SLA rules (default + per-customer overrides) ────────────────────────────
  const resMap: ResHoursByCompany = { default: { ...DEFAULT_RES_HOURS }, overrides: {} };
  const { data: rules } = await supabase
    .from("sla_rules")
    .select("priority, resolution_hours, company_name");
  (rules ?? []).forEach((r: { priority: number; resolution_hours: number; company_name?: string | null }) => {
    if (!r?.priority) return;
    const key = (r.company_name ?? "").trim().toUpperCase();
    if (!key) resMap.default[r.priority] = r.resolution_hours;
    else (resMap.overrides[key] ??= {})[r.priority] = r.resolution_hours;
  });

  // ── Tickets ────────────────────────────────────────────────────────────────
  const { data: tickets, error: tErr } = await supabase
    .from("tickets")
    .select("id, subject, priority, status, created_at, responder_id, responder_name, requester_name, company_name")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (tErr) return json({ error: tErr.message }, 500);
  const rows = (tickets ?? []) as TicketRow[];

  const result = { assignee_alerts: 0, sla_digest_sent: false };

  // ── 1. Assignee alerts ─────────────────────────────────────────────────────
  if (cfg.notifyAssignee && isWebhook(cfg.assigneeWebhookUrl)) {
    const baselineDone = (await getSetting("slack_assignee_baseline_done")) === "true";
    const assigned = rows.filter((t) => t.responder_id != null);

    if (!baselineDone) {
      // Seed current state silently so pre-existing tickets don't flood.
      if (assigned.length) {
        await supabase.from("slack_notified_assignments").upsert(
          assigned.map((t) => ({ ticket_id: t.id, responder_id: t.responder_id })),
          { onConflict: "ticket_id" },
        );
      }
      await setSetting("slack_assignee_baseline_done", "true");
    } else {
      const { data: notified } = await supabase
        .from("slack_notified_assignments")
        .select("ticket_id, responder_id");
      const seen = new Map<number, number | null>((notified ?? []).map((r: { ticket_id: number; responder_id: number | null }) => [r.ticket_id, r.responder_id]));

      const RECENT_MS = 3 * 24 * 3600_000;
      for (const t of assigned) {
        const fresh = Date.now() - new Date(t.created_at).getTime() < RECENT_MS;
        const changed = seen.get(t.id) !== t.responder_id;
        if (fresh && changed) {
          const ok = await sendWebhook(cfg.assigneeWebhookUrl, assigneeMessage(t, cfg));
          if (ok) result.assignee_alerts++;
        }
        // Record current state regardless, so we don't re-alert on the next run.
        await supabase.from("slack_notified_assignments").upsert(
          { ticket_id: t.id, responder_id: t.responder_id },
          { onConflict: "ticket_id" },
        );
      }
    }
  }

  // ── 2. SLA digest ───────────────────────────────────────────────────────────
  if (cfg.notifySla && isWebhook(cfg.slaWebhookUrl)) {
    const lastSent = Number((await getSetting("slack_sla_last_sent")) || 0);
    const intervalMs = Math.max(1, cfg.slaReminderHours) * 3600_000;
    if (Date.now() - lastSent >= intervalMs) {
      const scored = rows
        .map((t) => ({ t, s: slaState(t, resMap) }))
        .filter((x) => x.s && (x.s.state === "breached" || x.s.state === "attention"))
        .sort((a, b) => (a.s!.remainingMin) - (b.s!.remainingMin));

      if (scored.length) {
        const breached = scored.filter((x) => x.s!.state === "breached").length;
        const atRisk = scored.length - breached;
        const line = ({ t, s }: (typeof scored)[number]) => {
          const dot = s!.state === "breached" ? ":red_circle:" : ":large_orange_circle:";
          const when = s!.state === "breached" ? `breached (${fmtDiff(s!.remainingMin)} overdue)` : `${fmtDiff(s!.remainingMin)} left`;
          const who = t.responder_name ? ` · _${t.responder_name}_` : " · _unassigned_";
          return `${dot} *#${t.id}* ${t.subject} — ${when}${who}`;
        };
        const text = [
          ":rotating_light: *SLA Watch — Support*",
          `*${breached}* breached · *${atRisk}* at risk`,
          "",
          ...scored.slice(0, 15).map(line),
          scored.length > 15 ? `_…and ${scored.length - 15} more_` : "",
        ].filter(Boolean).join("\n");

        const ok = await sendWebhook(cfg.slaWebhookUrl, { text, unfurl_links: false });
        if (ok) {
          await setSetting("slack_sla_last_sent", String(Date.now()));
          result.sla_digest_sent = true;
        }
      }
    }
  }

  return json({ ok: true, ...result });
});
