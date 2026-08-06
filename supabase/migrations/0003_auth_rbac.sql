-- ============================================================================
-- 0003_auth_rbac — authentication, roles, and admin-editable SLA rules
-- Run in Supabase SQL Editor AFTER enabling Email auth (Auth → Providers).
-- Disable public sign-ups: Auth → Providers → Email → turn OFF "Enable signup".
-- ============================================================================

-- ─── Profiles (one row per auth user) ───────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  is_admin    boolean not null default false,
  disabled    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- SECURITY DEFINER helper so policies can check admin without recursing on RLS
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid and not disabled), false);
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_write on public.profiles;

-- A user can read their own profile; admins can read everyone's.
create policy profiles_read on public.profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));
-- Only admins may modify profiles (the Edge Function uses the service role).
create policy profiles_write on public.profiles
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── SLA rules (admin-editable, drives the whole dashboard) ──────────────────
create table if not exists public.sla_rules (
  priority          smallint primary key,           -- 1 Low … 4 Critical
  severity_label    text not null,
  resolution_hours  integer not null,               -- calendar-hour target
  ack_minutes       integer not null default 15,
  analysis_minutes  integer not null default 60,
  resolution_label  text,                            -- human label e.g. "8 business hours"
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);

-- Seed with the current Aerchain SLA targets (calendar-hour equivalents).
insert into public.sla_rules (priority, severity_label, resolution_hours, ack_minutes, analysis_minutes, resolution_label) values
  (4, 'Severity 1 — Business Critical', 21,  15, 60, '8 business hours'),
  (3, 'Severity 2 — System Defect',     85,  15, 60, '32 business hours'),
  (2, 'Severity 3 — Minor Error',       171, 15, 60, '15 business days'),
  (1, 'Severity 3 — Minor Error',       320, 15, 60, '15 business days')
on conflict (priority) do nothing;

alter table public.sla_rules enable row level security;

drop policy if exists sla_read  on public.sla_rules;
drop policy if exists sla_write on public.sla_rules;

-- Any logged-in user (and anon, for resilience) may read the rules.
create policy sla_read on public.sla_rules for select using (true);
-- Only admins may change them.
create policy sla_write on public.sla_rules
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============================================================================
-- First system admin — run AFTER chirag.s@aerchain.io has signed up / been
-- created, to grant admin rights:
--
--   insert into public.profiles (id, email, full_name, is_admin)
--   select id, email, 'Chirag S', true from auth.users where email = 'chirag.s@aerchain.io'
--   on conflict (id) do update set is_admin = true, disabled = false;
-- ============================================================================
