import { useEffect, useState } from "react";
import { Loader2, Save, SlidersHorizontal, Info, Clock } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/utils/toast";
import {
  SlaRuleRow, loadSlaRulesFor, saveSlaRule, defaultRules, listCompanies, DEFAULT_COMPANY,
  BusinessHoursForm, loadBusinessHours, saveBusinessHours, businessHoursToForm,
} from "@/services/sla";
import { PRIORITY_META } from "@/lib/tickets";
import { Priority } from "@/types/freshdesk";

// Mon-first ordering; value = JS getDay() (0=Sun … 6=Sat).
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const AdminSLA = () => {
  const [company, setCompany] = useState<string>(DEFAULT_COMPANY);
  const [companies, setCompanies] = useState<string[]>([]);
  const [rules, setRules] = useState<SlaRuleRow[]>(defaultRules());
  const [loading, setLoading] = useState(true);
  const [savingP, setSavingP] = useState<number | null>(null);

  // Business hours (global support window)
  const [biz, setBiz] = useState<BusinessHoursForm>(businessHoursToForm());
  const [savingBiz, setSavingBiz] = useState(false);

  // Populate the customer selector + business hours once.
  useEffect(() => {
    (async () => {
      setCompanies(await listCompanies());
      setBiz(await loadBusinessHours());
    })();
  }, []);

  // Load the ruleset for the selected customer (or the shared default).
  useEffect(() => {
    (async () => {
      setLoading(true);
      setRules(await loadSlaRulesFor(company));
      setLoading(false);
    })();
  }, [company]);

  const update = (priority: number, patch: Partial<SlaRuleRow>) =>
    setRules((rs) => rs.map((r) => (r.priority === priority ? { ...r, ...patch } : r)));

  const onSave = async (rule: SlaRuleRow) => {
    if (rule.resolution_hours <= 0) { showError("Resolution hours must be greater than 0."); return; }
    if (rule.response_hours <= 0) { showError("Response hours must be greater than 0."); return; }
    setSavingP(rule.priority);
    const res = await saveSlaRule({ ...rule, company_name: company });
    setSavingP(null);
    if (res.ok) {
      const scope = company ? company : "Default";
      showSuccess(`${scope} · ${PRIORITY_META[rule.priority as Priority]?.label ?? "Rule"} SLA saved`);
    } else showError(res.error ?? "Failed to save");
  };

  const toggleDay = (d: number) =>
    setBiz((b) => ({
      ...b,
      days: b.days.includes(d) ? b.days.filter((x) => x !== d) : [...b.days, d].sort((a, z) => a - z),
    }));

  const onSaveBiz = async () => {
    setSavingBiz(true);
    const res = await saveBusinessHours(biz);
    setSavingBiz(false);
    if (res.ok) showSuccess("Business hours saved");
    else showError(res.error ?? "Failed to save business hours");
  };

  const isOverride = company !== DEFAULT_COMPANY;

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[12.5px] text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            SLA time is counted in <strong>business hours</strong> — the clock only runs during
            the support window on working days (set below), so <strong>weekends and off-hours
            are excluded</strong>. The <strong>Default</strong> ruleset applies to every customer;
            pick a customer to give them a <strong>custom SLA</strong> that overrides the default.
            These targets drive the SLA gauge, compliance trends, the at-risk list, and reports.
          </p>
        </div>

        {/* Business hours — global support window */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
            <Clock className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">Support / Business Hours</h2>
              <p className="text-[12px] text-muted-foreground">
                The window during which SLA time accrues. Applies to every customer.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4 p-5">
            <Field label="Start time">
              <Input type="time" value={biz.start} className="w-[130px]"
                onChange={(e) => setBiz((b) => ({ ...b, start: e.target.value }))} />
            </Field>
            <Field label="End time">
              <Input type="time" value={biz.end} className="w-[130px]"
                onChange={(e) => setBiz((b) => ({ ...b, end: e.target.value }))} />
            </Field>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Working days</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => {
                  const on = biz.days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "h-9 w-11 rounded-lg border text-[12px] font-semibold transition-colors",
                        on
                          ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={onSaveBiz} disabled={savingBiz} className="ml-auto">
              {savingBiz ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Save className="mr-2 h-4 w-4" /> Save hours</>}
            </Button>
          </div>
        </div>

        {/* Customer selector — Default (all customers) vs a per-customer override */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <Label className="text-[12px] font-semibold text-muted-foreground">Customer</Label>
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="h-9 w-[240px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_COMPANY}>Default — all customers</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase",
              isOverride
                ? "bg-violet-500/10 text-violet-600 dark:text-violet-300"
                : "bg-sky-500/10 text-sky-600 dark:text-sky-300",
            )}
          >
            {isOverride ? "Custom override" : "Shared default"}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
            <SlidersHorizontal className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">
                SLA Rules by Severity {isOverride && <span className="text-violet-600 dark:text-violet-300">· {company}</span>}
              </h2>
              <p className="text-[12px] text-muted-foreground">Response & resolution targets, in business hours</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {rules.map((r) => {
                const meta = PRIORITY_META[r.priority as Priority];
                const saving = savingP === r.priority;
                return (
                  <div key={r.priority} className="p-5">
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase", meta?.tone)}>
                        {meta?.label ?? `P${r.priority}`}
                      </span>
                      <Input
                        value={r.severity_label}
                        onChange={(e) => update(r.priority, { severity_label: e.target.value })}
                        className="h-8 max-w-xs text-[13px] font-semibold"
                      />
                    </div>

                    <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Response (business hrs)">
                        <Input type="number" min={1} value={r.response_hours}
                          onChange={(e) => update(r.priority, { response_hours: Number(e.target.value) })} />
                      </Field>
                      <Field label="Resolution (business hrs)">
                        <Input type="number" min={1} value={r.resolution_hours}
                          onChange={(e) => update(r.priority, { resolution_hours: Number(e.target.value) })} />
                      </Field>
                      <Field label="Resolution label">
                        <Input value={r.resolution_label ?? ""} placeholder="e.g. 8 business hours"
                          onChange={(e) => update(r.priority, { resolution_label: e.target.value })} />
                      </Field>
                      <Button onClick={() => onSave(r)} disabled={saving} className="w-full lg:w-auto">
                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export default AdminSLA;
