// ============================================================================
// Agent scorecard aggregation
//
// Rolls the ticket set up per assignee (responder_name) into a scorecard:
// workload, SLA health, throughput, and responsiveness. All SLA state is read
// from computeSLA() so it honours the business-hours engine and per-customer
// rules. Tickets with no assignee are grouped under "Unassigned".
// ============================================================================

import { Ticket, Priority } from "@/types/freshdesk";
import { computeSLA } from "@/lib/tickets";
import { resolutionHours } from "@/lib/reportData";

export const UNASSIGNED = "Unassigned";
const RESOLVED = (t: Ticket) => t.status === 4 || t.status === 5;
const PAUSED = (t: Ticket) => t.status === 8; // Waiting on Customer

export interface AgentScorecard {
  name: string;
  assigned: number;        // total tickets ever assigned
  open: number;            // not resolved/closed
  resolved: number;        // resolved or closed
  breached: number;        // SLA breached (open overdue + resolved late)
  atRisk: number;          // <30% of SLA window remaining
  paused: number;          // waiting on customer (timer paused)
  criticalOpen: number;    // priority 4, still open
  highOpen: number;        // priority 3, still open
  companies: number;       // distinct customers served
  avgResolutionHours: number | null; // business hours, over resolved tickets
  resolutionRate: number;  // resolved / assigned (%)
  compliancePct: number;   // (assigned − breached) / assigned (%)
  /** open ticket count by priority, for the mini-distribution bar */
  openByPriority: Record<Priority, number>;
}

export interface AgentSummary {
  agents: number;          // distinct assignees (excl. Unassigned)
  totalAssigned: number;
  unassignedOpen: number;
  totalOpen: number;
  totalBreached: number;
  teamCompliance: number;  // (all − breached) / all (%)
}

const blank = (name: string): AgentScorecard => ({
  name,
  assigned: 0, open: 0, resolved: 0, breached: 0, atRisk: 0, paused: 0,
  criticalOpen: 0, highOpen: 0, companies: 0, avgResolutionHours: null,
  resolutionRate: 0, compliancePct: 100,
  openByPriority: { 1: 0, 2: 0, 3: 0, 4: 0 },
});

/** Build one scorecard per assignee from the given tickets. */
export const buildAgentScorecards = (tickets: Ticket[]): AgentScorecard[] => {
  const map = new Map<string, AgentScorecard>();
  const companySets = new Map<string, Set<string>>();
  const resDurations = new Map<string, number[]>();

  for (const t of tickets) {
    const name = t.responder_name?.trim() || UNASSIGNED;
    const card = map.get(name) ?? blank(name);
    const sla = computeSLA(t).state;
    const isResolved = RESOLVED(t);
    const isOpen = !isResolved;

    card.assigned += 1;
    if (isResolved) card.resolved += 1;
    if (isOpen) {
      card.open += 1;
      card.openByPriority[t.priority] += 1;
      if (t.priority === 4) card.criticalOpen += 1;
      if (t.priority === 3) card.highOpen += 1;
    }
    if (sla === "breached") card.breached += 1;
    else if (sla === "attention") card.atRisk += 1;
    if (PAUSED(t)) card.paused += 1;

    // distinct companies
    const cs = companySets.get(name) ?? new Set<string>();
    const co = (t.company_name ?? "").trim();
    if (co) cs.add(co);
    companySets.set(name, cs);

    // business-hours resolution durations (resolved only)
    if (isResolved) {
      const rh = resolutionHours(t);
      if (rh != null) {
        const arr = resDurations.get(name) ?? [];
        arr.push(rh);
        resDurations.set(name, arr);
      }
    }

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

  // Real agents first (by assigned desc), Unassigned pinned last.
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
  const totalAssigned = cards.reduce((s, c) => s + c.assigned, 0);
  const totalOpen = cards.reduce((s, c) => s + c.open, 0);
  const totalBreached = cards.reduce((s, c) => s + c.breached, 0);
  return {
    agents: real.length,
    totalAssigned,
    unassignedOpen: unassigned?.open ?? 0,
    totalOpen,
    totalBreached,
    teamCompliance: totalAssigned ? Math.round(((totalAssigned - totalBreached) / totalAssigned) * 100) : 100,
  };
};

export type AgentSortKey =
  | "name" | "assigned" | "open" | "resolved" | "breached"
  | "atRisk" | "avgResolutionHours" | "compliancePct";

export const sortScorecards = (
  cards: AgentScorecard[], key: AgentSortKey, asc: boolean,
): AgentScorecard[] => {
  const dir = asc ? 1 : -1;
  return [...cards].sort((a, b) => {
    // Keep Unassigned pinned to the bottom regardless of sort.
    if (a.name === UNASSIGNED) return 1;
    if (b.name === UNASSIGNED) return -1;
    if (key === "name") return a.name.localeCompare(b.name) * dir;
    const av = (a[key] ?? 0) as number;
    const bv = (b[key] ?? 0) as number;
    return (av - bv) * dir;
  });
};
