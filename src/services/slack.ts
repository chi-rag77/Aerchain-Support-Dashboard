// ============================================================================
// Slack integration — client side.
//
// Connecting is done from the frontend: an admin creates a Slack *Incoming
// Webhook* (https://api.slack.com/messaging/webhooks) and pastes the URL in
// Admin → Slack. The config is stored in app_settings.
//
// Actual alert DELIVERY runs SERVER-SIDE in the `slack-notify` Edge Function
// on a pg_cron schedule, so alerts fire even when no browser is open. This
// module only handles config load/save and a manual "Test" send.
// ============================================================================

import { supabase } from "@/services/supabase";
import { loadSetting, saveSetting } from "@/services/settings";
import { COMPANY_NAME } from "@/config";

export interface SlackConfig {
  /** Master switch for the whole integration. */
  enabled: boolean;
  /** Webhook posted to when a ticket is newly assigned (team channel). */
  assigneeWebhookUrl: string;
  /** Webhook for the SLA reminder digest (group channel). */
  slaWebhookUrl: string;
  /** Fire assignee alerts. */
  notifyAssignee: boolean;
  /** Fire the SLA reminder digest. */
  notifySla: boolean;
  /** Minimum hours between SLA digests (throttle). */
  slaReminderHours: number;
  /** Optional Freshdesk domain (e.g. company.freshdesk.com) for deep links. */
  freshdeskDomain: string;
  /** Map an agent (lowercased Freshdesk name) → Slack member ID for @mentions. */
  userMap: Record<string, string>;
}

export const DEFAULT_SLACK_CONFIG: SlackConfig = {
  enabled: false,
  assigneeWebhookUrl: "",
  slaWebhookUrl: "",
  notifyAssignee: true,
  notifySla: true,
  slaReminderHours: 4,
  freshdeskDomain: "",
  userMap: {},
};

const CONFIG_KEY = "slack_config";

export const loadSlackConfig = async (): Promise<SlackConfig> => {
  const raw = await loadSetting(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_SLACK_CONFIG };
  try {
    return { ...DEFAULT_SLACK_CONFIG, ...(JSON.parse(raw) as Partial<SlackConfig>) };
  } catch {
    return { ...DEFAULT_SLACK_CONFIG };
  }
};

export const saveSlackConfig = (cfg: SlackConfig) =>
  saveSetting(CONFIG_KEY, JSON.stringify(cfg));

export const isSlackWebhook = (url: string) =>
  /^https:\/\/hooks\.slack\.com\/(services|triggers)\//.test((url ?? "").trim());

/**
 * Send a one-off test message. Prefers the server-side `slack-notify` function
 * (real, confirmable delivery with no CORS caveat). Falls back to a best-effort
 * browser send (`no-cors`, opaque response) when the function isn't reachable
 * or Supabase isn't configured.
 */
export const sendSlackTest = async (
  which: "assignee" | "sla",
  webhookUrl: string,
): Promise<{ ok: boolean; confirmed: boolean; error?: string }> => {
  const url = (webhookUrl ?? "").trim();
  if (!isSlackWebhook(url)) {
    return { ok: false, confirmed: false, error: "Enter a valid https://hooks.slack.com/… webhook URL" };
  }

  // Preferred: server-side send returns real delivery status.
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke("slack-notify", {
        body: { test: which, webhookUrl: url },
      });
      if (!error && data?.ok) return { ok: true, confirmed: true };
      // fall through to browser send on function error
    } catch {
      /* fall through */
    }
  }

  // Fallback: best-effort browser send (can't read Slack's response).
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      body: new URLSearchParams({
        payload: JSON.stringify({
          text: `:white_check_mark: *Test — ${which === "assignee" ? "Assignee alerts" : "SLA reminders"} webhook.* ${COMPANY_NAME} Support dashboard.`,
          unfurl_links: false,
        }),
      }),
    });
    return { ok: true, confirmed: false };
  } catch (e) {
    return { ok: false, confirmed: false, error: e instanceof Error ? e.message : "Failed to reach Slack" };
  }
};
