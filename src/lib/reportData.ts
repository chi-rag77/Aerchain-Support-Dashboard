import { Ticket, Priority } from "@/types/freshdesk";
import {
  computeSLA, resolutionHoursFor, SLA_LABELS,
  PRIORITY_META, STATUS_META, requesterDisplayName, ticketDept, ticketRef,
} from "@/lib/tickets";
import { differenceInHours, format, parseISO } from "date-fns";

/* ----------------------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------------------- */

export const priorityName = (p: number) => PRIORITY_META[p as Priority]?.label ?? String(p);
export const statusName = (s: number) => STATUS_META[s]?.label ?? `Status ${s}`;

const isResolved = (t: Ticket) => t.status === 4 || t.status === 5;

/** Resolution duration in hours (created → updated) for resolved tickets. */
export const resolutionHours = (t: Ticket): number | null => {
  if (!isResolved(t)) return null;
  return Math.max(0, differenceInHours(parseISO(t.updated_at), parseISO(t.created_at)));
};

/**
 * Did this ticket meet its SLA?
 *  - resolved  → met if resolution time ≤ target hours
 *  - open      → met unless computeSLA says breached
 */
export const metSLA = (t: Ticket): boolean => {
  const target = resolutionHoursFor(t.company_name, t.priority);
  const rh = resolutionHours(t);
  if (rh !== null) return rh <= target;
  return computeSLA(t).state !== "breached";
};

/* ----------------------------------------------------------------------------
 * Month filtering
 * ------------------------------------------------------------------------- */

export interface MonthOption {
  key: string;        // "2026-05"
  label: string;      // "May 2026"
}

export const availableMonths = (tickets: Ticket[]): MonthOption[] => {
  const set = new Map<string, string>();
  tickets.forEach((t) => {
    const d = parseISO(t.created_at);
    const key = format(d, "yyyy-MM");
    set.set(key, format(d, "MMMM yyyy"));
  });
  return [...set.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, label]) => ({ key, label }));
};

export const ticketsForMonth = (tickets: Ticket[], monthKey: string): Ticket[] => {
  if (monthKey === "all") return tickets;
  return tickets.filter((t) => format(parseISO(t.created_at), "yyyy-MM") === monthKey);
};

/* ----------------------------------------------------------------------------
 * Aggregated SLA report
 * ------------------------------------------------------------------------- */

export interface SLARow {
  severity: string;
  priority: string;
  target: string;       // human readable resolution target
  total: number;
  resolved: number;
  met: number;
  breached: number;
  compliance: number;   // %
  avgResolution: string; // e.g. "14.2h"
}

export interface SLAReport {
  periodLabel: string;
  generatedAt: string;
  rows: SLARow[];
  totals: {
    total: number;
    resolved: number;
    met: number;
    breached: number;
    compliance: number;
    avgResolution: string;
  };
}

export const buildSLAReport = (tickets: Ticket[], periodLabel: string): SLAReport => {
  const priorities: Priority[] = [4, 3, 2, 1];

  const rows: SLARow[] = priorities.map((p) => {
    const group = tickets.filter((t) => t.priority === p);
    const resolved = group.filter(isResolved);
    const met = group.filter(metSLA).length;
    const breached = group.length - met;
    const compliance = group.length ? Math.round((met / group.length) * 100) : 100;
    const durations = resolved.map((t) => resolutionHours(t) ?? 0);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      severity: SLA_LABELS[p].severity,
      priority: priorityName(p),
      target: SLA_LABELS[p].resolution,
      total: group.length,
      resolved: resolved.length,
      met,
      breached,
      compliance,
      avgResolution: avg ? `${avg.toFixed(1)}h` : "—",
    };
  });

  const total = tickets.length;
  const resolvedAll = tickets.filter(isResolved);
  const metAll = tickets.filter(metSLA).length;
  const breachedAll = total - metAll;
  const allDurations = resolvedAll.map((t) => resolutionHours(t) ?? 0);
  const avgAll = allDurations.length ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : 0;

  return {
    periodLabel,
    generatedAt: format(new Date(), "dd MMM yyyy, h:mm a"),
    rows,
    totals: {
      total,
      resolved: resolvedAll.length,
      met: metAll,
      breached: breachedAll,
      compliance: total ? Math.round((metAll / total) * 100) : 100,
      avgResolution: avgAll ? `${avgAll.toFixed(1)}h` : "—",
    },
  };
};

/* ----------------------------------------------------------------------------
 * Flat ticket rows for the raw-data sheet / CSV
 * ------------------------------------------------------------------------- */

export interface TicketRow {
  id: string;
  subject: string;
  priority: string;
  status: string;
  requester: string;
  department: string;
  assignee: string;
  created: string;
  updated: string;
  ageHours: number;
  slaState: string;
  resolution: string;
  tags: string;
}

export const buildTicketRows = (tickets: Ticket[]): TicketRow[] =>
  tickets.map((t) => {
    const sla = computeSLA(t);
    const rh = resolutionHours(t);
    return {
      id: ticketRef(t),
      subject: t.subject,
      priority: priorityName(t.priority),
      status: statusName(t.status),
      requester: requesterDisplayName(t),
      department: ticketDept(t),
      assignee: t.responder_name ?? "Unassigned",
      created: format(parseISO(t.created_at), "dd MMM yyyy, h:mm a"),
      updated: format(parseISO(t.updated_at), "dd MMM yyyy, h:mm a"),
      ageHours: Math.max(0, differenceInHours(new Date(), parseISO(t.created_at))),
      slaState:
        sla.state === "met" ? "Met"
        : sla.state === "breached" ? "Breached"
        : sla.state === "attention" ? "At Risk"
        : "On Track",
      resolution: rh !== null ? `${rh}h` : "—",
      tags: t.tags.join(", "),
    };
  });

/* ----------------------------------------------------------------------------
 * Dashboard summary numbers for the report cover sheet
 * ------------------------------------------------------------------------- */

export interface ReportSummary {
  periodLabel: string;
  generatedAt: string;
  total: number;
  open: number;
  resolved: number;
  breached: number;
  slaCompliance: number;
  avgResolution: string;
  byPriority: { label: string; count: number }[];
  byStatus: { label: string; count: number }[];
  byDept: { label: string; count: number }[];
}

export const buildSummary = (tickets: Ticket[], periodLabel: string): ReportSummary => {
  const sla = buildSLAReport(tickets, periodLabel);
  const open = tickets.filter((t) => !isResolved(t)).length;

  const priorityCounts = ([4, 3, 2, 1] as Priority[]).map((p) => ({
    label: priorityName(p),
    count: tickets.filter((t) => t.priority === p).length,
  }));

  const statusMap = new Map<string, number>();
  tickets.forEach((t) => {
    const k = statusName(t.status);
    statusMap.set(k, (statusMap.get(k) ?? 0) + 1);
  });

  const deptMap = new Map<string, number>();
  tickets.forEach((t) => {
    const k = ticketDept(t);
    deptMap.set(k, (deptMap.get(k) ?? 0) + 1);
  });

  return {
    periodLabel,
    generatedAt: format(new Date(), "dd MMM yyyy, h:mm a"),
    total: tickets.length,
    open,
    resolved: sla.totals.resolved,
    breached: sla.totals.breached,
    slaCompliance: sla.totals.compliance,
    avgResolution: sla.totals.avgResolution,
    byPriority: priorityCounts,
    byStatus: [...statusMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
    byDept: [...deptMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count })),
  };
};
