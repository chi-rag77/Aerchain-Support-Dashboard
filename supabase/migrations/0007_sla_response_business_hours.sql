-- ============================================================================
-- 0007_sla_response_business_hours
--
-- 1. Adds a per-priority RESPONSE target (first reply) to sla_rules, alongside
--    the existing resolution target. Both are now interpreted as BUSINESS hours.
-- 2. Seeds a default business-hours (support window) config into app_settings.
--
-- Business hours: SLA time only accrues Mon–Fri, 10:30–18:30 (IST) by default;
-- weekends and off-hours are excluded. Admins can edit the window in
-- Admin → SLA. Safe to run multiple times.
-- ============================================================================

-- 1. Response target (business hours). Default 4h; then set sensible per-severity
--    seeds for existing rows (Critical 1h, High 4h, Medium 8h, Low 24h).
alter table public.sla_rules
  add column if not exists response_hours integer not null default 4;

update public.sla_rules set response_hours = 1  where priority = 4;
update public.sla_rules set response_hours = 4  where priority = 3;
update public.sla_rules set response_hours = 8  where priority = 2;
update public.sla_rules set response_hours = 24 where priority = 1;

-- 2. Default business-hours window (10:30–18:30 IST, Mon–Fri). Only inserted if
--    absent, so an admin's saved window is never overwritten by a re-run.
insert into public.app_settings (key, value)
values (
  'business_hours',
  '{"startMin":630,"endMin":1110,"days":[1,2,3,4,5],"tzOffsetMin":330}'
)
on conflict (key) do nothing;
