# Aerchain · Support Dashboard (All Customers)

Enterprise support analytics dashboard covering **every Aerchain customer except
NSE** (NSE has its own dedicated dashboard). Backed by Freshdesk data — scoped by
the `cf_company` custom field — synced into Supabase.

- **Dashboard** — service health score, KPI strip, priority queue, live activity, SLA analytics
- **Tickets** — full ticket register with filters, SLA tracking, and a detail drawer
- **Reports** — styled Excel (2-sheet) ticket export + SLA compliance reports in Excel & PDF
- **Customer filter** — a header dropdown to view "All customers" or drill into a single company

Stack: Vite · React 19 · TypeScript · Tailwind · shadcn/ui · Recharts · Supabase (Postgres + Edge Functions) · ExcelJS · jsPDF

---

## How company scoping works

Every ticket carries its company in the Freshdesk custom field `cf_company`
(the native `company_id` is often null). The `sync-freshdesk` Edge Function
persists that as `company_name`, then the app groups/filters by it and applies
per-customer SLA.

This deployment is the **roll-up**: the sync keeps **all** `cf_company` values
**except** those listed in `FRESHDESK_EXCLUDE_COMPANY_NAME` (default `NSE`).

- Roll-up (this repo): leave `FRESHDESK_COMPANY_NAME` **unset**, set `FRESHDESK_EXCLUDE_COMPANY_NAME=NSE`.
- Single customer (e.g. the NSE dashboard): set `FRESHDESK_COMPANY_NAME=NSE`.

---

## Local development

```bash
npm install --legacy-peer-deps   # React 19 peer-dep resolution
npm run dev
```

The app runs in **demo mode** (mock data spanning several customers) when the
Supabase env vars are absent, so it works out of the box without any credentials.

---

## ⚠️ Production deployment checklist

> **Read this before any live deploy.** If the host (Vercel, etc.) auto-deploys from
> `main`, these steps are required — otherwise prod silently runs on mock data.

### 1. Frontend environment variables (Vercel / host)

The frontend needs these at **build time**. Without them, prod falls back to demo mode:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for the browser; protected by RLS) |
| `VITE_COMPANY_NAME` | UI label (default `All Customers`) |

Set them in **Vercel → Project → Settings → Environment Variables** for the
Production (and Preview) environments, then redeploy.

### 2. Edge Function secrets (Supabase — server-side only)

These are **secrets** and must **never** be committed or exposed to the browser.
Set them only as Supabase Edge Function secrets:

```bash
supabase secrets set SUPABASE_SECRET_KEY=<service-role-key>
supabase secrets set FRESHDESK_API_KEY=<freshdesk-api-key>
supabase secrets set FRESHDESK_DOMAIN=<your-domain>.freshdesk.com
supabase secrets set FRESHDESK_EXCLUDE_COMPANY_NAME=NSE   # keep everyone except NSE
```

`.env` is gitignored — keep it that way.

### 3. Sync cron (optional, recommended)

To keep data fresh, schedule the sync Edge Function every 5 minutes by running
`supabase/cron.sql` in the Supabase SQL Editor (requires `pg_cron` + `pg_net`).

### 4. 🔐 Rotate exposed credentials

The **Freshdesk API key** and **Supabase secret (service-role) key** shared in
plaintext during setup should be **rotated**:

1. **Freshdesk** → Profile Settings → regenerate API key, then update the
   `FRESHDESK_API_KEY` Edge Function secret.
2. **Supabase** → Project Settings → API → roll the service-role/secret key, then
   update the `SUPABASE_SECRET_KEY` Edge Function secret.

The `VITE_SUPABASE_ANON_KEY` is public by design and does **not** need rotation
(it is gated by Row Level Security).

---

## Architecture

```
Freshdesk REST API
      │
      ▼
sync-freshdesk (Supabase Edge Function, Deno)   ← FRESHDESK_API_KEY, SUPABASE_SECRET_KEY
      │  keeps all cf_company values except FRESHDESK_EXCLUDE_COMPANY_NAME (NSE)
      │  upserts tickets + conversations
      ▼
Supabase Postgres (RLS: anon read-only)
      │
      ▼
Frontend (Vite/React)   ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```
