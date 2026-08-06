import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet, FileText, Download, ShieldCheck, Ticket as TicketIcon,
  CalendarRange, Loader2, FileDown, TrendingUp, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { COMPANY_NAME } from "@/config";
import {
  availableMonths, ticketsForMonth, buildSummary, buildSLAReport,
} from "@/lib/reportData";
import { exportTicketsXLSX, exportSLAXLSX } from "@/lib/excelReport";
import { exportSLAPDF } from "@/lib/pdfReport";
import { exportTicketsCSV } from "@/utils/export";
import { showSuccess, showError } from "@/utils/toast";

type BusyKey = "tickets-xlsx" | "tickets-csv" | "sla-xlsx" | "sla-pdf" | null;

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

const Body = ({ tickets, isLoading }: { tickets: Ticket[]; isLoading: boolean }) => {
  const months = useMemo(() => availableMonths(tickets), [tickets]);
  const [month, setMonth] = useState("all");
  const [busy, setBusy] = useState<BusyKey>(null);

  const periodLabel = month === "all"
    ? "All Time"
    : months.find((m) => m.key === month)?.label ?? "All Time";

  const scoped = useMemo(() => ticketsForMonth(tickets, month), [tickets, month]);
  const summary = useMemo(() => buildSummary(scoped, periodLabel), [scoped, periodLabel]);
  const sla = useMemo(() => buildSLAReport(scoped, periodLabel), [scoped, periodLabel]);

  const run = async (key: BusyKey, fn: () => void | Promise<void>, msg: string) => {
    try {
      setBusy(key);
      await fn();
      showSuccess(msg);
    } catch (e) {
      console.error(e);
      showError("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const fileBase = `${COMPANY_NAME}-${slug(periodLabel)}`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-3xl bg-card" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-card" />
          <div className="h-72 animate-pulse rounded-2xl bg-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header / period selector ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card animate-fade-up">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-[70px]" />
        <div className="h-[3px] w-full gradient-brand" />
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <FileDown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-black tracking-tight">Reports & Exports</h1>
                <p className="text-[13px] text-muted-foreground">
                  Download enterprise-grade ticket and SLA reports
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-10 w-[200px] rounded-xl border-border bg-background text-[13px] font-medium">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Live preview stats for selected period ───────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PreviewStat icon={TicketIcon} label="Tickets in period" value={summary.total} tint="bg-indigo-500/10 text-indigo-500" />
        <PreviewStat icon={CheckCircle2} label="Resolved" value={summary.resolved} tint="bg-emerald-500/10 text-emerald-500" />
        <PreviewStat icon={ShieldCheck} label="SLA Compliance" value={`${summary.slaCompliance}%`} tint="bg-violet-500/10 text-violet-500" />
        <PreviewStat icon={AlertTriangle} label="Breached" value={summary.breached} tint="bg-rose-500/10 text-rose-500" />
      </div>

      {/* ── Report cards ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tickets report */}
        <ReportCard
          icon={TicketIcon}
          accent="#6366f1"
          title="Tickets Report"
          subtitle="Complete ticket register with a styled dashboard cover sheet and a filterable raw-data sheet."
          bullets={[
            "Sheet 1 — Dashboard: KPIs, priority / status / department breakdown",
            "Sheet 2 — Tickets Data: every field, colour-coded priority & SLA, auto-filter",
            `Scope: ${periodLabel} · ${summary.total} tickets`,
          ]}
        >
          <Button
            onClick={() => run("tickets-xlsx", () => exportTicketsXLSX(scoped, periodLabel, `${fileBase}-tickets.xlsx`), "Tickets Excel downloaded")}
            disabled={busy !== null || summary.total === 0}
            className="h-10 flex-1 gap-2 rounded-xl bg-[#1D6F42] text-white hover:bg-[#16562f]"
          >
            {busy === "tickets-xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Download Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => run("tickets-csv", () => exportTicketsCSV(scoped, `${fileBase}-tickets.csv`), "Tickets CSV downloaded")}
            disabled={busy !== null || summary.total === 0}
            className="h-10 gap-2 rounded-xl"
          >
            {busy === "tickets-csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV
          </Button>
        </ReportCard>

        {/* SLA report */}
        <ReportCard
          icon={ShieldCheck}
          accent="#10b981"
          title="SLA Compliance Report"
          subtitle="Severity-wise SLA performance per the Aerchain SLA policy, with monthly compliance and resolution metrics."
          bullets={[
            "Per-severity: total, resolved, met, breached, compliance %, avg resolution",
            "Excel: dashboard cover + colour-graded SLA detail sheet",
            `Overall compliance: ${sla.totals.compliance}% · ${sla.totals.breached} breached`,
          ]}
        >
          <Button
            onClick={() => run("sla-xlsx", () => exportSLAXLSX(scoped, periodLabel, `${fileBase}-sla-report.xlsx`), "SLA Excel downloaded")}
            disabled={busy !== null || summary.total === 0}
            className="h-10 flex-1 gap-2 rounded-xl bg-[#1D6F42] text-white hover:bg-[#16562f]"
          >
            {busy === "sla-xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Download Excel
          </Button>
          <Button
            onClick={() => run("sla-pdf", () => exportSLAPDF(scoped, periodLabel, `${fileBase}-sla-report.pdf`), "SLA PDF downloaded")}
            disabled={busy !== null || summary.total === 0}
            className="h-10 flex-1 gap-2 rounded-xl bg-[#B3261E] text-white hover:bg-[#8f1d17]"
          >
            {busy === "sla-pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Download PDF
          </Button>
        </ReportCard>
      </div>

      {/* ── SLA preview table ────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold">SLA Performance Preview</h3>
            <p className="text-[11px] text-muted-foreground">{periodLabel} · matches the exported report</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3">Severity</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3 text-center">Total</th>
                <th className="px-3 py-3 text-center">Resolved</th>
                <th className="px-3 py-3 text-center">Met</th>
                <th className="px-3 py-3 text-center">Breached</th>
                <th className="px-3 py-3 text-center">Compliance</th>
                <th className="px-5 py-3 text-center">Avg Res.</th>
              </tr>
            </thead>
            <tbody>
              {sla.rows.map((r) => (
                <tr key={r.priority} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium">{r.severity}</td>
                  <td className="px-3 py-3 text-muted-foreground">{r.priority}</td>
                  <td className="px-3 py-3 text-center font-semibold">{r.total}</td>
                  <td className="px-3 py-3 text-center">{r.resolved}</td>
                  <td className="px-3 py-3 text-center text-emerald-600">{r.met}</td>
                  <td className={cn("px-3 py-3 text-center font-semibold", r.breached > 0 ? "text-rose-600" : "text-muted-foreground")}>{r.breached}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold",
                      r.compliance >= 90 ? "bg-emerald-500/10 text-emerald-600"
                      : r.compliance >= 75 ? "bg-amber-500/10 text-amber-600"
                      : "bg-rose-500/10 text-rose-600"
                    )}>{r.compliance}%</span>
                  </td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{r.avgResolution}</td>
                </tr>
              ))}
              <tr className="bg-secondary/40 font-bold">
                <td className="px-5 py-3">TOTAL</td>
                <td className="px-3 py-3">—</td>
                <td className="px-3 py-3 text-center">{sla.totals.total}</td>
                <td className="px-3 py-3 text-center">{sla.totals.resolved}</td>
                <td className="px-3 py-3 text-center text-emerald-600">{sla.totals.met}</td>
                <td className="px-3 py-3 text-center text-rose-600">{sla.totals.breached}</td>
                <td className="px-3 py-3 text-center">{sla.totals.compliance}%</td>
                <td className="px-5 py-3 text-center">{sla.totals.avgResolution}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PreviewStat = ({ icon: Icon, label, value, tint }: {
  icon: React.ElementType; label: string; value: string | number; tint: string;
}) => (
  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tint)}>
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <div className="text-xl font-black tracking-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  </div>
);

const ReportCard = ({ icon: Icon, accent, title, subtitle, bullets, children }: {
  icon: React.ElementType; accent: string; title: string; subtitle: string;
  bullets: string[]; children: React.ReactNode;
}) => (
  <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-start gap-3.5 p-6">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accent}15` }}>
        <Icon className="h-6 w-6" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold">{title}</h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
    </div>

    <ul className="space-y-2 px-6 pb-5">
      {bullets.map((b, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] text-foreground/80">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
          {b}
        </li>
      ))}
    </ul>

    <div className="mt-auto flex gap-2.5 border-t border-border/60 bg-secondary/20 p-4">
      {children}
    </div>
  </div>
);

const Reports = () => (
  <AppShell>
    {(props) => <Body tickets={props.tickets} isLoading={props.isLoading} />}
  </AppShell>
);

export default Reports;
