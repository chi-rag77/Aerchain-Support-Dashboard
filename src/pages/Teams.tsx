import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Users2, AlertTriangle, Gauge, Inbox, Search, Download, ArrowUp, ArrowDown,
  Trophy, Zap, Flame, CheckCircle2, TrendingUp, Building2, ShieldAlert,
  ArrowUpRight, ArrowDownRight, GitCompare, X, CalendarRange, ChevronRight, TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { initials, computeSLA, PRIORITY_META, STATUS_META } from "@/lib/tickets";
import {
  buildAgentScorecards, buildAgentSummary, sortScorecards, buildCompanyCoverage, ticketsByAgent,
  AgentScorecard, AgentSummary, AgentSortKey, UNASSIGNED,
} from "@/lib/agentData";
import { showSuccess } from "@/utils/toast";
import {
  parseISO, subDays, startOfDay, startOfMonth, subMonths, isWithinInterval,
} from "date-fns";

/* ── palette ──────────────────────────────────────────────────────────────── */
const C = { violet: "#6B4EFF", emerald: "#10b981", rose: "#f43f5e", amber: "#f59e0b", sky: "#0ea5e9", slate: "#94a3b8" };
const PRIORITY_BAR: Record<number, string> = { 4: "bg-rose-500", 3: "bg-amber-500", 2: "bg-sky-500", 1: "bg-emerald-500" };
const AGING = [
  { key: "d0_3" as const, label: "0–3d", cls: "bg-emerald-500" },
  { key: "d4_7" as const, label: "4–7d", cls: "bg-amber-500" },
  { key: "d8_30" as const, label: "8–30d", cls: "bg-orange-500" },
  { key: "d30p" as const, label: "30d+", cls: "bg-rose-500" },
];

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

/* ── time ranges ──────────────────────────────────────────────────────────── */
type RangeKey = "all" | "month" | "7" | "30" | "60" | "90";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "60", label: "Last 60 days" },
  { key: "90", label: "Last 90 days" },
];

// Returns [currentStart, currentEnd, prevStart, prevEnd] or null for "all".
const rangeWindows = (key: RangeKey, now: Date) => {
  if (key === "all") return null;
  if (key === "month") {
    const cur = startOfMonth(now);
    const prev = startOfMonth(subMonths(now, 1));
    return { curStart: cur, curEnd: now, prevStart: prev, prevEnd: cur };
  }
  const n = Number(key);
  const curStart = startOfDay(subDays(now, n - 1));
  const prevStart = startOfDay(subDays(now, n * 2 - 1));
  return { curStart, curEnd: now, prevStart, prevEnd: curStart };
};

const exportScorecardsCSV = (cards: AgentScorecard[]) => {
  const headers = ["Agent", "Assigned", "Open", "Resolved", "Breached", "Response Breaches", "Escalated", "At Risk", "Critical Open", "Customers", "Avg Resolution (biz hrs)", "Resolution Rate %", "SLA Compliance %"];
  const rows = cards.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`, c.assigned, c.open, c.resolved, c.breached, c.responseBreaches, c.escalated, c.atRisk,
    c.criticalOpen, c.companies, c.avgResolutionHours ?? "", c.resolutionRate, c.compliancePct,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.setAttribute("download", "team-scorecards.csv");
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ── tiny sparkline ───────────────────────────────────────────────────────── */
const Spark = ({ data, color = C.violet }: { data: number[]; color?: string }) => {
  const w = 72, h = 22, max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`).join(" ");
  const total = data.reduce((a, b) => a + b, 0);
  if (total === 0) return <span className="text-[11px] text-muted-foreground/50">—</span>;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/* ── delta chip ───────────────────────────────────────────────────────────── */
const Delta = ({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) => {
  if (value === null) return <span className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-400">new</span>;
  if (value === 0) return <span className="text-[10.5px] font-medium text-muted-foreground">—</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10.5px] font-bold",
      good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      <Icon className="h-3 w-3" />{Math.abs(value)}%
    </span>
  );
};

/* ── tile ─────────────────────────────────────────────────────────────────── */
const Tile = ({ icon: Icon, label, value, tone, sub, accent, delta, goodWhenUp, active, onClick }: {
  icon: React.ElementType; label: string; value: string | number; tone?: string; sub?: string;
  accent: string; delta?: number | null; goodWhenUp?: boolean; active?: boolean; onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cn(
      "rounded-2xl border bg-card p-4 text-left transition-all",
      onClick && "cursor-pointer hover:border-violet-300 hover:shadow-sm",
      active ? "border-violet-400 ring-2 ring-violet-400/30" : "border-border",
    )}
  >
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}18` }}>
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </span>
    </div>
    <div className="mt-2 flex items-end justify-between gap-2">
      <span className={cn("font-display text-[28px] font-black leading-none tracking-tight", tone)}>{value}</span>
      {delta !== undefined && <Delta value={delta} goodWhenUp={!!goodWhenUp} />}
    </div>
    {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
  </button>
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

const Panel = ({ icon: Icon, title, sub, color, children, className }: {
  icon: React.ElementType; title: string; sub: string; color: string; children: React.ReactNode; className?: string;
}) => (
  <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-card", className)}>
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

/* ── aging / mix bars ─────────────────────────────────────────────────────── */
const AgingBar = ({ c }: { c: AgentScorecard }) => {
  const total = c.open || 1;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
        {AGING.map((a) => c.aging[a.key] > 0 && (
          <div key={a.key} className={a.cls} style={{ width: `${(c.aging[a.key] / total) * 100}%` }} title={`${a.label}: ${c.aging[a.key]}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {AGING.map((a) => (
          <span key={a.key} className="flex items-center gap-1 text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", a.cls)} /> {a.label}: <b className="text-foreground">{c.aging[a.key]}</b>
          </span>
        ))}
      </div>
    </div>
  );
};

const MixList = ({ entries, total }: { entries: [string, number][]; total: number }) => (
  <div className="space-y-2">
    {entries.map(([k, v]) => (
      <div key={k}>
        <div className="mb-0.5 flex items-center justify-between text-[11.5px]">
          <span className="truncate text-foreground/80">{k}</span>
          <span className="tabular-nums text-muted-foreground">{v}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${(v / (total || 1)) * 100}%` }} />
        </div>
      </div>
    ))}
    {entries.length === 0 && <p className="text-[12px] text-muted-foreground">No data.</p>}
  </div>
);

/* ── drill-down sheet ─────────────────────────────────────────────────────── */
const AgentSheet = ({ card, tickets, onClose, onOpenTicket }: {
  card: AgentScorecard | null; tickets: Ticket[]; onClose: () => void; onOpenTicket: (t: Ticket) => void;
}) => {
  if (!card) return null;
  const list = ticketsByAgent(tickets, card.name)
    .sort((a, b) => computeSLA(a).remainingMinutes - computeSLA(b).remainingMinutes);
  const statusEntries = Object.entries(card.statusMix)
    .map(([s, v]) => [STATUS_META[Number(s)]?.label ?? `Status ${s}`, v] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const typeEntries = Object.entries(card.typeMix).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            {card.name === UNASSIGNED ? (
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">—</span>
            ) : (
              <Avatar className="h-11 w-11"><AvatarFallback className={cn("text-[13px] font-bold", avatarColor(card.name))}>{initials(card.name)}</AvatarFallback></Avatar>
            )}
            <div>
              <SheetTitle className="text-left text-[17px]">{card.name}</SheetTitle>
              <SheetDescription className="text-left">
                {card.assigned} assigned · {card.companies} customer{card.companies === 1 ? "" : "s"} · {card.compliancePct}% compliance
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* mini stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { l: "Open", v: card.open, t: "" },
              { l: "Resolved", v: card.resolved, t: "text-emerald-600 dark:text-emerald-400" },
              { l: "Breached", v: card.breached, t: card.breached ? "text-rose-600 dark:text-rose-400" : "" },
              { l: "At Risk", v: card.atRisk, t: card.atRisk ? "text-amber-600 dark:text-amber-400" : "" },
              { l: "Escalated", v: card.escalated, t: "" },
              { l: "Avg Res (h)", v: card.avgResolutionHours ?? "—", t: "" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-border bg-secondary/20 py-2.5">
                <div className={cn("font-display text-[20px] font-black", s.t)}>{s.v}</div>
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Open backlog aging</h4>
            <AgingBar c={card} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Status mix</h4>
              <MixList entries={statusEntries} total={card.assigned} />
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Work type</h4>
              <MixList entries={typeEntries} total={card.assigned} />
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Tickets ({list.length})</h4>
            <div className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
              {list.map((t) => {
                const sla = computeSLA(t);
                const p = PRIORITY_META[t.priority];
                const s = STATUS_META[t.status];
                return (
                  <button key={t.id} onClick={() => { onClose(); onOpenTicket(t); }}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-left hover:bg-secondary/40">
                    <span className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-primary/90">#{t.id}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{t.subject}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase", p?.tone)}>{p?.label}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold", s?.tone)}>{s?.label}</span>
                    <span className={cn("shrink-0 text-[10.5px] font-bold", sla.tone)}>{sla.label === "Breached" ? "Breached" : sla.remaining}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
              {list.length === 0 && <p className="text-[12px] text-muted-foreground">No tickets in range.</p>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ── compare dialog ───────────────────────────────────────────────────────── */
const COMPARE_ROWS: { label: string; get: (c: AgentScorecard) => number | string; better?: "high" | "low" }[] = [
  { label: "Assigned", get: (c) => c.assigned },
  { label: "Open", get: (c) => c.open, better: "low" },
  { label: "Resolved", get: (c) => c.resolved, better: "high" },
  { label: "Breached", get: (c) => c.breached, better: "low" },
  { label: "Response breaches", get: (c) => c.responseBreaches, better: "low" },
  { label: "Escalated", get: (c) => c.escalated, better: "low" },
  { label: "At Risk", get: (c) => c.atRisk, better: "low" },
  { label: "Critical open", get: (c) => c.criticalOpen, better: "low" },
  { label: "Avg Res (biz h)", get: (c) => c.avgResolutionHours ?? Infinity, better: "low" },
  { label: "Resolution rate", get: (c) => c.resolutionRate, better: "high" },
  { label: "SLA compliance", get: (c) => c.compliancePct, better: "high" },
];

const CompareDialog = ({ cards, open, onClose }: { cards: AgentScorecard[]; open: boolean; onClose: () => void }) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-[820px]">
      <DialogHeader><DialogTitle>Compare agents</DialogTitle></DialogHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="py-2 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Metric</th>
              {cards.map((c) => (
                <th key={c.name} className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <Avatar className="h-8 w-8"><AvatarFallback className={cn("text-[10px] font-bold", avatarColor(c.name))}>{initials(c.name)}</AvatarFallback></Avatar>
                    <span className="max-w-[120px] truncate text-[12px] font-bold">{c.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => {
              const vals = cards.map((c) => row.get(c));
              const nums = vals.filter((v) => typeof v === "number" && isFinite(v as number)) as number[];
              const best = row.better ? (row.better === "high" ? Math.max(...nums) : Math.min(...nums)) : null;
              return (
                <tr key={row.label} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pr-3 text-muted-foreground">{row.label}</td>
                  {cards.map((c, i) => {
                    const v = vals[i];
                    const isBest = best !== null && typeof v === "number" && isFinite(v) && v === best && nums.length > 1;
                    const display = v === Infinity ? "—" : v;
                    return (
                      <td key={c.name} className={cn("px-3 py-2.5 text-center tabular-nums font-semibold",
                        isBest && "text-emerald-600 dark:text-emerald-400")}>
                        {display}{row.label === "SLA compliance" || row.label === "Resolution rate" ? "%" : ""}
                        {isBest && <Trophy className="ml-1 inline h-3 w-3" />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DialogContent>
  </Dialog>
);

/* ── company coverage heatmap ─────────────────────────────────────────────── */
const CoveragePanel = ({ tickets }: { tickets: Ticket[] }) => {
  const cov = useMemo(() => buildCompanyCoverage(tickets), [tickets]);
  if (!cov.rows.length || !cov.companies.length) return null;
  const rows = cov.rows.slice(0, 12);
  const heat = (v: number) => (v === 0 ? "transparent" : `rgba(107,78,255,${0.12 + 0.78 * (v / cov.max)})`);
  return (
    <Panel icon={Building2} title="Company coverage" sub="Tickets handled per agent × customer" color={C.sky}>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-card px-2 py-1 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Agent</th>
              {cov.companies.map((co) => (
                <th key={co} className="px-1 py-1 text-[10px] font-medium text-muted-foreground">
                  <div className="mx-auto max-w-[70px] truncate" title={co}>{co}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent}>
                <td className="sticky left-0 bg-card px-2 py-1 text-[11.5px] font-medium">
                  <span className="block max-w-[130px] truncate">{r.agent}</span>
                </td>
                {cov.companies.map((co) => {
                  const v = r.counts[co] ?? 0;
                  return (
                    <td key={co} className="p-0">
                      <div className="mx-auto flex h-7 w-[52px] items-center justify-center rounded text-[11px] font-semibold tabular-nums"
                        style={{ backgroundColor: heat(v), color: v > cov.max * 0.6 ? "#fff" : "inherit" }}
                        title={`${r.agent} · ${co}: ${v}`}>
                        {v || ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

/* ── body ─────────────────────────────────────────────────────────────────── */
type TileFilter = "none" | "open" | "breached" | "atrisk" | "escalated";

const TeamsBody = ({ tickets, isLoading, openTicket, companyLabel }: {
  tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void; companyLabel: string;
}) => {
  const [range, setRange] = useState<RangeKey>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<AgentSortKey>("assigned");
  const [asc, setAsc] = useState(false);
  const [tileFilter, setTileFilter] = useState<TileFilter>("none");
  const [drill, setDrill] = useState<AgentScorecard | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const win = useMemo(() => rangeWindows(range, now), [range, now]);

  // Cohort by created_at within the selected window (all tickets when "all").
  const scoped = useMemo(() => {
    if (!win) return tickets;
    return tickets.filter((t) => isWithinInterval(parseISO(t.created_at), { start: win.curStart, end: win.curEnd }));
  }, [tickets, win]);
  const prevScoped = useMemo(() => {
    if (!win) return [];
    return tickets.filter((t) => isWithinInterval(parseISO(t.created_at), { start: win.prevStart, end: win.prevEnd }));
  }, [tickets, win]);

  const allCards = useMemo(() => buildAgentScorecards(scoped), [scoped]);
  const summary = useMemo(() => buildAgentSummary(allCards), [allCards]);
  const prevSummary = useMemo<AgentSummary | null>(
    () => (win ? buildAgentSummary(buildAgentScorecards(prevScoped)) : null),
    [prevScoped, win],
  );
  const realCards = useMemo(() => allCards.filter((c) => c.name !== UNASSIGNED), [allCards]);

  const derived = useMemo(() => {
    const withAvg = realCards.filter((c) => c.avgResolutionHours != null);
    const avgRes = withAvg.length ? Math.round((withAvg.reduce((s, c) => s + (c.avgResolutionHours ?? 0), 0) / withAvg.length) * 10) / 10 : null;
    return { avgRes };
  }, [realCards]);

  const delta = (cur: number, prev: number | undefined): number | null => {
    if (prev === undefined) return undefined as unknown as number | null;
    if (prev === 0) return cur === 0 ? 0 : null;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const highlights = useMemo(() => {
    const eligible = realCards.filter((c) => c.resolved >= 3);
    const top = [...eligible].sort((a, b) => b.compliancePct - a.compliancePct || b.resolved - a.resolved)[0];
    const attention = [...realCards].sort((a, b) => b.breached - a.breached)[0];
    const fastest = [...realCards.filter((c) => c.avgResolutionHours != null && c.resolved >= 3)]
      .sort((a, b) => (a.avgResolutionHours ?? 1e9) - (b.avgResolutionHours ?? 1e9))[0];
    const busiest = [...realCards].sort((a, b) => b.open - a.open)[0];
    return { top, attention, fastest, busiest };
  }, [realCards]);

  const chartData = useMemo(
    () => realCards.slice(0, 8).map((c) => ({
      name: c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name,
      Open: c.open, Resolved: c.resolved, compliance: c.compliancePct,
    })),
    [realCards],
  );

  const tableCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = q ? allCards.filter((c) => c.name.toLowerCase().includes(q)) : allCards;
    if (tileFilter === "open") filtered = filtered.filter((c) => c.open > 0);
    else if (tileFilter === "breached") filtered = filtered.filter((c) => c.breached > 0);
    else if (tileFilter === "atrisk") filtered = filtered.filter((c) => c.atRisk > 0);
    else if (tileFilter === "escalated") filtered = filtered.filter((c) => c.escalated > 0);
    return sortScorecards(filtered, sortKey, asc);
  }, [allCards, query, sortKey, asc, tileFilter]);

  const selectedCards = useMemo(() => allCards.filter((c) => selected.has(c.name)), [allCards, selected]);

  const sort = (key: AgentSortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(key === "name"); }
  };
  const toggleTile = (f: TileFilter) => setTileFilter((cur) => (cur === f ? "none" : f));
  const toggleSelect = (name: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(name)) n.delete(name);
    else if (n.size < 3) n.add(name);
    return n;
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-card" />)}</div>
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
            {win && <span className="text-muted-foreground"> · tickets created in period</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="h-9 w-[140px] border-0 bg-transparent px-1 text-[13px] shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents…" className="w-[200px] pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { exportScorecardsCSV(tableCards); showSuccess("Team scorecard exported"); }}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* KPI tiles (clickable ones filter the table) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile icon={Users2} label="Agents" value={summary.agents} sub={`${summary.totalAssigned} assigned`} accent={C.violet}
          delta={delta(summary.totalAssigned, prevSummary?.totalAssigned)} goodWhenUp />
        <Tile icon={Inbox} label="Open" value={summary.totalOpen} sub={`${summary.unassignedOpen} unassigned`} accent={C.sky}
          active={tileFilter === "open"} onClick={() => toggleTile("open")} />
        <Tile icon={CheckCircle2} label="Resolved" value={summary.totalResolved} sub={win ? "in period" : "in dataset"} accent={C.emerald}
          delta={delta(summary.totalResolved, prevSummary?.totalResolved)} goodWhenUp />
        <Tile icon={ShieldAlert} label="At Risk" value={summary.totalAtRisk} tone={summary.totalAtRisk > 0 ? "text-amber-600 dark:text-amber-400" : undefined} sub="< 30% SLA left" accent={C.amber}
          active={tileFilter === "atrisk"} onClick={() => toggleTile("atrisk")} />
        <Tile icon={AlertTriangle} label="Breaches" value={summary.totalBreached} tone={summary.totalBreached > 0 ? "text-rose-600 dark:text-rose-400" : undefined} sub="click to filter" accent={C.rose}
          delta={delta(summary.totalBreached, prevSummary?.totalBreached)} goodWhenUp={false}
          active={tileFilter === "breached"} onClick={() => toggleTile("breached")} />
        <Tile icon={Gauge} label="Compliance" value={`${summary.teamCompliance}%`} tone={complianceTone(summary.teamCompliance)} sub="target 95%" accent={C.emerald}
          delta={delta(summary.teamCompliance, prevSummary?.teamCompliance)} goodWhenUp />
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
                <Bar dataKey="Open" stackId="a" fill={C.violet} />
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

      {/* Company coverage heatmap */}
      <CoveragePanel tickets={scoped} />

      {/* Scorecard table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Users2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">Agent Scorecard</h2>
              <p className="text-[12px] text-muted-foreground">
                Click a row for details · select up to 3 to compare
                {tileFilter !== "none" && <span className="ml-1 text-violet-600 dark:text-violet-300">· filtered: {tileFilter}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tileFilter !== "none" && (
              <Button variant="ghost" size="sm" onClick={() => setTileFilter("none")}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear filter
              </Button>
            )}
            {selected.size >= 2 && (
              <Button size="sm" onClick={() => setCompareOpen(true)}>
                <GitCompare className="mr-2 h-4 w-4" /> Compare ({selected.size})
              </Button>
            )}
          </div>
        </div>

        {tableCards.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">No agents match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 text-left">
                  <th className="w-9 pl-5" />
                  <Th k="name" label="Agent" />
                  <Th k="assigned" label="Assigned" className="text-center" />
                  <Th k="open" label="Open" className="text-center" />
                  <th className="px-3 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Open mix</th>
                  <Th k="resolved" label="Resolved" className="text-center" />
                  <th className="px-3 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Trend</th>
                  <Th k="breached" label="Breached" className="text-center" />
                  <Th k="escalated" label="Escal." className="text-center" />
                  <Th k="atRisk" label="At Risk" className="text-center" />
                  <Th k="avgResolutionHours" label="Avg Res" className="text-center" />
                  <Th k="compliancePct" label="SLA Compliance" className="pr-5" />
                </tr>
              </thead>
              <tbody>
                {tableCards.map((c) => {
                  const isUnassigned = c.name === UNASSIGNED;
                  const openMixTotal = c.open || 1;
                  const isSel = selected.has(c.name);
                  return (
                    <tr key={c.name} onClick={() => setDrill(c)}
                      className="group cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/30">
                      <td className="pl-5" onClick={(e) => e.stopPropagation()}>
                        {!isUnassigned && (
                          <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(c.name)}
                            disabled={!isSel && selected.size >= 3}
                            aria-label={`Select ${c.name}`}
                            className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=checked]:opacity-100" />
                        )}
                      </td>
                      <td className="py-3 pr-3">
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
                        <div className="flex h-1.5 w-[84px] overflow-hidden rounded-full bg-secondary">
                          {([4, 3, 2, 1] as const).map((p) => (
                            c.openByPriority[p] > 0 && (
                              <div key={p} className={PRIORITY_BAR[p]} style={{ width: `${(c.openByPriority[p] / openMixTotal) * 100}%` }} title={`P${p}: ${c.openByPriority[p]}`} />
                            )
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-[13px] tabular-nums">{c.resolved}</td>
                      <td className="px-3 py-3"><Spark data={c.spark} color={C.emerald} /></td>
                      <td className={cn("px-3 py-3 text-center text-[13px] font-semibold tabular-nums", c.breached > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                        {c.breached}
                        {c.responseBreaches > 0 && <div className="text-[9.5px] font-medium text-amber-600 dark:text-amber-400" title="First-response SLA breaches">FR {c.responseBreaches}</div>}
                      </td>
                      <td className={cn("px-3 py-3 text-center text-[13px] tabular-nums", c.escalated > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
                        <span className="inline-flex items-center gap-1">{c.escalated > 0 && <TriangleAlert className="h-3 w-3" />}{c.escalated}</span>
                      </td>
                      <td className={cn("px-3 py-3 text-center text-[13px] tabular-nums", c.atRisk > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{c.atRisk}</td>
                      <td className="px-3 py-3 text-center text-[13px] tabular-nums text-muted-foreground">{c.avgResolutionHours ?? "—"}</td>
                      <td className="py-3 pl-3 pr-5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-[72px] overflow-hidden rounded-full bg-secondary">
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

      <AgentSheet card={drill} tickets={scoped} onClose={() => setDrill(null)} onOpenTicket={openTicket} />
      <CompareDialog cards={selectedCards} open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  );
};

const Teams = () => (
  <AppShell>
    {(props) => <TeamsBody {...props} />}
  </AppShell>
);

export default Teams;
