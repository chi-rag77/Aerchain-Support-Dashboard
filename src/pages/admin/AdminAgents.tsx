import { useMemo, useState } from "react";
import {
  Users, AlertTriangle, Gauge, Inbox, Search, Download, ArrowUp, ArrowDown,
  RefreshCw, Loader2, Trophy,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTickets } from "@/hooks/useTickets";
import { initials } from "@/lib/tickets";
import {
  buildAgentScorecards, buildAgentSummary, sortScorecards,
  AgentScorecard, AgentSortKey, UNASSIGNED,
} from "@/lib/agentData";
import { ALL_CUSTOMERS } from "@/config";
import { showSuccess } from "@/utils/toast";

const PRIORITY_BAR: Record<number, string> = {
  4: "bg-rose-500", 3: "bg-amber-500", 2: "bg-sky-500", 1: "bg-emerald-500",
};

const avatarColor = (name: string) => {
  const colours = [
    "bg-gradient-to-br from-violet-500 to-purple-600 text-white",
    "bg-gradient-to-br from-sky-500 to-blue-600 text-white",
    "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
    "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
    "bg-gradient-to-br from-rose-500 to-pink-600 text-white",
    "bg-gradient-to-br from-indigo-500 to-violet-600 text-white",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colours[h % colours.length];
};

const complianceTone = (pct: number) =>
  pct >= 95 ? "text-emerald-600 dark:text-emerald-400"
  : pct >= 85 ? "text-amber-600 dark:text-amber-400"
  : "text-rose-600 dark:text-rose-400";
const complianceBar = (pct: number) =>
  pct >= 95 ? "bg-emerald-500" : pct >= 85 ? "bg-amber-500" : "bg-rose-500";

const exportScorecardsCSV = (cards: AgentScorecard[]) => {
  const headers = [
    "Agent", "Assigned", "Open", "Resolved", "Breached", "At Risk",
    "Critical Open", "Companies", "Avg Resolution (biz hrs)", "Resolution Rate %", "SLA Compliance %",
  ];
  const rows = cards.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`, c.assigned, c.open, c.resolved, c.breached, c.atRisk,
    c.criticalOpen, c.companies, c.avgResolutionHours ?? "", c.resolutionRate, c.compliancePct,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "agent-scorecards.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ── Summary tile ─────────────────────────────────────────────────────────── */
const Tile = ({ icon: Icon, label, value, tone, sub }: {
  icon: React.ElementType; label: string; value: string | number; tone?: string; sub?: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <div className={cn("mt-1.5 font-display text-[26px] font-black leading-none tracking-tight", tone)}>
      {value}
    </div>
    {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);

const AdminAgents = () => {
  const { tickets, isLoading, isRefreshing, refresh } = useTickets();
  const [company, setCompany] = useState<string>(ALL_CUSTOMERS);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<AgentSortKey>("assigned");
  const [asc, setAsc] = useState(false);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) { const n = (t.company_name ?? "").trim(); if (n) set.add(n); }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tickets]);

  const scoped = useMemo(
    () => (company === ALL_CUSTOMERS ? tickets : tickets.filter((t) => (t.company_name ?? "").trim() === company)),
    [tickets, company],
  );

  const allCards = useMemo(() => buildAgentScorecards(scoped), [scoped]);
  const summary = useMemo(() => buildAgentSummary(allCards), [allCards]);

  // Top performer: highest compliance among agents with a meaningful sample.
  const topPerformer = useMemo(() => {
    const eligible = allCards.filter((c) => c.name !== UNASSIGNED && c.resolved >= 3);
    return eligible.sort((a, b) => b.compliancePct - a.compliancePct || b.resolved - a.resolved)[0]?.name ?? null;
  }, [allCards]);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? allCards.filter((c) => c.name.toLowerCase().includes(q)) : allCards;
    return sortScorecards(filtered, sortKey, asc);
  }, [allCards, query, sortKey, asc]);

  const sort = (key: AgentSortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(key === "name"); }
  };

  const Th = ({ k, label, className }: { k: AgentSortKey; label: string; className?: string }) => {
    const active = sortKey === k;
    return (
      <th className={cn("px-3 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground", className)}>
        <button onClick={() => sort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-primary")}>
          {label}
          {active ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUp className="h-3 w-3 opacity-0" />}
        </button>
      </th>
    );
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        {/* Summary tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={Users} label="Active Agents" value={summary.agents} sub={`${summary.totalAssigned} tickets assigned`} />
          <Tile icon={Inbox} label="Open Backlog" value={summary.totalOpen} sub={`${summary.unassignedOpen} unassigned`} />
          <Tile icon={AlertTriangle} label="SLA Breaches" value={summary.totalBreached}
            tone={summary.totalBreached > 0 ? "text-rose-600 dark:text-rose-400" : undefined} sub="across all agents" />
          <Tile icon={Gauge} label="Team Compliance" value={`${summary.teamCompliance}%`}
            tone={complianceTone(summary.teamCompliance)} sub="target 95%" />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents…" className="pl-9" />
          </div>
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="h-10 w-[220px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CUSTOMERS}>All customers</SelectItem>
              {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => { exportScorecardsCSV(cards); showSuccess("Scorecard exported"); }}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* Scorecard table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
            <Users className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">Agent Scorecard</h2>
              <p className="text-[12px] text-muted-foreground">Workload, SLA health & throughput per assignee</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
            </div>
          ) : cards.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">No agents match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/60 text-left">
                    <Th k="name" label="Agent" className="pl-5" />
                    <Th k="assigned" label="Assigned" className="text-center" />
                    <Th k="open" label="Open" className="text-center" />
                    <th className="px-3 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Open mix</th>
                    <Th k="resolved" label="Resolved" className="text-center" />
                    <Th k="breached" label="Breached" className="text-center" />
                    <Th k="atRisk" label="At Risk" className="text-center" />
                    <Th k="avgResolutionHours" label="Avg Res (biz h)" className="text-center" />
                    <Th k="compliancePct" label="SLA Compliance" className="pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => {
                    const isUnassigned = c.name === UNASSIGNED;
                    const openMixTotal = c.open || 1;
                    return (
                      <tr key={c.name} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                        {/* Agent */}
                        <td className="py-3 pl-5 pr-3">
                          <div className="flex items-center gap-2.5">
                            {isUnassigned ? (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border text-[11px] text-muted-foreground">—</span>
                            ) : (
                              <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background">
                                <AvatarFallback className={cn("text-[11px] font-bold", avatarColor(c.name))}>{initials(c.name)}</AvatarFallback>
                              </Avatar>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={cn("truncate text-[13px] font-semibold", isUnassigned && "text-muted-foreground")}>{c.name}</span>
                                {topPerformer === c.name && (
                                  <span title="Top performer" className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-px text-[9.5px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                                    <Trophy className="h-2.5 w-2.5" /> TOP
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {c.companies} customer{c.companies === 1 ? "" : "s"}
                                {c.criticalOpen > 0 && <span className="text-rose-500"> · {c.criticalOpen} critical open</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-[13px] font-semibold tabular-nums">{c.assigned}</td>
                        <td className="px-3 py-3 text-center text-[13px] tabular-nums">{c.open}</td>
                        {/* Open mix by priority */}
                        <td className="px-3 py-3">
                          <div className="flex h-1.5 w-[92px] overflow-hidden rounded-full bg-secondary">
                            {([4, 3, 2, 1] as const).map((p) => (
                              c.openByPriority[p] > 0 && (
                                <div key={p} className={PRIORITY_BAR[p]} style={{ width: `${(c.openByPriority[p] / openMixTotal) * 100}%` }} title={`P${p}: ${c.openByPriority[p]}`} />
                              )
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-[13px] tabular-nums">{c.resolved}</td>
                        <td className={cn("px-3 py-3 text-center text-[13px] font-semibold tabular-nums", c.breached > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{c.breached}</td>
                        <td className={cn("px-3 py-3 text-center text-[13px] tabular-nums", c.atRisk > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{c.atRisk}</td>
                        <td className="px-3 py-3 text-center text-[13px] tabular-nums text-muted-foreground">{c.avgResolutionHours ?? "—"}</td>
                        {/* Compliance */}
                        <td className="py-3 pl-3 pr-5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-[80px] overflow-hidden rounded-full bg-secondary">
                              <div className={cn("h-full rounded-full", complianceBar(c.compliancePct))} style={{ width: `${c.compliancePct}%` }} />
                            </div>
                            <span className={cn("w-9 text-right text-[12.5px] font-bold tabular-nums", complianceTone(c.compliancePct))}>{c.compliancePct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
};

export default AdminAgents;
