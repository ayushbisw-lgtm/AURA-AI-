-- Apply this in the Supabase SQL Editor before deploying the production app.
create table if not exists public.aura_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  collection text not null check (collection in (
    'chat', 'memories', 'personalTasks', 'settings',
    'semesters', 'subjects', 'documents', 'tasks'
  )),
  record_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);

alter table public.aura_records enable row level security;
revoke all on public.aura_records from public, anon, authenticated;
grant select, insert, update, delete on public.aura_records to authenticated;

drop policy if exists "Users can read their own AURA records" on public.aura_records;
create policy "Users can read their own AURA records"
  on public.aura_records for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own AURA records" on public.aura_records;
create policy "Users can insert their own AURA records"
  on public.aura_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own AURA records" on public.aura_records;
create policy "Users can update their own AURA records"
  on public.aura_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own AURA records" on public.aura_records;
create policy "Users can delete their own AURA records"
  on public.aura_records for delete to authenticated
  using ((select auth.uid()) = user_id);
