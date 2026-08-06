import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Clock3, ArrowRight, Tag, Boxes, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { computeSLA, PRIORITY_META } from "@/lib/tickets";
import {
  atRiskTickets, categoryBreakdown, moduleBreakdown, windowedTickets, WINDOW_DAYS,
} from "@/lib/dashboardData";

const BreakdownList = ({ icon: Icon, title, color, data }: {
  icon: React.ElementType; title: string; color: string;
  data: { label: string; count: number; pct: number }[];
}) => (
  <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <h3 className="text-[13px] font-bold">{title}</h3>
    </div>
    <div className="flex-1 space-y-3 p-5">
      {data.length === 0 && <p className="text-[12px] text-muted-foreground">No data.</p>}
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="truncate pr-2 text-foreground/85">{d.label}</span>
            <span className="shrink-0 text-muted-foreground"><span className="font-bold text-foreground">{d.count}</span> · {d.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: color }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const AttentionPanel = ({ tickets, onOpen, windowDays = WINDOW_DAYS }: {
  tickets: Ticket[];
  onOpen: (t: Ticket) => void;
  windowDays?: number;
}) => {
  // Scope every section to the selected reporting window so they refresh with
  // the dashboard date-range filter.
  const scoped = useMemo(() => windowedTickets(tickets, windowDays), [tickets, windowDays]);
  const atRisk = useMemo(() => atRiskTickets(scoped), [scoped]);
  const categories = useMemo(() => categoryBreakdown(scoped), [scoped]);
  const modules = useMemo(() => moduleBreakdown(scoped), [scoped]);

  const breached = scoped.filter((t) => computeSLA(t).state === "breached").length;
  const attention = scoped.filter((t) => computeSLA(t).state === "attention").length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Attention */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold">Needs Attention</h3>
              <p className="text-[11px] text-muted-foreground">
                {breached} breached · {attention} at risk
              </p>
            </div>
          </div>
          <Link to="/tickets" className="inline-flex items-center gap-1 rounded-lg bg-primary/8 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15">
            View <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="flex-1 divide-y divide-border/60">
          {atRisk.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <div className="text-[13px] font-semibold text-emerald-600">Nothing at risk</div>
              <div className="text-[11px] text-muted-foreground">All tickets within SLA</div>
            </div>
          )}
          {atRisk.map((t) => {
            const sla = computeSLA(t);
            const p = PRIORITY_META[t.priority] ?? { label: String(t.priority), tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-secondary/50"
              >
                <div className={cn("h-9 w-1 shrink-0 rounded-full", p.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-primary">#{t.id}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", p.tone)}>{p.label}</span>
                  </div>
                  <p className="truncate text-[12.5px] font-semibold group-hover:text-primary">{t.subject}</p>
                </div>
                <div className={cn("flex shrink-0 items-center gap-1 text-[11px] font-bold", sla.tone)}>
                  <Clock3 className="h-3 w-3" />
                  {sla.state === "breached" ? "Overdue" : sla.remaining}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <BreakdownList icon={Tag} title="By Issue Type" color="#8b5cf6" data={categories} />
      <BreakdownList icon={Boxes} title="By Module" color="#0ea5e9" data={modules} />
    </div>
  );
};
