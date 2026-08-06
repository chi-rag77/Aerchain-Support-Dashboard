// ============================================================================
// SLA rules data layer — reads/writes the admin-editable `sla_rules` table
// and applies the rules to the in-memory SLA engine.
//
// Multi-customer model: rows with an empty `company_name` are the shared
// DEFAULT ruleset (applies to every customer); rows with a `company_name` are
// a per-customer OVERRIDE (e.g. NSE's custom SLA). See migration 0006.
// ============================================================================

import { supabase } from "./supabase";
import { applySlaRules, SlaRule, SLA_RESOLUTION_HOURS, SLA_RESPONSE_HOURS, SLA_LABELS } from "@/lib/tickets";
import {
  BUSINESS_HOURS, setBusinessHours, minutesToHHMM, hhmmToMinutes, DEFAULT_BUSINESS_HOURS,
} from "@/lib/businessHours";
import { Priority } from "@/types/freshdesk";

/** Sentinel used across the admin UI for the shared default ruleset. */
export const DEFAULT_COMPANY = "";

/** app_settings key holding the JSON business-hours config. */
const BUSINESS_HOURS_KEY = "business_hours";

export interface SlaRuleRow extends SlaRule {
  company_name: string;
  response_hours: number;
  ack_minutes: number;
  analysis_minutes: number;
  updated_at?: string;
}

/** Current effective default rules from the in-memory engine (used as a fallback
 *  and as an editable template for a customer that has no override yet). */
export const defaultRules = (company: string = DEFAULT_COMPANY): SlaRuleRow[] =>
  ([4, 3, 2, 1] as Priority[]).map((p) => ({
    company_name: company,
    priority: p,
    severity_label: SLA_LABELS[p].severity,
    resolution_hours: SLA_RESOLUTION_HOURS[p],
    response_hours: SLA_RESPONSE_HOURS[p],
    resolution_label: SLA_LABELS[p].resolution,
    ack_minutes: 15,
    analysis_minutes: 60,
  }));

/* ── Business hours (global support window) ────────────────────────────────── */

export interface BusinessHoursForm {
  start: string;   // "10:30"
  end: string;     // "18:30"
  days: number[];  // JS getDay() values, 0=Sun … 6=Sat
}

export const businessHoursToForm = (): BusinessHoursForm => ({
  start: minutesToHHMM(BUSINESS_HOURS.startMin),
  end: minutesToHHMM(BUSINESS_HOURS.endMin),
  days: [...BUSINESS_HOURS.days],
});

/** Load the saved business-hours config from app_settings and apply it. */
export const loadBusinessHours = async (): Promise<BusinessHoursForm> => {
  if (!supabase) return businessHoursToForm();
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", BUSINESS_HOURS_KEY).maybeSingle();
  if (data?.value) {
    try {
      const cfg = JSON.parse(data.value);
      setBusinessHours({
        startMin: typeof cfg.startMin === "number" ? cfg.startMin : hhmmToMinutes(cfg.start ?? "10:30"),
        endMin: typeof cfg.endMin === "number" ? cfg.endMin : hhmmToMinutes(cfg.end ?? "18:30"),
        days: Array.isArray(cfg.days) ? cfg.days : DEFAULT_BUSINESS_HOURS.days,
        tzOffsetMin: typeof cfg.tzOffsetMin === "number" ? cfg.tzOffsetMin : DEFAULT_BUSINESS_HOURS.tzOffsetMin,
      });
    } catch { /* keep defaults on parse error */ }
  }
  return businessHoursToForm();
};

/** Admin: persist the business-hours config and apply it locally. */
export const saveBusinessHours = async (form: BusinessHoursForm): Promise<{ ok: boolean; error?: string }> => {
  const startMin = hhmmToMinutes(form.start);
  const endMin = hhmmToMinutes(form.end);
  if (endMin <= startMin) return { ok: false, error: "End time must be after start time." };
  if (!form.days.length) return { ok: false, error: "Select at least one working day." };
  setBusinessHours({ startMin, endMin, days: form.days });
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const payload = JSON.stringify({ startMin, endMin, days: form.days, tzOffsetMin: BUSINESS_HOURS.tzOffsetMin });
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: BUSINESS_HOURS_KEY, value: payload, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

/** Fetch ALL rules (default + every override) from Supabase and apply them. */
export const loadSlaRules = async (): Promise<SlaRuleRow[]> => {
  if (!supabase) return defaultRules();
  // Load the business-hours window first so SLA math is correct app-wide.
  await loadBusinessHours();
  const { data, error } = await supabase
    .from("sla_rules")
    .select("*")
    .order("priority", { ascending: false });
  if (error || !data?.length) return defaultRules();
  applySlaRules(data as SlaRule[]);
  return data as SlaRuleRow[];
};

/** Rules for a single company. Falls back to the editable default template when
 *  that company has no override rows yet (so admins can create one by saving). */
export const loadSlaRulesFor = async (company: string): Promise<SlaRuleRow[]> => {
  if (!supabase) return defaultRules(company);
  // Ensure the in-memory engine reflects the full ruleset regardless of filter.
  const all = await loadSlaRules();
  const rows = all.filter((r) => (r.company_name ?? "") === company);
  if (rows.length) return rows.sort((a, b) => b.priority - a.priority);
  // No override yet — seed the form from the current default targets.
  const defaults = all.filter((r) => (r.company_name ?? "") === DEFAULT_COMPANY);
  const template = defaults.length ? defaults : defaultRules();
  return template
    .map((r) => ({ ...r, company_name: company }))
    .sort((a, b) => b.priority - a.priority);
};

/** Distinct customer names present in the ticket data (for the admin selector). */
export const listCompanies = async (): Promise<string[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from("tickets").select("company_name");
  if (error || !data) return [];
  const set = new Set<string>();
  for (const row of data) {
    const name = (row.company_name ?? "").trim();
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
};

/** Admin: persist a single rule (default or override), then re-apply locally. */
export const saveSlaRule = async (rule: SlaRuleRow): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  // Upsert on the composite key so saving a not-yet-existing override inserts it.
  const { error } = await supabase
    .from("sla_rules")
    .upsert(
      {
        company_name: rule.company_name ?? DEFAULT_COMPANY,
        priority: rule.priority,
        severity_label: rule.severity_label,
        resolution_hours: rule.resolution_hours,
        response_hours: rule.response_hours,
        ack_minutes: rule.ack_minutes,
        analysis_minutes: rule.analysis_minutes,
        resolution_label: rule.resolution_label,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_name,priority" },
    );
  if (error) return { ok: false, error: error.message };
  applySlaRules([rule]);
  return { ok: true };
};
