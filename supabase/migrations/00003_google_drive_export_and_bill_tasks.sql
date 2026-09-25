-- Additive schema for Base44 export (Google Drive export + Bill↔Task links).
-- Safe to run on an existing Supabase project that already applied 00001_init.

alter table public.bill
  add column if not exists task_ids jsonb,
  add column if not exists task_names jsonb,
  add column if not exists task_references jsonb;

create table if not exists public.google_drive_export_run (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  status text DEFAULT 'running',
  current_stage text DEFAULT 'init',
  current_offset double precision DEFAULT 0,
  current_item text,
  files_uploaded double precision DEFAULT 0,
  files_skipped double precision DEFAULT 0,
  error text
);

create table if not exists public.google_drive_export_state (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  entry_type text not null,
  entity_type text,
  entity_id text,
  entity_name text,
  drive_folder_id text,
  file_url text,
  drive_file_id text,
  run_date text,
  files_uploaded double precision DEFAULT 0,
  files_skipped double precision DEFAULT 0,
  status text
);

drop trigger if exists google_drive_export_run_set_updated_date on public.google_drive_export_run;
create trigger google_drive_export_run_set_updated_date before update on public.google_drive_export_run
  for each row execute function public.set_updated_date();

drop trigger if exists google_drive_export_state_set_updated_date on public.google_drive_export_state;
create trigger google_drive_export_state_set_updated_date before update on public.google_drive_export_state
  for each row execute function public.set_updated_date();

create index if not exists google_drive_export_run_created_date_idx on public.google_drive_export_run (created_date desc);
create index if not exists google_drive_export_run_created_by_id_idx on public.google_drive_export_run (created_by_id);
create index if not exists google_drive_export_state_created_date_idx on public.google_drive_export_state (created_date desc);
create index if not exists google_drive_export_state_created_by_id_idx on public.google_drive_export_state (created_by_id);

alter table public.google_drive_export_run enable row level security;
drop policy if exists google_drive_export_run_authenticated_all on public.google_drive_export_run;
create policy google_drive_export_run_authenticated_all on public.google_drive_export_run
  for all to authenticated using (true) with check (true);

alter table public.google_drive_export_state enable row level security;
drop policy if exists google_drive_export_state_authenticated_all on public.google_drive_export_state;
create policy google_drive_export_state_authenticated_all on public.google_drive_export_state
  for all to authenticated using (true) with check (true);
