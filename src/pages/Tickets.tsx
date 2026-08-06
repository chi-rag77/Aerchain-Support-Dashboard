import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Download, X, CheckCircle2, UserPlus, Trash2,
  SlidersHorizontal, AlertTriangle, ShieldCheck, Inbox, Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { computeSLA, computeMetrics } from "@/lib/tickets";
import { exportTicketsCSV } from "@/utils/export";
import { showSuccess } from "@/utils/toast";

type TabKey = "all" | "open" | "attention" | "breached" | "resolved";

/* ── KPI card ─────────────────────────────────────────────────────────── */
const Kpi = ({
  icon: Icon, label, value, accent, glow,
}: {
  icon: React.ElementType; label: string; value: number;
  accent: string; glow: string;
}) => (
  <div className="group relative flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 backdrop-blur-sm transition-all hover:border-border hover:shadow-[0_8px_28px_-12px_rgba(16,24,40,0.18)]">
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", accent, glow)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 leading-none mb-1.5">
        {label}
      </div>
      <div className="font-display text-[22px] font-bold leading-none tabular-nums text-foreground">
        {value}
      </div>
    </div>
  </div>
);

const Body = ({ tickets, isLoading, openTicket, companyLabel }: {
  tickets: Ticket[]; isLoading: boolean; openTicket: (t: Ticket) => void; companyLabel: string;
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const m = useMemo(() => computeMetrics(tickets), [tickets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tickets.filter((t) => {
      if (q && !(
        t.subject.toLowerCase().includes(q) ||
        String(t.id).includes(q) ||
        t.responder_name?.toLowerCase().includes(q) ||
        t.requester_name?.toLowerCase().includes(q) ||
        t.tags.some((x) => x.toLowerCase().includes(q))
      )) return false;
      if (priority !== "all" && String(t.priority) !== priority) return false;
      if (status !== "all" && String(t.status) !== status) return false;
      const sla = computeSLA(t).state;
      switch (tab) {
        case "open": return ![4, 5].includes(t.status);
        case "attention": return sla === "attention";
        case "breached": return sla === "breached";
        case "resolved": return [4, 5].includes(t.status);
        default: return true;
      }
    });
  }, [tickets, search, tab, priority, status]);

  const tabs: { key: TabKey; label: string; count: number; dot: string }[] = [
    { key: "all", label: "All", count: tickets.length, dot: "bg-primary" },
    { key: "open", label: "Open", count: m.open, dot: "bg-blue-500" },
    { key: "attention", label: "Attention", count: m.attention, dot: "bg-amber-500" },
    { key: "breached", label: "Breached", count: m.breached, dot: "bg-rose-500" },
    { key: "resolved", label: "Resolved", count: m.resolved, dot: "bg-emerald-500" },
  ];

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const toggleAll = (ids: number[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const all = ids.every((id) => n.has(id));
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });

  const activeFilterCount = (priority !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);
  const hasFilters = search || activeFilterCount > 0 || tab !== "all";

  return (
    <div className="space-y-5">

      {/* ── Header row: title + KPIs ─────────────────────────────────── */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-[26px] font-extrabold tracking-tight text-foreground">
              Support Tickets
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary ring-1 ring-primary/15">
              {companyLabel}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Live Freshdesk sync · <span className="font-semibold text-foreground/70">{tickets.length}</span> tickets tracked
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Kpi icon={AlertTriangle} label="Breached" value={m.breached}
            accent="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
            glow="shadow-[0_4px_14px_-4px_rgba(244,63,94,0.4)]" />
          <Kpi icon={Hourglass} label="Attention" value={m.attention}
            accent="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
            glow="shadow-[0_4px_14px_-4px_rgba(245,158,11,0.4)]" />
          <Kpi icon={Inbox} label="Open" value={m.open}
            accent="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
            glow="shadow-[0_4px_14px_-4px_rgba(59,130,246,0.4)]" />
          <Kpi icon={ShieldCheck} label="Resolved" value={m.resolved}
            accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
            glow="shadow-[0_4px_14px_-4px_rgba(16,185,129,0.4)]" />
        </div>
      </div>

      {/* ── Main surface ─────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets, requesters, agents…"
                className="h-10 rounded-xl border-border/60 bg-secondary/40 pl-9 text-[13px] placeholder:text-muted-foreground/60 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/15"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="outline" size="sm"
              className={cn(
                "h-10 gap-1.5 rounded-xl border-border/60 text-[13px] font-medium",
                showFilters && "border-primary/40 bg-primary/5 text-primary"
              )}
              onClick={() => setShowFilters(v => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {hasFilters && (
              <Button
                variant="ghost" size="sm"
                className="h-10 gap-1 rounded-xl text-[13px] text-muted-foreground hover:text-foreground"
                onClick={() => { setSearch(""); setPriority("all"); setStatus("all"); setTab("all"); }}
              >
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              className="h-10 gap-1.5 rounded-xl border-border/60 text-[13px] font-medium"
              onClick={() => exportTicketsCSV(filtered)}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* Expandable filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-secondary/25 px-4 py-3">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Refine</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-9 w-[150px] rounded-lg border-border/60 bg-card text-[13px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="4">🔴 Critical</SelectItem>
                <SelectItem value="3">🟠 High</SelectItem>
                <SelectItem value="2">🔵 Medium</SelectItem>
                <SelectItem value="1">🟢 Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[150px] rounded-lg border-border/60 bg-card text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="2">Open</SelectItem>
                <SelectItem value="3">Pending</SelectItem>
                <SelectItem value="4">Resolved</SelectItem>
                <SelectItem value="5">Closed</SelectItem>
                <SelectItem value="7">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Segmented tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/50 px-3 py-2.5">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-150",
                  active
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full transition-transform",
                  t.dot,
                  active && "scale-125"
                )} />
                {t.label}
                <span className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  active ? "bg-background/20 text-background" : "bg-secondary text-muted-foreground group-hover:bg-card"
                )}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between border-b border-primary/15 bg-primary/[0.04] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15 text-[11px] font-bold text-primary">
                {selected.size}
              </span>
              <span className="text-[13px] font-medium text-foreground/80">selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={() => { showSuccess("Assigned"); setSelected(new Set()); }}>
                <UserPlus className="h-3 w-3" /> Assign
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={() => { showSuccess("Marked resolved"); setSelected(new Set()); }}>
                <CheckCircle2 className="h-3 w-3" /> Resolve
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg text-xs text-muted-foreground"
                onClick={() => setSelected(new Set())}>
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-secondary/40 animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        ) : (
          <TicketsTable
            tickets={filtered}
            onRowClick={openTicket}
            selectable
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        )}
      </div>
    </div>
  );
};

const Tickets = () => (
  <AppShell>
    {(props) => <Body {...props} />}
  </AppShell>
);

export default Tickets;
