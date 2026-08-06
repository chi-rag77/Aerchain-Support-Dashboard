import DOMPurify from "dompurify";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Ticket, Conversation, Priority } from "../../types/freshdesk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Clock, User, StickyNote, CheckCircle2, XCircle,
  Lock, ArrowDownLeft, ArrowUpRight, AlertTriangle, Timer,
  CircleDot, CalendarClock,
} from "lucide-react";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { addBusinessHours } from "@/lib/businessHours";
import {
  requesterDisplayName, ticketDept, computeSLA,
  SLA_LABELS, resolutionHoursFor, responseHoursFor,
  SLA_DONE_STATUSES, SLA_PAUSED_STATUS,
  PRIORITY_META, STATUS_META, initials,
} from "@/lib/tickets";
import { cn } from "@/lib/utils";

// ─── DOMPurify setup ─────────────────────────────────────────────────────────

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});
const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const avatarColor = (name: string) => {
  const colours = [
    "bg-gradient-to-br from-violet-500 to-purple-600",
    "bg-gradient-to-br from-sky-500 to-blue-600",
    "bg-gradient-to-br from-emerald-500 to-teal-600",
    "bg-gradient-to-br from-amber-500 to-orange-600",
    "bg-gradient-to-br from-rose-500 to-pink-600",
    "bg-gradient-to-br from-indigo-500 to-violet-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colours[h % colours.length];
};

const fmtDiff = (minutes: number): string => {
  const abs = Math.abs(minutes);
  const d = Math.floor(abs / (60 * 24));
  const h = Math.floor((abs % (60 * 24)) / 60);
  const m = abs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

type MilestoneStatus = "met" | "missed" | "pending" | "paused";

interface Milestone {
  id: string;
  label: string;
  shortLabel: string;
  target: string;
  deadline: Date;
  actual: Date | null;
  /** What the actual timestamp represents, e.g. "First reply sent". */
  actualVerb: string;
  /** How long after the ticket opened the milestone was hit, e.g. "in 6m". */
  elapsedLabel: string | null;
  status: MilestoneStatus;
  detail: string;
}

const buildMilestones = (ticket: Ticket, conversations: Conversation[]): Milestone[] => {
  const created = parseISO(ticket.created_at);
  const isDone = SLA_DONE_STATUSES.includes(ticket.status);
  const isPaused = ticket.status === SLA_PAUSED_STATUS;
  const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];
  const resHours = resolutionHoursFor(ticket.company_name, ticket.priority as Priority);
  const responseHours = responseHoursFor(ticket.company_name, ticket.priority as Priority);

  // Acknowledgment = first *public* agent reply to the requester. Private
  // (internal) notes are not an acknowledgment, so they must be excluded —
  // otherwise the ack time reflects an internal note rather than the reply.
  const firstAgentReply = conversations
    .filter((c) => !c.incoming && !c.private)
    .sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at))[0] ?? null;
  const firstReplyAt = firstAgentReply ? parseISO(firstAgentReply.created_at) : null;

  const ackDeadline = addBusinessHours(created, responseHours);
  const resDeadline = addBusinessHours(created, resHours);

  // Best available resolution timestamp: updated_at on a resolved/closed ticket.
  const resolvedAt = isDone ? parseISO(ticket.updated_at) : null;

  const ackStatus = (): MilestoneStatus => {
    if (!firstReplyAt) return isPaused ? "paused" : "pending";
    return firstReplyAt <= ackDeadline ? "met" : "missed";
  };
  const resolutionStatus = (): MilestoneStatus => {
    // Judge by the ACTUAL resolution time, not "now" — otherwise an on-time
    // resolution flips to "missed" once the clock passes the deadline.
    if (isDone) return resolvedAt && resolvedAt <= resDeadline ? "met" : "missed";
    if (isPaused) return "paused";
    return new Date() > resDeadline ? "missed" : "pending";
  };

  const ackDetail = () => {
    if (!firstReplyAt) return isPaused ? "Waiting on customer" : "Awaiting first reply";
    const diff = differenceInMinutes(firstReplyAt, ackDeadline);
    return diff <= 0 ? `Replied ${fmtDiff(-diff)} early` : `Replied ${fmtDiff(diff)} late`;
  };
  const resDetail = (deadline: Date) => {
    if (isDone) {
      if (!resolvedAt) return "Resolved";
      const late = differenceInMinutes(resolvedAt, deadline);
      return late <= 0 ? `Resolved ${fmtDiff(-late)} early` : `Resolved ${fmtDiff(late)} late`;
    }
    if (isPaused) return "Timer paused";
    const over = differenceInMinutes(new Date(), deadline);
    return over > 0 ? `Overdue by ${fmtDiff(over)}` : `${fmtDiff(-over)} remaining`;
  };

  // "in <x>" = time from ticket open to when the milestone was actually hit.
  const elapsed = (at: Date | null) =>
    at ? `in ${fmtDiff(Math.max(0, differenceInMinutes(at, created)))}` : null;

  return [
    {
      id: "ack",
      label: "Response",
      shortLabel: "RESPONSE",
      target: `${responseHours} business hr${responseHours === 1 ? "" : "s"}`,
      deadline: ackDeadline,
      actual: firstReplyAt,
      actualVerb: "First reply sent",
      elapsedLabel: elapsed(firstReplyAt),
      status: ackStatus(),
      detail: ackDetail(),
    },
    {
      id: "resolution",
      label: "Full Resolution",
      shortLabel: "RESOLUTION",
      target: slaLabel.resolution,
      deadline: resDeadline,
      actual: resolvedAt,
      actualVerb: "Resolved",
      elapsedLabel: elapsed(resolvedAt),
      status: resolutionStatus(),
      detail: resDetail(resDeadline),
    },
  ];
};

// ─── Circular SLA gauge ───────────────────────────────────────────────────────

const CircularGauge = ({ met, total, state }: { met: number; total: number; state: string }) => {
  const pct = total === 0 ? 0 : met / total;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const fill = circ * pct;
  const color =
    state === "breached" ? "#f43f5e" :
    state === "met" ? "#10b981" :
    state === "attention" ? "#f59e0b" :
    "#6B4EFF";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-border/40" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <text x="48" y="44" textAnchor="middle" className="fill-foreground" style={{ fontSize: 18, fontWeight: 800, fontFamily: "inherit" }}>
          {met}/{total}
        </text>
        <text x="48" y="60" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9, fontWeight: 600, fontFamily: "inherit" }}>
          MILESTONES
        </text>
      </svg>
    </div>
  );
};

// ─── SLA DNA Strand ───────────────────────────────────────────────────────────

const DNAStrand = ({ milestones }: { milestones: Milestone[] }) => {
  const nodeColor = (s: MilestoneStatus) =>
    s === "met" ? { bg: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-500/30", text: "text-white" } :
    s === "missed" ? { bg: "bg-rose-500", ring: "ring-rose-200 dark:ring-rose-500/30", text: "text-white" } :
    s === "paused" ? { bg: "bg-violet-500", ring: "ring-violet-200 dark:ring-violet-500/30", text: "text-white" } :
    { bg: "bg-muted", ring: "ring-border/60", text: "text-muted-foreground" };

  const lineColor = (s: MilestoneStatus) =>
    s === "met" ? "bg-emerald-400" :
    s === "missed" ? "bg-rose-400" :
    "bg-border/50";

  const icon = (s: MilestoneStatus) =>
    s === "met" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
    s === "missed" ? <XCircle className="h-3.5 w-3.5" /> :
    s === "paused" ? <Timer className="h-3.5 w-3.5" /> :
    <Clock className="h-3.5 w-3.5" />;

  const pillTone = (s: MilestoneStatus) =>
    s === "met" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
    s === "missed" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" :
    s === "paused" ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" :
    "bg-secondary text-muted-foreground";

  const pillText = (s: MilestoneStatus) =>
    s === "met" ? "Completed" : s === "missed" ? "Overdue" : s === "paused" ? "Paused" : "Pending";

  return (
    <div className="relative pl-5">
      {milestones.map((m, i) => {
        const c = nodeColor(m.status);
        return (
          <div key={m.id} className="relative flex gap-4">
            {/* Strand column */}
            <div className="flex flex-col items-center">
              {/* Node */}
              <div
                className={cn(
                  "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4",
                  c.bg, c.ring, c.text
                )}
              >
                {icon(m.status)}
                {/* Pulse on active/missed */}
                {(m.status === "missed" || m.status === "pending") && m.status !== "paused" && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-0 animate-ping rounded-full opacity-40",
                      m.status === "missed" ? "bg-rose-500" : "bg-[#6B4EFF]"
                    )}
                    style={{ animationDuration: "2s" }}
                  />
                )}
              </div>
              {/* Connector */}
              {i < milestones.length - 1 && (
                <div className={cn("mt-0.5 w-0.5 flex-1", lineColor(m.status))} style={{ minHeight: 28 }} />
              )}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-5", i === milestones.length - 1 && "pb-0")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-foreground leading-tight">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">Target: {m.target}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                    pillTone(m.status)
                  )}>
                    {pillText(m.status)}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground/70">{m.detail}</span>
                </div>
              </div>

              {/* When it actually happened (or when it's due) */}
              <div className={cn(
                "mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]",
                m.actual ? "bg-secondary/50" : m.status === "paused" ? "bg-violet-50/60 dark:bg-violet-500/10" : "bg-secondary/30"
              )}>
                {m.actual ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <span className="font-semibold text-foreground/80">{m.actualVerb}</span>
                    <span className="text-muted-foreground">· {format(m.actual, "MMM d, h:mm a")}</span>
                    {m.elapsedLabel && (
                      <span className="ml-auto shrink-0 rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {m.elapsedLabel}
                      </span>
                    )}
                  </>
                ) : m.status === "paused" ? (
                  <>
                    <Timer className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span className="text-violet-600 dark:text-violet-300">Timer paused — waiting on customer</span>
                  </>
                ) : (
                  <>
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="font-semibold text-foreground/70">Due by</span>
                    <span className="text-muted-foreground">{format(m.deadline, "MMM d, h:mm a")}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Breach Hero ──────────────────────────────────────────────────────────────

const BreachHero = ({ ticket, milestones }: { ticket: Ticket; milestones: Milestone[] }) => {
  const sla = computeSLA(ticket);
  const p = PRIORITY_META[ticket.priority] ?? { label: String(ticket.priority), tone: "", dot: "" };
  const s = STATUS_META[ticket.status] ?? { label: `Status ${ticket.status}`, tone: "" };
  const requester = requesterDisplayName(ticket);
  const slaLabel = SLA_LABELS[ticket.priority as Priority] ?? SLA_LABELS[1];
  const met = milestones.filter(m => m.status === "met").length;

  const heroStyle = {
    breached: {
      bg: "from-rose-600 via-rose-700 to-rose-800 dark:from-rose-900 dark:via-rose-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "BREACHED",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    attention: {
      bg: "from-amber-500 via-amber-600 to-orange-700 dark:from-amber-900 dark:via-amber-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "AT RISK",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    on_track: {
      bg: "from-[#6B4EFF] via-[#7c5fff] to-[#5a3de8] dark:from-[#3d2b99] dark:via-[#4a34b5]",
      badge: "bg-white/20 text-white border-white/30",
      label: "ON TRACK",
      icon: <CircleDot className="h-4 w-4" />,
    },
    met: {
      bg: "from-emerald-500 via-emerald-600 to-teal-700 dark:from-emerald-900 dark:via-emerald-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "SLA MET",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    paused: {
      bg: "from-violet-600 via-violet-700 to-indigo-800 dark:from-violet-900 dark:via-violet-900/80",
      badge: "bg-white/20 text-white border-white/30",
      label: "PAUSED",
      icon: <Timer className="h-4 w-4" />,
    },
  };

  const h = heroStyle[sla.state] ?? heroStyle.on_track;

  return (
    <div className={cn("bg-gradient-to-br px-6 py-5 text-white", h.bg)}>
      {/* Status row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest", h.badge)}>
          {h.icon} {h.label}
        </span>
        {sla.state === "breached" && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wide">
            {sla.remaining} overdue
          </span>
        )}
        {sla.state === "attention" && (
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
            {sla.remaining} remaining
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] font-bold opacity-70">#{ticket.id}</span>
      </div>

      {/* Title */}
      <h2 className="mb-3 text-[17px] font-extrabold leading-snug tracking-tight opacity-95">
        {ticket.subject}
      </h2>

      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] font-medium opacity-80">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", h.badge)}>
            {slaLabel.severity.split("—")[0].trim()}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3 w-3" /> {requester} · {ticketDept(ticket)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> {format(new Date(ticket.created_at), "d MMM yyyy")}
        </span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", h.badge)}>
          {p.label}
        </span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", h.badge)}>
          {s.label}
        </span>
      </div>

      {/* Progress strip */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 overflow-hidden rounded-full bg-white/20 h-1.5">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${(met / milestones.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold opacity-80">{met}/{milestones.length} milestones</span>
      </div>
    </div>
  );
};

// ─── Main TicketDrawer ────────────────────────────────────────────────────────

interface TicketDrawerProps {
  ticket: Ticket | null;
  conversations: Conversation[];
  isOpen: boolean;
  onClose: () => void;
}

export const TicketDrawer = ({ ticket, conversations, isOpen, onClose }: TicketDrawerProps) => {
  if (!ticket) return null;

  const milestones = buildMilestones(ticket, conversations);
  const requester = requesterDisplayName(ticket);
  const sla = computeSLA(ticket);
  // First public agent reply = the acknowledgment message; tag it in the thread.
  const ackId = conversations
    .filter((c) => !c.incoming && !c.private)
    .sort((a, b) => +parseISO(a.created_at) - +parseISO(b.created_at))[0]?.id ?? null;

  const slaPillTone =
    sla.state === "met" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
    sla.state === "breached" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" :
    sla.state === "attention" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" :
    sla.state === "paused" ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" :
    "bg-[#6B4EFF]/10 text-[#6B4EFF] dark:text-violet-300";

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" floating className="gap-0 p-0">

        {/* ── Breach / Status Hero ────────────────────────────────────────── */}
        <BreachHero ticket={ticket} milestones={milestones} />

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-5">

            {/* ── SLA Section: gauge + DNA strand side by side ───────────── */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 bg-secondary/20 px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">SLA Journey</span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", slaPillTone)}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  {sla.label}
                </span>
              </div>
              <div className="flex gap-0">
                {/* Circular gauge */}
                <div className="flex shrink-0 flex-col items-center justify-center border-r border-border/40 px-5 py-5 gap-1">
                  <CircularGauge
                    met={milestones.filter(m => m.status === "met").length}
                    total={milestones.length}
                    state={computeSLA(ticket).state}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">SLA Health</span>
                  <span className="text-[18px] font-extrabold text-foreground">
                    {Math.round((milestones.filter(m => m.status === "met").length / milestones.length) * 100)}%
                  </span>
                </div>

                {/* DNA Strand */}
                <div className="flex-1 px-4 py-5">
                  <DNAStrand milestones={milestones} />
                </div>
              </div>
            </div>

            {/* ── Original description ────────────────────────────────────── */}
            {ticket.description && (
              <div className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={cn("text-[10px] font-bold text-white", avatarColor(requester))}>
                      {initials(requester)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-[12.5px] font-semibold leading-none">{requester}</div>
                    <div className="text-[10.5px] text-muted-foreground">opened this ticket · {format(new Date(ticket.created_at), "MMM d, yyyy · h:mm a")}</div>
                  </div>
                </div>
                <div className="fd-html text-[13px] text-foreground/85" dangerouslySetInnerHTML={{ __html: sanitize(ticket.description) }} />
              </div>
            )}

            {/* ── Conversation divider ────────────────────────────────────── */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                Conversation · {conversations.length}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* ── Conversation thread ─────────────────────────────────────── */}
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
                  <StickyNote className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground/70">No updates yet</p>
                  <p className="text-[11.5px] text-muted-foreground/60">Add the first note or reply below</p>
                </div>
              </div>
            ) : (
              <div className="relative space-y-4">
                {/* Timeline rail behind the avatars */}
                {conversations.length > 1 && (
                  <span aria-hidden className="absolute left-4 top-3 bottom-3 w-px bg-border/60" />
                )}
                {conversations.map((conv) => {
                  const author = conv.incoming ? requester : "Support Agent";
                  const html = sanitize(conv.body || conv.body_text || "");
                  const isAck = conv.id === ackId;
                  return (
                    <div key={conv.id} className="relative flex gap-3">
                      <Avatar className="mt-0.5 h-8 w-8 shrink-0 z-10 ring-2 ring-background">
                        <AvatarFallback className={cn(
                          "text-[10px] font-bold text-white",
                          conv.incoming ? avatarColor(author) : "bg-gradient-to-br from-[#6B4EFF] to-[#8b6dff]"
                        )}>
                          {initials(author)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-foreground">{author}</span>
                          <span className={cn(
                            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold",
                            conv.incoming ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10" : "bg-violet-50 text-violet-600 dark:bg-violet-500/10"
                          )}>
                            {conv.incoming ? <ArrowDownLeft className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}
                            {conv.incoming ? "Incoming" : "Reply"}
                          </span>
                          {isAck && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Acknowledgment
                            </span>
                          )}
                          {conv.private && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-600 dark:bg-amber-500/10">
                              <Lock className="h-2.5 w-2.5" /> Private
                            </span>
                          )}
                          <span className="ml-auto text-[10.5px] text-muted-foreground/60">
                            {format(new Date(conv.created_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <div className={cn(
                          "rounded-2xl rounded-tl-sm border p-3.5 shadow-sm transition-shadow hover:shadow-md",
                          conv.private
                            ? "border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                            : conv.incoming
                              ? "border-border/50 bg-card"
                              : "border-violet-100 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/5"
                        )}>
                          <div className="fd-html text-foreground/85" dangerouslySetInnerHTML={{ __html: html }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
