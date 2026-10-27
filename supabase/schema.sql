-- Additive, user-owned storage for AURA records. Safe to apply to an empty project.
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

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aura_records' and policyname = 'AURA records select owner') then
    execute 'create policy "AURA records select owner" on public.aura_records for select to authenticated using ((select auth.uid()) = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aura_records' and policyname = 'AURA records insert owner') then
    execute 'create policy "AURA records insert owner" on public.aura_records for insert to authenticated with check ((select auth.uid()) = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aura_records' and policyname = 'AURA records update owner') then
    execute 'create policy "AURA records update owner" on public.aura_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aura_records' and policyname = 'AURA records delete owner') then
    execute 'create policy "AURA records delete owner" on public.aura_records for delete to authenticated using ((select auth.uid()) = user_id)';
  end if;
end $$;
