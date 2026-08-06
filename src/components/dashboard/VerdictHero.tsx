import { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  CheckCircle2, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AssuranceSummary, CompliancePoint, SLA_TARGET,
} from "@/lib/dashboardData";
import { COMPANY_NAME } from "@/config";

interface Props {
  summary: AssuranceSummary;
  trend: CompliancePoint[];
  /** Optional control (e.g. time-range filter) rendered in the header's top-right. */
  rangeFilter?: ReactNode;
  /** Active customer label ("All customers" or a specific name). */
  companyLabel?: string;
}

const verdictTheme = {
  healthy: { color: "#10b981", soft: "bg-emerald-500/10", ring: "text-emerald-500", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, label: "On Track", tint: "16,185,129" },
  watch:   { color: "#f59e0b", soft: "bg-amber-500/10",   ring: "text-amber-500",   text: "text-amber-600 dark:text-amber-400",   icon: AlertTriangle, label: "Monitoring", tint: "245,158,11" },
  at_risk: { color: "#f97316", soft: "bg-orange-500/10",  ring: "text-orange-500",  text: "text-orange-600 dark:text-orange-400", icon: ShieldAlert,  label: "Focus Area", tint: "249,115,22" },
};

/* ── Radial SLA gauge ───────────────────────────────────────────────────── */
const Gauge = ({ value, color }: { value: number; color: string }) => {
  const size = 180, stroke = 13, r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * C;

  // target notch position (start at top, clockwise)
  const a = (SLA_TARGET / 100) * 2 * Math.PI - Math.PI / 2;
  const cx = size / 2, cy = size / 2;
  const inner = r - stroke / 2 - 2, outer = r + stroke / 2 + 2;
  const tx1 = cx + inner * Math.cos(a), ty1 = cy + inner * Math.sin(a);
  const tx2 = cx + outer * Math.cos(a), ty2 = cy + outer * Math.sin(a);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
        {/* target tick */}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={2.5} strokeLinecap="round" className="rotate-90" style={{ transformOrigin: "center" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[44px] font-black leading-none tracking-tight" style={{ color }}>
          {pct}<span className="text-2xl">%</span>
        </span>
        <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">SLA Compliance</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">Target {SLA_TARGET}%</span>
      </div>
    </div>
  );
};

export const VerdictHero = ({ summary, trend, rangeFilter, companyLabel = COMPANY_NAME }: Props) => {
  const t = verdictTheme[summary.verdict];
  const Icon = t.icon;
  const total = summary.ballInCourt.aerchain + summary.ballInCourt.nse;
  const aerchainPct = total ? (summary.ballInCourt.aerchain / total) * 100 : 0;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-border bg-card animate-fade-up"
      style={{ background: `radial-gradient(120% 120% at 100% 0%, rgba(${t.tint},0.07) 0%, transparent 45%), hsl(var(--card))` }}
    >
      <div className="p-6 md:p-8">
        {/* ── Header row ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", t.soft)}>
            <Icon className="h-5.5 w-5.5" style={{ color: t.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider", t.soft, t.text)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                {t.label}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">· {summary.windowLabel}</span>
            </div>
            <h1 className="mt-2 max-w-3xl font-display text-[21px] font-bold leading-snug tracking-tight text-foreground md:text-[25px]">
              {summary.statement}
            </h1>
          </div>
          {rangeFilter && <div className="shrink-0">{rangeFilter}</div>}
        </div>

        {/* ── Body: gauge + metrics ──────────────────────────────────── */}
        <div className="mt-8 grid items-center gap-8 lg:grid-cols-[auto_1fr] lg:gap-12">
          {/* Gauge */}
          <div className="flex items-center justify-center lg:justify-start">
            <div className="flex items-center gap-5">
              <Gauge value={summary.slaCompliance} color={t.color} />
              <div className="hidden flex-col gap-1 sm:flex">
                <Delta value={summary.slaDelta} unit="pts" goodWhenUp />
                <span className="max-w-[120px] text-[11px] leading-snug text-muted-foreground">
                  vs previous {summary.windowDays} days
                </span>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* KPI strip */}
            <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border/70 sm:grid-cols-4">
              {summary.pulse.map((p, i) => (
                <div
                  key={p.key}
                  className={cn(
                    "p-4",
                    i % 2 === 0 && "border-r border-border/60",
                    i < 2 && "border-b border-border/60 sm:border-b-0",
                    i === 1 && "sm:border-r sm:border-border/60",
                    i === 2 && "sm:border-r sm:border-border/60",
                  )}
                >
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{p.label}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="font-display text-[26px] font-black leading-none tracking-tight">{p.value.toLocaleString()}</span>
                    <Delta value={p.delta} unit="%" goodWhenUp={p.goodWhenUp} small />
                  </div>
                </div>
              ))}
            </div>

            {/* Ball in court + sparkline */}
            <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-border/70 p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ball in court</span>
                  <span className="text-[11px] font-medium text-muted-foreground">{total} open</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-l-full bg-violet-500 transition-all" style={{ width: `${aerchainPct}%` }} />
                  <div className="h-full bg-sky-400 transition-all" style={{ width: `${100 - aerchainPct}%` }} />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    <span className="font-bold text-foreground">{summary.ballInCourt.aerchain}</span>
                    <span className="text-muted-foreground">Aerchain</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{companyLabel}</span>
                    <span className="font-bold text-foreground">{summary.ballInCourt.nse}</span>
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                  </span>
                </div>
              </div>

              <div className="flex flex-col rounded-2xl border border-border/70 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">30-day trend</span>
                <div className="mt-1 h-12 w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                      <defs>
                        <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={t.color} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={t.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="compliance" stroke={t.color} strokeWidth={2} fill="url(#heroSpark)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Delta = ({ value, unit, goodWhenUp, small }: {
  value: number | null; unit: string; goodWhenUp: boolean; small?: boolean;
}) => {
  const base = cn(
    "inline-flex w-fit items-center gap-0.5 rounded-full px-2 py-0.5 font-bold",
    small ? "text-[10px]" : "text-[11px]",
  );
  if (value === null) {
    return <span className={cn(base, "bg-secondary text-muted-foreground")}>new</span>;
  }
  if (value === 0) {
    return <span className={cn(base, "bg-secondary text-muted-foreground")}><Minus className="h-3 w-3" /> 0{unit}</span>;
  }
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={cn(base, good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{value}{unit}
    </span>
  );
};
