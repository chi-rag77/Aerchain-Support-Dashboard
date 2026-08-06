// ============================================================================
// Business-hours engine
//
// SLA targets are expressed in *business hours*: time only accrues during the
// support window (default 10:30–18:30) on working days (default Mon–Fri).
// Weekends (and any non-working day) are skipped entirely.
//
// All math is done in a fixed timezone (default IST, UTC+5:30) so results are
// identical whether this runs in the browser, an edge function, or CI —
// independent of the machine's local timezone. Ticket timestamps are UTC ISO
// strings; we shift them into the support timezone to read the wall clock.
//
// The config is mutable so the admin panel can override it at runtime
// (loaded from app_settings → key 'business_hours').
// ============================================================================

export interface BusinessHoursConfig {
  /** Support window start, minutes past midnight (e.g. 10:30 → 630). */
  startMin: number;
  /** Support window end, minutes past midnight (e.g. 18:30 → 1110). */
  endMin: number;
  /** Working days as JS getDay() values (0=Sun … 6=Sat). Default Mon–Fri. */
  days: number[];
  /** Support-timezone offset from UTC, in minutes (IST = +330). */
  tzOffsetMin: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  startMin: 10 * 60 + 30, // 10:30
  endMin: 18 * 60 + 30,   // 18:30
  days: [1, 2, 3, 4, 5],  // Mon–Fri
  tzOffsetMin: 330,       // IST (UTC+5:30)
};

// Live config — mutated in place by setBusinessHours() so every consumer that
// reads it at call-time picks up admin changes on the next render.
export const BUSINESS_HOURS: BusinessHoursConfig = { ...DEFAULT_BUSINESS_HOURS };

/** Replace the active business-hours config (partial patch is merged). */
export const setBusinessHours = (cfg: Partial<BusinessHoursConfig>) => {
  if (cfg.startMin != null) BUSINESS_HOURS.startMin = cfg.startMin;
  if (cfg.endMin != null) BUSINESS_HOURS.endMin = cfg.endMin;
  if (Array.isArray(cfg.days) && cfg.days.length) BUSINESS_HOURS.days = [...cfg.days];
  if (cfg.tzOffsetMin != null) BUSINESS_HOURS.tzOffsetMin = cfg.tzOffsetMin;
};

/** Length of one business day, in minutes (window end − start). */
export const businessDayMinutes = () =>
  Math.max(1, BUSINESS_HOURS.endMin - BUSINESS_HOURS.startMin);

const DAY_MS = 86_400_000;

/**
 * Business minutes elapsed between two instants (UTC Dates), counting only time
 * inside the support window on working days. Returns 0 if end <= start.
 */
export const businessMinutesBetween = (startUtc: Date, endUtc: Date): number => {
  const off = BUSINESS_HOURS.tzOffsetMin * 60_000;
  const s = startUtc.getTime() + off; // shifted into support tz
  const e = endUtc.getTime() + off;
  if (e <= s) return 0;

  let total = 0;
  // Walk each shifted calendar day from the day containing `s` to `e`.
  for (let cursor = Math.floor(s / DAY_MS) * DAY_MS; cursor <= e; cursor += DAY_MS) {
    const dow = new Date(cursor).getUTCDay(); // day-of-week in support tz
    if (!BUSINESS_HOURS.days.includes(dow)) continue;
    const winStart = cursor + BUSINESS_HOURS.startMin * 60_000;
    const winEnd = cursor + BUSINESS_HOURS.endMin * 60_000;
    const ovStart = Math.max(winStart, s);
    const ovEnd = Math.min(winEnd, e);
    if (ovEnd > ovStart) total += ovEnd - ovStart;
  }
  return Math.round(total / 60_000);
};

/**
 * The instant reached by adding `minutes` of business time to `startUtc`.
 * Used to compute a concrete SLA deadline datetime.
 */
export const addBusinessMinutes = (startUtc: Date, minutes: number): Date => {
  const off = BUSINESS_HOURS.tzOffsetMin * 60_000;
  const s = startUtc.getTime() + off; // shifted
  let remaining = Math.max(0, minutes);
  if (remaining === 0) return new Date(startUtc.getTime());

  let cursor = Math.floor(s / DAY_MS) * DAY_MS;
  // Guard: cap the scan so a misconfigured (empty) day list can't loop forever.
  for (let guard = 0; guard < 4000; cursor += DAY_MS, guard++) {
    const dow = new Date(cursor).getUTCDay();
    if (!BUSINESS_HOURS.days.includes(dow)) continue;
    const winStart = cursor + BUSINESS_HOURS.startMin * 60_000;
    const winEnd = cursor + BUSINESS_HOURS.endMin * 60_000;
    // On the first eligible day we may start mid-window; later days start at winStart
    // because winStart > s once the cursor advances past the start day.
    const from = Math.max(winStart, s);
    if (from >= winEnd) continue; // start is after today's window → next day
    const availMin = (winEnd - from) / 60_000;
    if (availMin >= remaining) {
      const deadlineShifted = from + remaining * 60_000;
      return new Date(deadlineShifted - off); // un-shift back to UTC
    }
    remaining -= availMin;
  }
  // Fallback (shouldn't happen with a valid config): return the raw offset.
  return new Date(startUtc.getTime() + minutes * 60_000);
};

/** Convenience: add business *hours*. */
export const addBusinessHours = (startUtc: Date, hours: number): Date =>
  addBusinessMinutes(startUtc, hours * 60);

/**
 * Format a business-minute duration as "Xd Yh" / "Yh Zm" / "Zm", where one day
 * = one business day (the support-window length, not 24h). Sign preserved.
 */
export const formatBusinessDuration = (mins: number): string => {
  const sign = mins < 0 ? "-" : "";
  let a = Math.abs(Math.round(mins));
  const dayMin = businessDayMinutes();
  const d = Math.floor(a / dayMin); a -= d * dayMin;
  const h = Math.floor(a / 60); const m = a % 60;
  if (d > 0) return `${sign}${d}d ${h}h`;
  if (h > 0) return `${sign}${h}h ${m}m`;
  return `${sign}${m}m`;
};

/** "10:30" ⇄ minutes-past-midnight helpers for the admin UI. */
export const minutesToHHMM = (min: number): string => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
export const hhmmToMinutes = (s: string): number => {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
