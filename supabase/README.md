# Freshdesk → Supabase integration

The dashboard reads tickets/conversations from Supabase. A Supabase Edge
Function (`sync-freshdesk`) pulls data from the Freshdesk API and upserts it
into the `tickets` / `conversations` tables, on a 5-minute cron and on-demand
when you hit **Refresh** in the UI. Freshdesk credentials stay server-side.

```
Freshdesk API ──(Edge Function: sync-freshdesk)──▶ Supabase tables ──(anon, RLS)──▶ Dashboard
                         ▲ cron every 5m / Refresh button
```

## One-time setup

1. **Install the CLI & link the project**
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```

2. **Apply the schema**
   ```bash
   supabase db push        # runs supabase/migrations/0001_init.sql
   ```

3. **Set Edge Function secrets** (server-side only)
   ```bash
   supabase secrets set FRESHDESK_DOMAIN=yourcompany.freshdesk.com
   supabase secrets set FRESHDESK_API_KEY=your_freshdesk_api_key
   # optional:
   supabase secrets set FRESHDESK_COMPANY_ID=12345
   ```

4. **Deploy the function**
   ```bash
   supabase functions deploy sync-freshdesk --no-verify-jwt
   ```

5. **Schedule the cron** — paste `supabase/cron.sql` into the Dashboard →
   SQL Editor and run it (already pre-filled with the project URL + key), or
   use Dashboard → Edge Functions → sync-freshdesk → Cron.

6. **First sync** (optional manual kick)
   ```bash
   supabase functions invoke sync-freshdesk --no-verify-jwt
   ```

7. **Frontend env** — copy `.env.example` to `.env` and set:
   ```
   VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   (On Vercel, add these as Environment Variables instead.)

Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, the app runs in **demo
mode** with bundled mock data, so local dev still works.
