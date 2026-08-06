// ============================================================================
// Agent scorecard aggregation
//
// Rolls the ticket set up per assignee (responder_name) into a scorecard:
// workload, SLA health, throughput, aging, status/type mix, escalations, and a
// resolved-per-day sparkline. All SLA state is read from computeSLA() so it
// honours the business-hours engine and per-customer rules. Tickets with no
// assignee are grouped under "Unassigned".
// ============================================================================

import { Ticket, Priority } from "@/types/freshdesk";
import { computeSLA } from "@/lib/tickets";
import { resolutionHours } from "@/lib/reportData";
import { parseISO, differenceInCalendarDays } from "date-fns";

export const UNASSIGNED = "Unassigned";
export const SPARK_DAYS = 14; // resolved-per-day sparkline length

const RESOLVED = (t: Ticket) => t.status === 4 || t.status === 5;
const PAUSED = (t: Ticket) => t.status === 8; // Waiting on Customer

export interface AgingBuckets { d0_3: number; d4_7: number; d8_30: number; d30p: number; }

export interface AgentScorecard {
  name: string;
  assigned: number;        // total tickets ever assigned
  open: number;            // not resolved/closed
  resolved: number;        // resolved or closed
  breached: number;        // resolution SLA breached (open overdue + resolved late)
  responseBreaches: number;// first-response SLA breached (Freshdesk fr_escalated)
  escalated: number;       // is_escalated OR fr_escalated
  atRisk: number;          // <30% of SLA window remaining
  paused: number;          // waiting on customer (timer paused)
  criticalOpen: number;    // priority 4, still open
  highOpen: number;        // priority 3, still open
  companies: number;       // distinct customers served
  avgResolutionHours: number | null; // business hours, over resolved tickets
  resolutionRate: number;  // resolved / assigned (%)
  compliancePct: number;   // (assigned − breached) / assigned (%)
  openByPriority: Record<Priority, number>;
  aging: AgingBuckets;     // open tickets by age (days since created)
  statusMix: Record<number, number>; // all assigned, keyed by status code
  typeMix: Record<string, number>;   // ticket_type ?? module ?? "Other"
  spark: number[];         // resolved per day, oldest→newest (length SPARK_DAYS)
}

export interface AgentSummary {
  agents: number;          // distinct assignees (excl. Unassigned)
  totalAssigned: number;
  unassignedOpen: number;
  totalOpen: number;
  totalResolved: number;
  totalAtRisk: number;
  totalBreached: number;
  totalResponseBreaches: number;
  teamCompliance: number;  // (all − breached) / all (%)
}

const blank = (name: string): AgentScorecard => ({
  name,
  assigned: 0, open: 0, resolved: 0, breached: 0, responseBreaches: 0, escalated: 0,
  atRisk: 0, paused: 0, criticalOpen: 0, highOpen: 0, companies: 0, avgResolutionHours: null,
  resolutionRate: 0, compliancePct: 100,
  openByPriority: { 1: 0, 2: 0, 3: 0, 4: 0 },
  aging: { d0_3: 0, d4_7: 0, d8_30: 0, d30p: 0 },
  statusMix: {}, typeMix: {}, spark: Array(SPARK_DAYS).fill(0),
});

const typeKey = (t: Ticket) => (t.ticket_type || t.module || "Other").toString();

/** Build one scorecard per assignee from the given tickets. */
export const buildAgentScorecards = (tickets: Ticket[]): AgentScorecard[] => {
  const now = new Date();
  const map = new Map<string, AgentScorecard>();
  const companySets = new Map<string, Set<string>>();
  const resDurations = new Map<string, number[]>();

  for (const t of tickets) {
    const name = t.responder_name?.trim() || UNASSIGNED;
    const card = map.get(name) ?? blank(name);
    const sla = computeSLA(t).state;
    const isResolved = RESOLVED(t);

    card.assigned += 1;
    card.statusMix[t.status] = (card.statusMix[t.status] ?? 0) + 1;
    const tk = typeKey(t);
    card.typeMix[tk] = (card.typeMix[tk] ?? 0) + 1;
    if (t.is_escalated || t.fr_escalated) card.escalated += 1;
    if (t.fr_escalated) card.responseBreaches += 1;

    if (isResolved) {
      card.resolved += 1;
      const idx = differenceInCalendarDays(now, parseISO(t.updated_at));
      if (idx >= 0 && idx < SPARK_DAYS) card.spark[SPARK_DAYS - 1 - idx] += 1;
      const rh = resolutionHours(t);
      if (rh != null) {
        const arr = resDurations.get(name) ?? [];
        arr.push(rh);
        resDurations.set(name, arr);
      }
    } else {
      card.open += 1;
      card.openByPriority[t.priority] += 1;
      if (t.priority === 4) card.criticalOpen += 1;
      if (t.priority === 3) card.highOpen += 1;
      const age = differenceInCalendarDays(now, parseISO(t.created_at));
      if (age <= 3) card.aging.d0_3 += 1;
      else if (age <= 7) card.aging.d4_7 += 1;
      else if (age <= 30) card.aging.d8_30 += 1;
      else card.aging.d30p += 1;
    }

    if (sla === "breached") card.breached += 1;
    else if (sla === "attention") card.atRisk += 1;
    if (PAUSED(t)) card.paused += 1;

    const cs = companySets.get(name) ?? new Set<string>();
    const co = (t.company_name ?? "").trim();
    if (co) cs.add(co);
    companySets.set(name, cs);

    map.set(name, card);
  }

  const cards = [...map.values()].map((c) => {
    c.companies = companySets.get(c.name)?.size ?? 0;
    const durs = resDurations.get(c.name) ?? [];
    c.avgResolutionHours = durs.length
      ? Math.round((durs.reduce((a, b) => a + b, 0) / durs.length) * 10) / 10
      : null;
    c.resolutionRate = c.assigned ? Math.round((c.resolved / c.assigned) * 100) : 0;
    c.compliancePct = c.assigned ? Math.round(((c.assigned - c.breached) / c.assigned) * 100) : 100;
    return c;
  });

  return cards.sort((a, b) => {
    if (a.name === UNASSIGNED) return 1;
    if (b.name === UNASSIGNED) return -1;
    return b.assigned - a.assigned;
  });
};

/** Team-wide rollup for the summary tiles. */
export const buildAgentSummary = (cards: AgentScorecard[]): AgentSummary => {
  const real = cards.filter((c) => c.name !== UNASSIGNED);
  const unassigned = cards.find((c) => c.name === UNASSIGNED);
  const sum = (f: (c: AgentScorecard) => number) => cards.reduce((s, c) => s + f(c), 0);
  const totalAssigned = sum((c) => c.assigned);
  const totalBreached = sum((c) => c.breached);
  return {
    agents: real.length,
    totalAssigned,
    unassignedOpen: unassigned?.open ?? 0,
    totalOpen: sum((c) => c.open),
    totalResolved: sum((c) => c.resolved),
    totalAtRisk: sum((c) => c.atRisk),
    totalBreached,
    totalResponseBreaches: sum((c) => c.responseBreaches),
    teamCompliance: totalAssigned ? Math.round(((totalAssigned - totalBreached) / totalAssigned) * 100) : 100,
  };
};

/* ── Company coverage (agents × customers) ─────────────────────────────────── */
export interface CompanyCoverage {
  companies: string[];
  rows: { agent: string; counts: Record<string, number>; total: number }[];
  max: number;
}

export const buildCompanyCoverage = (tickets: Ticket[]): CompanyCoverage => {
  const companySet = new Set<string>();
  const agentMap = new Map<string, Record<string, number>>();
  for (const t of tickets) {
    const agent = t.responder_name?.trim();
    const co = (t.company_name ?? "").trim();
    if (!agent || !co) continue;
    companySet.add(co);
    const row = agentMap.get(agent) ?? {};
    row[co] = (row[co] ?? 0) + 1;
    agentMap.set(agent, row);
  }
  const companies = [...companySet].sort((a, b) => a.localeCompare(b));
  let max = 0;
  const rows = [...agentMap.entries()]
    .map(([agent, counts]) => {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const v of Object.values(counts)) if (v > max) max = v;
      return { agent, counts, total };
    })
    .sort((a, b) => b.total - a.total);
  return { companies, rows, max: max || 1 };
};

export type AgentSortKey =
  | "name" | "assigned" | "open" | "resolved" | "breached"
  | "escalated" | "atRisk" | "avgResolutionHours" | "compliancePct";

export const sortScorecards = (
  cards: AgentScorecard[], key: AgentSortKey, asc: boolean,
): AgentScorecard[] => {
  const dir = asc ? 1 : -1;
  return [...cards].sort((a, b) => {
    if (a.name === UNASSIGNED) return 1;
    if (b.name === UNASSIGNED) return -1;
    if (key === "name") return a.name.localeCompare(b.name) * dir;
    const av = (a[key] ?? 0) as number;
    const bv = (b[key] ?? 0) as number;
    return (av - bv) * dir;
  });
};

/** Group a ticket list by assignee (for the drill-down). */
export const ticketsByAgent = (tickets: Ticket[], agent: string): Ticket[] =>
  tickets.filter((t) => (t.responder_name?.trim() || UNASSIGNED) === agent);
