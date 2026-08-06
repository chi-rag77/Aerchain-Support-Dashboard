import { useCallback, useEffect, useState } from "react";
import { fetchTickets, triggerSync } from "@/services/freshdesk";
import { loadSlaRules } from "@/services/sla";
import { isSupabaseConfigured } from "@/services/supabase";
import { Ticket } from "@/types/freshdesk";
import { showSuccess, showError } from "@/utils/toast";

interface UseTicketsResult {
  tickets: Ticket[];
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}

/**
 * Central ticket store with silent auto-refresh every 60s.
 */
export const useTickets = (autoRefreshMs = 60000): UseTicketsResult => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // initial: just read from Supabase (fast first paint).
  // auto / manual: trigger a fresh Freshdesk → Supabase sync first, then read,
  // so new tickets are fetched automatically without a manual refresh.
  // Auto sync failures stay silent; only manual refreshes surface an error toast.
  const load = useCallback(async (mode: "initial" | "auto" | "manual") => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    try {
      if ((mode === "manual" || mode === "auto") && isSupabaseConfigured) {
        const res = await triggerSync();
        if (!res.ok && mode === "manual") showError(res.error ?? "Sync failed");
      }
      // Apply admin-configured SLA rules before computing anything from tickets.
      await loadSlaRules();
      const data = await fetchTickets();
      // Show every ticket type so counts reconcile with Freshdesk's NSE view
      // (previously "Requirement" type tickets were hidden app-wide).
      setTickets(data);
      setLastUpdated(new Date());
      if (mode === "manual") showSuccess("Tickets refreshed");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load tickets");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
    if (!autoRefreshMs) return;
    const id = setInterval(() => load("auto"), autoRefreshMs);
    return () => clearInterval(id);
  }, [load, autoRefreshMs]);

  return { tickets, isLoading, isRefreshing, lastUpdated, refresh: () => load("manual") };
};
