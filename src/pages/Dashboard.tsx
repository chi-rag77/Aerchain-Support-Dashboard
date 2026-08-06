import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { VerdictHero } from "@/components/dashboard/VerdictHero";
import { AssuranceTrends } from "@/components/dashboard/AssuranceTrends";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { SLABreakdownTable } from "@/components/dashboard/SLABreakdownTable";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarRange } from "lucide-react";
import { buildAssurance, complianceTrend } from "@/lib/dashboardData";
import { Ticket } from "@/types/freshdesk";

/* ── Time-range filter ──────────────────────────────────────────────────── */
type RangeKey = "7" | "30" | "60" | "90";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "60", label: "Last 60 days" },
  { key: "90", label: "Last 90 days" },
];

const Body = ({ tickets, isLoading, openTicket, companyLabel }: {
  tickets: Ticket[];
  isLoading: boolean;
  openTicket: (t: Ticket) => void;
  companyLabel: string;
}) => {
  const [range, setRange] = useState<RangeKey>("30");
  const windowDays = Number(range);

  // The reporting window drives the verdict hero and the trend charts; both
  // need the full ticket set so they can compute previous-window deltas and
  // running backlog history themselves.
  const summary = useMemo(() => buildAssurance(tickets, windowDays, companyLabel), [tickets, windowDays, companyLabel]);
  const trend = useMemo(() => complianceTrend(tickets, windowDays), [tickets, windowDays]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-72 animate-pulse rounded-3xl bg-card" />
        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  const rangeFilter = (
    <div className="flex items-center gap-2">
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
        <SelectTrigger className="h-9 w-[150px] rounded-lg border-border/60 bg-card/70 text-[13px]">
          <SelectValue placeholder="Time range" />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Zone 1 — Verdict */}
      <VerdictHero summary={summary} trend={trend} rangeFilter={rangeFilter} companyLabel={companyLabel} />

      {/* Zone 2 — Trends */}
      <AssuranceTrends tickets={tickets} windowDays={windowDays} />

      {/* Zone 3 — Attention + breakdowns */}
      <AttentionPanel tickets={tickets} onOpen={openTicket} windowDays={windowDays} />

      {/* Zone 4 — SLA detail */}
      <SLABreakdownTable tickets={tickets} windowDays={windowDays} />
    </div>
  );
};

const Dashboard = () => (
  <AppShell>
    {(props) => <Body {...props} />}
  </AppShell>
);

export default Dashboard;
