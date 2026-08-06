import { useEffect, useState } from "react";
import { Loader2, ScrollText, CheckCircle2, XCircle, Clock3, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/services/supabase";
import { triggerSync } from "@/services/freshdesk";
import { showSuccess, showError } from "@/utils/toast";
import { format, formatDistanceToNow } from "date-fns";

interface SyncRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  tickets_synced: number;
  conversations_synced: number;
  error: string | null;
}

const AdminLogs = () => {
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    setLoading(true);
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) showError(error.message);
    else setRows((data as SyncRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const onSyncNow = async () => {
    setSyncing(true);
    const res = await triggerSync();
    setSyncing(false);
    if (res.ok) { showSuccess("Sync triggered"); refresh(); }
    else showError(res.error ?? "Sync failed");
  };

  const statusMeta = (s: string) =>
    s === "success" ? { icon: CheckCircle2, cls: "text-emerald-600", label: "Success" }
    : s === "error" ? { icon: XCircle, cls: "text-rose-600", label: "Failed" }
    : { icon: Clock3, cls: "text-amber-600", label: "Running" };

  const duration = (r: SyncRow) =>
    r.finished_at ? `${Math.max(1, Math.round((+new Date(r.finished_at) - +new Date(r.started_at)) / 1000))}s` : "—";

  return (
    <AdminShell>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ScrollText className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">Freshdesk Sync Logs</h2>
              <p className="text-[12px] text-muted-foreground">Most recent {rows.length} sync runs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" onClick={onSyncNow} disabled={syncing}>
              {syncing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing…</> : "Sync now"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading logs…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">No sync runs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3">Status</th>
                  <th className="px-3 py-3">Started</th>
                  <th className="px-3 py-3 text-center">Duration</th>
                  <th className="px-3 py-3 text-center">Tickets</th>
                  <th className="px-3 py-3 text-center">Conversations</th>
                  <th className="px-5 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = statusMeta(r.status);
                  return (
                    <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 font-semibold", m.cls)}>
                          <m.icon className="h-3.5 w-3.5" /> {m.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{format(new Date(r.started_at), "d MMM, HH:mm")}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}</div>
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground">{duration(r)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{r.tickets_synced}</td>
                      <td className="px-3 py-3 text-center">{r.conversations_synced}</td>
                      <td className="max-w-[280px] px-5 py-3 text-rose-600">
                        <span className="line-clamp-2">{r.error ?? ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
};

export default AdminLogs;
