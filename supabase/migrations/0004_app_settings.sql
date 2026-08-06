-- ============================================================================
-- 0004_app_settings — admin-editable key/value app settings.
--
-- Currently used to store the branding logo (uploaded by an admin) as a
-- base64 data URI under the key 'brand_logo'. Kept generic so future
-- settings can reuse the same table + RLS.
--
-- Read: anyone (so the logo shows on the login screen before auth).
-- Write: admins only (reuses public.is_admin from 0003).
-- ============================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read  on public.app_settings;
drop policy if exists app_settings_write on public.app_settings;

-- Any visitor (incl. anon on the login page) may read settings.
create policy app_settings_read on public.app_settings
  for select using (true);

-- Only admins may change them.
create policy app_settings_write on public.app_settings
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
