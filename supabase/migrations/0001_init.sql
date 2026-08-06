-- ============================================================================
-- NSE × Aerchain Support — schema
-- Stores Freshdesk tickets / conversations synced by the sync-freshdesk
-- Edge Function. The frontend reads from these tables with the anon key
-- (RLS allows read-only); only the service role (used by the Edge Function)
-- may write.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ─── Tickets ────────────────────────────────────────────────────────────────
create table if not exists public.tickets (
  id            bigint primary key,           -- Freshdesk ticket id
  subject       text        not null default '',
  description   text        not null default '',
  priority      smallint    not null default 1,   -- 1 Low … 4 Critical
  status        smallint    not null default 2,   -- 2 Open, 3 Pending, 4 Resolved, 5 Closed, 6 Waiting
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  requester_id  bigint,
  company_id    bigint,
  responder_id  bigint,
  tags          text[]      not null default '{}',
  company_name  text,
  requester_name text,
  responder_name text,
  sla_policy_id bigint,
  synced_at     timestamptz not null default now()
);

create index if not exists tickets_status_idx     on public.tickets (status);
create index if not exists tickets_priority_idx   on public.tickets (priority);
create index if not exists tickets_updated_at_idx on public.tickets (updated_at desc);

-- ─── Conversations ──────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id          bigint primary key,             -- Freshdesk conversation id
  ticket_id   bigint not null references public.tickets (id) on delete cascade,
  body        text   not null default '',
  body_text   text   not null default '',
  incoming    boolean not null default true,
  private     boolean not null default false,
  user_id     bigint,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  attachments jsonb not null default '[]'::jsonb
);

create index if not exists conversations_ticket_idx on public.conversations (ticket_id);

-- ─── Sync log (observability for the cron job) ──────────────────────────────
create table if not exists public.sync_log (
  id             uuid primary key default uuid_generate_v4(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running',   -- running | success | error
  tickets_synced integer not null default 0,
  conversations_synced integer not null default 0,
  error          text
);

create index if not exists sync_log_started_idx on public.sync_log (started_at desc);

-- ============================================================================
-- Row Level Security
--   • Reads: anyone with the anon key (dashboard is internal/NSE-only).
--   • Writes: service role only (Edge Function) — service role bypasses RLS,
--     so we simply do NOT add insert/update policies for anon.
-- ============================================================================
alter table public.tickets       enable row level security;
alter table public.conversations enable row level security;
alter table public.sync_log      enable row level security;

drop policy if exists "tickets_read"       on public.tickets;
drop policy if exists "conversations_read" on public.conversations;
drop policy if exists "sync_log_read"      on public.sync_log;

create policy "tickets_read"       on public.tickets       for select using (true);
create policy "conversations_read" on public.conversations for select using (true);
create policy "sync_log_read"      on public.sync_log      for select using (true);
