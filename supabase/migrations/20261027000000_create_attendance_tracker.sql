-- Additive Attendance Tracker schema. Apply manually in Supabase SQL Editor.
create table if not exists public.attendance_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  code text not null check (char_length(trim(code)) <= 30),
  faculty_name text check (faculty_name is null or char_length(faculty_name) <= 100),
  semester text not null check (char_length(trim(semester)) between 1 and 40),
  target_percentage numeric(5,2) not null default 75 check (target_percentage between 0 and 100),
  weekly_schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(weekly_schedule) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, semester),
  unique (user_id, id)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.attendance_subjects(id) on delete cascade,
  session_date date not null,
  session_number smallint not null check (session_number between 1 and 20),
  status text not null check (status in ('present', 'absent', 'cancelled')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, session_date, session_number),
  constraint attendance_session_owner_fk foreign key (user_id, subject_id)
    references public.attendance_subjects(user_id, id) on delete cascade
);

create index if not exists attendance_subjects_user_idx on public.attendance_subjects(user_id, name);
create index if not exists attendance_sessions_user_date_idx on public.attendance_sessions(user_id, session_date desc);
create index if not exists attendance_sessions_subject_date_idx on public.attendance_sessions(subject_id, session_date desc);

alter table public.attendance_subjects enable row level security;
alter table public.attendance_sessions enable row level security;
revoke all on public.attendance_subjects, public.attendance_sessions from public, anon;
grant select, insert, update, delete on public.attendance_subjects, public.attendance_sessions to authenticated;

drop policy if exists "Attendance subjects owner access" on public.attendance_subjects;
create policy "Attendance subjects owner access" on public.attendance_subjects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Attendance sessions owner access" on public.attendance_sessions;
create policy "Attendance sessions owner access" on public.attendance_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
