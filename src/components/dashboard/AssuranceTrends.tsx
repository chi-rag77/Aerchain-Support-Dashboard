import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, AreaChart,
} from "recharts";
import { Activity, LineChart as LineIcon, Timer, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import {
  backlogTrend, complianceTrend, resolutionVsTarget, severityMix,
  SLA_TARGET, WINDOW_DAYS,
} from "@/lib/dashboardData";
import { useMemo } from "react";

const Panel = ({ icon: Icon, title, sub, color, children }: {
  icon: React.ElementType; title: string; sub: string; color: string; children: React.ReactNode;
}) => (
  <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div>
        <h3 className="text-[13px] font-bold">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
    {children}
  </div>
);

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-[11px] shadow-xl">
      <p className="mb-1.5 font-bold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span className="capitalize text-muted-foreground">{p.name}:</span>
          <span className="font-bold text-foreground">{p.value}{p.name === "compliance" ? "%" : ""}</span>
        </div>
      ))}
    </div>
  );
};

export const AssuranceTrends = ({ tickets, windowDays = WINDOW_DAYS }: {
  tickets: Ticket[]; windowDays?: number;
}) => {
  const backlog = useMemo(() => backlogTrend(tickets, windowDays), [tickets, windowDays]);
  const compliance = useMemo(() => complianceTrend(tickets, windowDays), [tickets, windowDays]);
  const resolution = useMemo(() => resolutionVsTarget(tickets, windowDays), [tickets, windowDays]);
  const severity = useMemo(() => severityMix(tickets, windowDays), [tickets, windowDays]);
  const sevTotal = severity.reduce((s, x) => s + x.count, 0);
  // Show ~5 evenly spaced date ticks regardless of window length.
  const tickInterval = Math.max(0, Math.floor(windowDays / 5));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

      {/* Backlog trend */}
      <Panel icon={Activity} title="Backlog Trend" sub="Created vs resolved · net open backlog" color="#6366f1">
        <div className="h-[240px] p-5">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={backlog} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} interval={tickInterval} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="created" name="created" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={10} fillOpacity={0.85} />
              <Bar dataKey="resolved" name="resolved" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={10} fillOpacity={0.85} />
              <Line type="monotone" dataKey="backlog" name="backlog" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[["#6366f1", "Created"], ["#10b981", "Resolved"], ["#f59e0b", "Open backlog"]]} />
      </Panel>

      {/* Compliance over time */}
      <Panel icon={LineIcon} title="SLA Compliance Over Time" sub={`7-day rolling vs ${SLA_TARGET}% target`} color="#10b981">
        <div className="h-[240px] p-5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={compliance} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="compTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} interval={tickInterval} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[Math.min(70, ...compliance.map((c) => c.compliance)) - 5, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={SLA_TARGET} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={0.7} />
              <Area type="monotone" dataKey="compliance" name="compliance" stroke="#10b981" strokeWidth={2.5} fill="url(#compTrendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[["#10b981", "Compliance"], ["#f43f5e", `Target ${SLA_TARGET}%`]]} />
      </Panel>

      {/* Resolution vs target */}
      <Panel icon={Timer} title="Resolution Time vs SLA Target" sub="Average resolution by severity (hours)" color="#f59e0b">
        <div className="space-y-4 p-5">
          {resolution.map((r) => {
            const ratio = r.targetHours ? Math.min(100, (r.avgHours / r.targetHours) * 100) : 0;
            const ok = r.withinTarget;
            return (
              <div key={r.priority}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-semibold">{r.priority}</span>
                  <span className="text-muted-foreground">
                    <span className={cn("font-bold", ok ? "text-emerald-600" : "text-rose-600")}>
                      {r.count ? `${r.avgHours}h` : "—"}
                    </span>
                    {" / "}{r.targetHours}h target
                  </span>
                </div>
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full transition-all", ok ? "bg-emerald-500" : "bg-rose-500")}
                    style={{ width: `${r.count ? Math.max(3, ratio) : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-[10.5px] text-muted-foreground/70">
            Bars show average resolution as a share of the SLA target. Green = within target.
          </p>
        </div>
      </Panel>

      {/* Severity mix */}
      <Panel icon={Layers} title="Severity Mix" sub="Ticket distribution by priority" color="#8b5cf6">
        <div className="space-y-3.5 p-5">
          {severity.map((s) => {
            const pct = sevTotal ? Math.round((s.count / sevTotal) * 100) : 0;
            return (
              <div key={s.priority}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.priority}
                  </span>
                  <span className="text-muted-foreground"><span className="font-bold text-foreground">{s.count}</span> · {pct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
};

const Legend = ({ items }: { items: [string, string][] }) => (
  <div className="flex items-center gap-5 border-t border-border/60 bg-secondary/20 px-5 py-2.5">
    {items.map(([color, label]) => (
      <div key={label} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {label}
      </div>
    ))}
  </div>
);
