-- ============================================================================
-- 0006_per_customer_sla — per-customer SLA rules
--
-- The dashboard now serves ALL customers from one dataset (the sync-freshdesk
-- function pulls every company). SLA policy is therefore modelled as:
--
--   • a single DEFAULT ruleset that applies to every customer, stored with
--     company_name = '' (empty string), and
--   • optional per-customer OVERRIDE rulesets, stored with company_name set to
--     that customer's name (e.g. 'NSE').
--
-- computeSLA() resolves a ticket's target as: override row for the ticket's
-- company if one exists, else the default row. So "same SLA for everyone,
-- custom SLA only for NSE" is just: keep the defaults + add NSE override rows.
-- ============================================================================

-- 1. Add the company dimension (existing rows become the shared default).
alter table public.sla_rules
  add column if not exists company_name text not null default '';

-- 2. Re-key on (company_name, priority) so each customer can have its own row
--    per priority. The old primary key was on priority alone.
alter table public.sla_rules drop constraint if exists sla_rules_pkey;
alter table public.sla_rules add primary key (company_name, priority);

-- 3. Seed an NSE override set by copying the current default targets. This is
--    behaviour-preserving (NSE == default until an admin edits it) and gives
--    admins an editable NSE ruleset in the Admin → SLA page. Adjust these to
--    NSE's real custom SLA there (or via SQL) whenever the numbers are known.
insert into public.sla_rules
  (company_name, priority, severity_label, resolution_hours, ack_minutes, analysis_minutes, resolution_label)
select 'NSE', priority, severity_label, resolution_hours, ack_minutes, analysis_minutes, resolution_label
from public.sla_rules
where company_name = ''
on conflict (company_name, priority) do nothing;
