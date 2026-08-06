-- ============================================================================
-- Schedule the sync-freshdesk Edge Function every 5 minutes (pg_cron + pg_net).
--
-- Run this ONCE after deploying the function — paste it into the Supabase
-- Dashboard → SQL Editor and execute. (It is intentionally NOT in migrations/
-- so `supabase db push` doesn't run it automatically.)
--
-- The Authorization header uses the publishable/anon key, which is safe to use
-- here because the function is deployed with --no-verify-jwt.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove any prior schedule with the same name
select cron.unschedule('sync-freshdesk-every-5m')
where exists (select 1 from cron.job where jobname = 'sync-freshdesk-every-5m');

select cron.schedule(
  'sync-freshdesk-every-5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://hagfwtqqsekoweatlzlr.supabase.co/functions/v1/sync-freshdesk',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_aQ5Y5cHX3eQSArrnof1nXg_pgmJk-gK'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- Schedule the slack-notify Edge Function every 5 minutes.
--
-- Delivers Slack assignee alerts + SLA reminders server-side, so they fire
-- even when nobody has the dashboard open. Reads its config from app_settings
-- (set in Admin → Slack); if Slack is disabled the function is a no-op, so
-- it is safe to leave scheduled. Deploy the function first:
--   supabase functions deploy slack-notify
-- ============================================================================

select cron.unschedule('slack-notify-every-5m')
where exists (select 1 from cron.job where jobname = 'slack-notify-every-5m');

select cron.schedule(
  'slack-notify-every-5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://hagfwtqqsekoweatlzlr.supabase.co/functions/v1/slack-notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_aQ5Y5cHX3eQSArrnof1nXg_pgmJk-gK'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- verify:  select * from cron.job;
