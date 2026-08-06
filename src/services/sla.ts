// ============================================================================
// SLA rules data layer — reads/writes the admin-editable `sla_rules` table
// and applies the rules to the in-memory SLA engine.
//
// Multi-customer model: rows with an empty `company_name` are the shared
// DEFAULT ruleset (applies to every customer); rows with a `company_name` are
// a per-customer OVERRIDE (e.g. NSE's custom SLA). See migration 0006.
// ============================================================================

import { supabase } from "./supabase";
import { applySlaRules, SlaRule, SLA_RESOLUTION_HOURS, SLA_LABELS } from "@/lib/tickets";
import { Priority } from "@/types/freshdesk";

/** Sentinel used across the admin UI for the shared default ruleset. */
export const DEFAULT_COMPANY = "";

export interface SlaRuleRow extends SlaRule {
  company_name: string;
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
    resolution_label: SLA_LABELS[p].resolution,
    ack_minutes: 15,
    analysis_minutes: 60,
  }));

/** Fetch ALL rules (default + every override) from Supabase and apply them. */
export const loadSlaRules = async (): Promise<SlaRuleRow[]> => {
  if (!supabase) return defaultRules();
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
