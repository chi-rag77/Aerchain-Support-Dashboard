import { useEffect, useState } from "react";
import {
  Slack, Send, Bell, AlertTriangle, Info, Save, Loader2, Plus, Trash2, Link2, ExternalLink,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/utils/toast";
import { isSupabaseConfigured } from "@/services/supabase";
import {
  SlackConfig, DEFAULT_SLACK_CONFIG, loadSlackConfig, saveSlackConfig,
  sendSlackTest, isSlackWebhook,
} from "@/services/slack";

type MapRow = { name: string; id: string };

const AdminSlack = () => {
  const [cfg, setCfg] = useState<SlackConfig>(DEFAULT_SLACK_CONFIG);
  const [rows, setRows] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"assignee" | "sla" | null>(null);

  useEffect(() => {
    (async () => {
      const c = await loadSlackConfig();
      setCfg(c);
      setRows(Object.entries(c.userMap).map(([name, id]) => ({ name, id })));
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof SlackConfig>(key: K, value: SlackConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  const buildUserMap = (): Record<string, string> => {
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      const name = r.name.trim().toLowerCase();
      const id = r.id.trim();
      if (name && id) map[name] = id;
    });
    return map;
  };

  const onSave = async () => {
    setSaving(true);
    const toSave: SlackConfig = { ...cfg, userMap: buildUserMap() };
    const res = await saveSlackConfig(toSave);
    setSaving(false);
    if (!res.ok) return showError(res.error ?? "Failed to save Slack settings");
    setCfg(toSave);
    showSuccess("Slack settings saved");
  };

  const onTest = async (which: "assignee" | "sla") => {
    const url = which === "assignee" ? cfg.assigneeWebhookUrl : cfg.slaWebhookUrl;
    if (!isSlackWebhook(url)) return showError("Enter a valid hooks.slack.com webhook URL first");
    setTesting(which);
    const res = await sendSlackTest(which, url);
    setTesting(null);
    if (res.ok) {
      showSuccess(res.confirmed ? "Test message delivered to Slack ✓" : "Test message sent — check your Slack channel");
    } else {
      showError(res.error ?? "Could not send test message");
    }
  };

  const addRow = () => setRows((r) => [...r, { name: "", id: "" }]);
  const updateRow = (i: number, patch: Partial<MapRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Slack settings…
        </div>
      </AdminShell>
    );
  }

  const dim = !cfg.enabled;

  return (
    <AdminShell>
      <div className="space-y-4">
        {/* How-to banner */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[12.5px] text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>
              Connect Slack with <span className="font-semibold">Incoming Webhooks</span> — no
              server required. In Slack, create an app → enable <em>Incoming Webhooks</em> → add a
              webhook to the channel you want, then paste the URL below.
            </p>
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Slack webhook setup guide <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-[11.5px] opacity-90">
              Alerts are delivered by a scheduled server job (every ~5&nbsp;min), so they fire even
              when no one has the dashboard open — no tab needs to stay open. Just save your
              webhook(s) and enable.
              {!isSupabaseConfigured && " Demo mode: Supabase isn’t configured, so settings save to this browser only and the scheduled sender is unavailable."}
            </p>
          </div>
        </div>

        {/* Master toggle */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4A154B]/10">
              <Slack className="h-5 w-5 text-[#4A154B] dark:text-violet-300" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold">Slack alerts</h2>
              <p className="text-[12px] text-muted-foreground">
                Ping assignees on new tickets and post SLA reminders to a channel.
              </p>
            </div>
          </div>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>

        <div className={cn("space-y-4 transition-opacity", dim && "opacity-60")}>
          {/* Assignee alerts */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-secondary/20 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                <div>
                  <h3 className="text-[13.5px] font-bold">Assignee alerts</h3>
                  <p className="text-[11.5px] text-muted-foreground">
                    DM-style ping in a channel when a ticket is assigned.
                  </p>
                </div>
              </div>
              <Switch
                checked={cfg.notifyAssignee}
                disabled={dim}
                onCheckedChange={(v) => set("notifyAssignee", v)}
              />
            </div>
            <div className="space-y-3 p-5">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Channel webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={cfg.assigneeWebhookUrl}
                    disabled={dim}
                    placeholder="https://hooks.slack.com/services/T…/B…/…"
                    onChange={(e) => set("assigneeWebhookUrl", e.target.value)}
                    className="font-mono text-[12px]"
                  />
                  <Button
                    variant="outline"
                    disabled={dim || testing === "assignee"}
                    onClick={() => onTest("assignee")}
                    className="shrink-0"
                  >
                    {testing === "assignee" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Send className="mr-2 h-4 w-4" /> Test</>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The assignee is @mentioned when their Slack member ID is mapped below.
                </p>
              </div>
            </div>
          </div>

          {/* SLA reminders */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-secondary/20 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <h3 className="text-[13.5px] font-bold">SLA reminders</h3>
                  <p className="text-[11.5px] text-muted-foreground">
                    Digest of breached & at-risk tickets to a group channel.
                  </p>
                </div>
              </div>
              <Switch
                checked={cfg.notifySla}
                disabled={dim}
                onCheckedChange={(v) => set("notifySla", v)}
              />
            </div>
            <div className="space-y-3 p-5">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Group channel webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={cfg.slaWebhookUrl}
                    disabled={dim}
                    placeholder="https://hooks.slack.com/services/T…/B…/…"
                    onChange={(e) => set("slaWebhookUrl", e.target.value)}
                    className="font-mono text-[12px]"
                  />
                  <Button
                    variant="outline"
                    disabled={dim || testing === "sla"}
                    onClick={() => onTest("sla")}
                    className="shrink-0"
                  >
                    {testing === "sla" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Send className="mr-2 h-4 w-4" /> Test</>
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[12px]">Remind at most every</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  disabled={dim}
                  value={cfg.slaReminderHours}
                  onChange={(e) => set("slaReminderHours", Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 w-20"
                />
                <span className="text-[12px] text-muted-foreground">hours</span>
              </div>
            </div>
          </div>

          {/* Freshdesk domain (deep links) */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
              <Link2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <div>
                <h3 className="text-[13.5px] font-bold">Ticket links (optional)</h3>
                <p className="text-[11.5px] text-muted-foreground">
                  Add your Freshdesk domain to include an “Open in Freshdesk” link in alerts.
                </p>
              </div>
            </div>
            <div className="p-5">
              <Input
                value={cfg.freshdeskDomain}
                disabled={dim}
                placeholder="company.freshdesk.com"
                onChange={(e) => set("freshdeskDomain", e.target.value)}
                className="max-w-sm text-[12.5px]"
              />
            </div>
          </div>

          {/* Assignee → Slack ID mapping */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-secondary/20 px-5 py-4">
              <div>
                <h3 className="text-[13.5px] font-bold">Agent → Slack member ID</h3>
                <p className="text-[11.5px] text-muted-foreground">
                  Map each Freshdesk agent name to their Slack member ID (e.g. U01AB2CD3) so alerts @mention them.
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={dim} onClick={addRow}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="p-5">
              {rows.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                  No mappings yet. Without a mapping, alerts show the agent’s name but can’t @mention them.
                </p>
              ) : (
                <div className="space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={row.name}
                        disabled={dim}
                        placeholder="Agent name (as in Freshdesk)"
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        className="text-[12.5px]"
                      />
                      <Input
                        value={row.id}
                        disabled={dim}
                        placeholder="Slack member ID (U…)"
                        onChange={(e) => updateRow(i, { id: e.target.value })}
                        className="font-mono text-[12.5px] sm:max-w-[220px]"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={dim}
                        onClick={() => removeRow(i)}
                        className="shrink-0 text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Find a member ID in Slack: open a profile → ⋯ → “Copy member ID”.
              </p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save settings</>
            )}
          </Button>
        </div>
      </div>
    </AdminShell>
  );
};

export default AdminSlack;
