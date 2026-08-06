# Deploying the roll-up dashboard (all customers except NSE)

This dashboard is the **multi-customer roll-up**: one deployment, one Supabase
project, showing every Aerchain customer's support **except NSE** (which runs on
its own dedicated dashboard). Scoping is by the Freshdesk `cf_company` custom
field. Branding stays Aerchain; the in-app customer filter drills into a single
company.

The values that define this instance:

| Where | Variable | Value |
|-------|----------|-------|
| Frontend (Vercel) | `VITE_COMPANY_NAME` | `All Customers` |
| Sync (Edge Function secret) | `FRESHDESK_EXCLUDE_COMPANY_NAME` | `NSE` |
| Sync (Edge Function secret) | `FRESHDESK_COMPANY_NAME` | *(leave unset — sync all)* |

> To exclude more companies later, set `FRESHDESK_EXCLUDE_COMPANY_NAME` to a
> comma-separated list, e.g. `NSE,InternalTest`. Confirm each value against a real
> ticket: `GET /api/v2/tickets/{id}` → `custom_fields.cf_company`.

---

## 1. Supabase project

1. Create a new Supabase project (e.g. `aerchain-support-rollup`).
2. Run the migrations in `supabase/migrations/` in order (SQL Editor or `supabase db push`):
   `0001 → 0002 → 0003 → 0004 → 0005 → 0006`.
3. Enable **Email** auth; turn **off** public sign-ups (Auth → Providers → Email).

## 2. Edge Functions

Deploy all three, with `verify_jwt = false` (already set in `config.toml`):

```bash
supabase link --project-ref <NEW_PROJECT_REF>
supabase functions deploy sync-freshdesk
supabase functions deploy admin-users
supabase functions deploy slack-notify   # optional (Slack alerts)
```

Set the secrets (note: **exclude** NSE, do not set an include filter):

```bash
supabase secrets set FRESHDESK_DOMAIN=aerchain.freshdesk.com
supabase secrets set FRESHDESK_API_KEY=<freshdesk_api_key>
supabase secrets set FRESHDESK_EXCLUDE_COMPANY_NAME=NSE       # cf_company values to drop
supabase secrets set SYNC_CREATED_AFTER=2026-08-01T00:00:00Z  # optional
```

## 3. Schedule the sync

In the SQL Editor, run the `sync-freshdesk-every-5m` (and optional
`slack-notify-every-5m`) blocks from `supabase/cron.sql`, replacing the URL
host with **this project's** ref.

## 4. First admin user

Create a login (Auth → Users → Add user, auto-confirm), then grant admin:

```sql
insert into public.profiles (id, email, full_name, is_admin)
select id, email, 'Admin', true from auth.users where lower(email) = '<admin@aerchain.io>'
on conflict (id) do update set is_admin = true, disabled = false;
```

End-users are created the same way but with `is_admin = false`
(they then see only Home + Tickets; Reports/Admin stay hidden).

## 5. Vercel deployment

New Vercel project from this repo, with env vars:

```
VITE_SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<new project's anon key>
VITE_COMPANY_NAME=All Customers
VITE_COMPANY_FULL_NAME=all Aerchain customers   # optional, login subtitle
```

Deploy. The UI now reads as the all-customers roll-up, pulling every company's
tickets except NSE, with a header filter to focus on one customer at a time.

---

## Checklist

- [ ] `cf_company` exclusion value(s) confirmed on real Freshdesk tickets
- [ ] Supabase project created + migrations run
- [ ] `sync-freshdesk`, `admin-users` (and `slack-notify`) deployed
- [ ] Secrets set incl. `FRESHDESK_EXCLUDE_COMPANY_NAME=NSE` (and NO `FRESHDESK_COMPANY_NAME`)
- [ ] Cron scheduled
- [ ] Admin user + end-user logins created
- [ ] Vercel env set incl. `VITE_COMPANY_NAME` and deployed
