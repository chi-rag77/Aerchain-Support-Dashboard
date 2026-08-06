import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Users2, AlertTriangle, Gauge, Inbox, Search, Download, ArrowUp, ArrowDown,
  Trophy, Zap, Flame, CheckCircle2, TrendingUp, Building2, ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { initials } from "@/lib/tickets";
import {
  buildAgentScorecards, buildAgentSummary, sortScorecards,
  AgentScorecard, AgentSortKey, UNASSIGNED,
} from "@/lib/agentData";
import { showSuccess } from "@/utils/toast";

/* ── palette ──────────────────────────────────────────────────────────────── */
const C = { violet: "#6B4EFF", emerald: "#10b981", rose: "#f43f5e", amber: "#f59e0b", sky: "#0ea5e9" };
const PRIORITY_BAR: Record<number, string> = { 4: "bg-rose-500", 3: "bg-amber-500", 2: "bg-sky-500", 1: "bg-emerald-500" };

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
const complianceHex = (pct: number) => (pct >= 95 ? C.emerald : pct >= 85 ? C.amber : C.rose);
const complianceBar = (pct: number) => (pct >= 95 ? "bg-emerald-500" : pct >= 85 ? "bg-amber-500" : "bg-rose-500");

const exportScorecardsCSV = (cards: AgentScorecard[]) => {
  const headers = ["Agent", "Assigned", "Open", "Resolved", "Breached", "At Risk", "Critical Open", "Customers", "Avg Resolution (biz hrs)", "Resolution Rate %", "SLA Compliance %"];
  const rows = cards.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`, c.assigned, c.open, c.resolved, c.breached, c.atRisk,
    c.criticalOpen, c.companies, c.avgResolutionHours ?? "", c.resolutionRate, c.compliancePct,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.setAttribute("download", "team-scorecards.csv");
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ── small components ─────────────────────────────────────────────────────── */
const Tile = ({ icon: Icon, label, value, tone, sub, accent }: {
  icon: React.ElementType; label: string; value: string | number; tone?: string; sub?: string; accent: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}18` }}>
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </span>
    </div>
    <div className={cn("mt-2 font-display text-[28px] font-black leading-none tracking-tight", tone)}>{value}</div>
    {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);

const Highlight = ({ icon: Icon, label, name, detail, accent }: {
  icon: React.ElementType; label: string; name: string; detail: string; accent: string;
}) => (
  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}18` }}>
      <Icon className="h-5 w-5" style={{ color: accent }} />
    </span>
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-[14px] font-bold">{name}</div>
      <div className="truncate text-[11.5px] text-muted-foreground">{detail}</div>
    </div>
  </div>
);

const Panel = ({ icon: Icon, title, sub, color, children }: {
  icon: React.ElementType; title: string; sub: string; color: string; children: React.ReactNode;
}) => (
  <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}18` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div>
        <h3 className="text-[13px] font-bold">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-[11px] shadow-xl">
      <p className="mb-1.5 font-bold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="capitalize text-muted-foreground">{p.name}:</span>
          <span className="font-bold text-foreground">{p.value}{String(p.name).toLowerCase().includes("compliance") ? "%" : ""}</span>
        </div>
      ))}
    </div>
  );
};

/* ── body ─────────────────────────────────────────────────────────────────── */
const TeamsBody = ({ tickets, isLoading, companyLabel }: {
  tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void; companyLabel: string;
}) => {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<AgentSortKey>("assigned");
  const [asc, setAsc] = useState(false);

  const allCards = useMemo(() => buildAgentScorecards(tickets), [tickets]);
  const summary = useMemo(() => buildAgentSummary(allCards), [allCards]);
  const realCards = useMemo(() => allCards.filter((c) => c.name !== UNASSIGNED), [allCards]);

  const derived = useMemo(() => {
    const resolved = allCards.reduce((s, c) => s + c.resolved, 0);
    const atRisk = allCards.reduce((s, c) => s + c.atRisk, 0);
    const withAvg = realCards.filter((c) => c.avgResolutionHours != null);
    const avgRes = withAvg.length ? Math.round((withAvg.reduce((s, c) => s + (c.avgResolutionHours ?? 0), 0) / withAvg.length) * 10) / 10 : null;
    return { resolved, atRisk, avgRes };
  }, [allCards, realCards]);

  const highlights = useMemo(() => {
    const eligible = realCards.filter((c) => c.resolved >= 3);
    const top = [...eligible].sort((a, b) => b.compliancePct - a.compliancePct || b.resolved - a.resolved)[0];
    const attention = [...realCards].sort((a, b) => b.breached - a.breached)[0];
    const fastest = [...realCards.filter((c) => c.avgResolutionHours != null && c.resolved >= 3)]
      .sort((a, b) => (a.avgResolutionHours ?? 1e9) - (b.avgResolutionHours ?? 1e9))[0];
    const busiest = [...realCards].sort((a, b) => b.open - a.open)[0];
    return { top, attention, fastest, busiest };
  }, [realCards]);

  // Top agents (by assigned) for the charts.
  const chartData = useMemo(
    () => realCards.slice(0, 8).map((c) => ({
      name: c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name,
      Open: c.open, Resolved: c.resolved, compliance: c.compliancePct,
    })),
    [realCards],
  );

  const tableCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? allCards.filter((c) => c.name.toLowerCase().includes(q)) : allCards;
    return sortScorecards(filtered, sortKey, asc);
  }, [allCards, query, sortKey, asc]);

  const sort = (key: AgentSortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(key === "name"); }
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-card" />)}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

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
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight">Team Performance</h1>
          <p className="text-[13px] text-muted-foreground">
            Agent workload, SLA health & throughput · <span className="font-semibold text-foreground/70">{companyLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents…" className="w-[220px] pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { exportScorecardsCSV(tableCards); showSuccess("Team scorecard exported"); }}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile icon={Users2} label="Agents" value={summary.agents} sub={`${summary.totalAssigned} assigned`} accent={C.violet} />
        <Tile icon={Inbox} label="Open" value={summary.totalOpen} sub={`${summary.unassignedOpen} unassigned`} accent={C.sky} />
        <Tile icon={CheckCircle2} label="Resolved" value={derived.resolved} sub="in dataset" accent={C.emerald} />
        <Tile icon={ShieldAlert} label="At Risk" value={derived.atRisk} tone={derived.atRisk > 0 ? "text-amber-600 dark:text-amber-400" : undefined} sub="< 30% SLA left" accent={C.amber} />
        <Tile icon={AlertTriangle} label="Breaches" value={summary.totalBreached} tone={summary.totalBreached > 0 ? "text-rose-600 dark:text-rose-400" : undefined} sub="all agents" accent={C.rose} />
        <Tile icon={Gauge} label="Compliance" value={`${summary.teamCompliance}%`} tone={complianceTone(summary.teamCompliance)} sub="target 95%" accent={C.emerald} />
      </div>

      {/* Highlights */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Highlight icon={Trophy} label="Top performer" accent={C.amber}
          name={highlights.top?.name ?? "—"} detail={highlights.top ? `${highlights.top.compliancePct}% compliance · ${highlights.top.resolved} resolved` : "Not enough data"} />
        <Highlight icon={Zap} label="Fastest resolver" accent={C.emerald}
          name={highlights.fastest?.name ?? "—"} detail={highlights.fastest ? `${highlights.fastest.avgResolutionHours} biz hrs avg` : "Not enough data"} />
        <Highlight icon={Flame} label="Busiest" accent={C.sky}
          name={highlights.busiest?.name ?? "—"} detail={highlights.busiest ? `${highlights.busiest.open} open tickets` : "—"} />
        <Highlight icon={ShieldAlert} label="Needs attention" accent={C.rose}
          name={highlights.attention && highlights.attention.breached > 0 ? highlights.attention.name : "All clear"}
          detail={highlights.attention && highlights.attention.breached > 0 ? `${highlights.attention.breached} SLA breach${highlights.attention.breached === 1 ? "" : "es"}` : "No breaches"} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon={TrendingUp} title="Workload by agent" sub="Open vs resolved · top 8 by volume" color={C.violet}>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }} barSize={14}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Open" stackId="a" fill={C.violet} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Resolved" stackId="a" fill={C.emerald} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel icon={Gauge} title="SLA compliance by agent" sub="Green ≥95% · amber ≥85% · red below" color={C.emerald}>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barSize={16}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="%" />
                <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }} />
                <Bar dataKey="compliance" name="compliance" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={complianceHex(d.compliance)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Scorecard table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
          <Users2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
          <div>
            <h2 className="text-[14px] font-bold">Agent Scorecard</h2>
            <p className="text-[12px] text-muted-foreground">Every assignee · click a column to sort</p>
          </div>
        </div>

        {tableCards.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">No agents match your search.</div>
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
                {tableCards.map((c) => {
                  const isUnassigned = c.name === UNASSIGNED;
                  const openMixTotal = c.open || 1;
                  return (
                    <tr key={c.name} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
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
                              {highlights.top?.name === c.name && (
                                <span title="Top performer" className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-px text-[9.5px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                                  <Trophy className="h-2.5 w-2.5" /> TOP
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Building2 className="h-3 w-3" />{c.companies}
                              {c.criticalOpen > 0 && <span className="text-rose-500"> · {c.criticalOpen} critical open</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-[13px] font-semibold tabular-nums">{c.assigned}</td>
                      <td className="px-3 py-3 text-center text-[13px] tabular-nums">{c.open}</td>
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
  );
};

const Teams = () => (
  <AppShell>
    {(props) => <TeamsBody {...props} />}
  </AppShell>
);

export default Teams;
