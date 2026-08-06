-- ============================================================================
-- 0005_slack_notify — state for the scheduled slack-notify Edge Function.
--
-- The function delivers Slack alerts server-side (via pg_cron), so alerts fire
-- even when no browser has the dashboard open. This table records which ticket
-- assignments have already been alerted, so each new/changed assignment pings
-- exactly once. The SLA-digest throttle timestamp lives in app_settings
-- (key 'slack_sla_last_sent'); the assignee baseline flag lives there too
-- (key 'slack_assignee_baseline_done').
--
-- Writes: service role only (the Edge Function). Reads: allowed for
-- observability. Run in Supabase SQL Editor (safe to re-run).
-- ============================================================================

create table if not exists public.slack_notified_assignments (
  ticket_id    bigint primary key references public.tickets (id) on delete cascade,
  responder_id bigint,
  notified_at  timestamptz not null default now()
);

alter table public.slack_notified_assignments enable row level security;

drop policy if exists slack_notified_read on public.slack_notified_assignments;

-- Read-only for observability; the service role bypasses RLS for writes.
create policy slack_notified_read on public.slack_notified_assignments
  for select using (true);
