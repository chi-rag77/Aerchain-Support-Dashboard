import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Table2, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticket } from "@/types/freshdesk";
import { buildSLAReport } from "@/lib/reportData";
import { windowedTickets, WINDOW_DAYS } from "@/lib/dashboardData";

export const SLABreakdownTable = ({ tickets, windowDays = WINDOW_DAYS }: {
  tickets: Ticket[];
  windowDays?: number;
}) => {
  const report = useMemo(() => {
    const scoped = windowedTickets(tickets, windowDays);
    return buildSLAReport(scoped, `Last ${windowDays} days`);
  }, [tickets, windowDays]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10">
            <Table2 className="h-4 w-4 text-violet-500" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold">SLA Performance by Severity</h3>
            <p className="text-[11px] text-muted-foreground">Matches the downloadable report</p>
          </div>
        </div>
        <Link to="/reports" className="inline-flex items-center gap-1.5 rounded-lg bg-primary/8 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15">
          <FileDown className="h-3.5 w-3.5" /> Export
        </Link>
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
            {report.rows.map((r) => (
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
              <td className="px-3 py-3 text-center">{report.totals.total}</td>
              <td className="px-3 py-3 text-center">{report.totals.resolved}</td>
              <td className="px-3 py-3 text-center text-emerald-600">{report.totals.met}</td>
              <td className="px-3 py-3 text-center text-rose-600">{report.totals.breached}</td>
              <td className="px-3 py-3 text-center">{report.totals.compliance}%</td>
              <td className="px-5 py-3 text-center">{report.totals.avgResolution}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
