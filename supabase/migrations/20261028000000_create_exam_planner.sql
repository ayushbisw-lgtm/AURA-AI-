-- Additive exam planner storage. Apply manually in Supabase SQL Editor.
create table if not exists public.timetable_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null check (char_length(source_name) between 1 and 240),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'review' check (status in ('review', 'confirmed', 'discarded')),
  parsed_data jsonb not null default '[]'::jsonb check (jsonb_typeof(parsed_data) = 'array'),
  created_at timestamptz not null default now(),
  unique (user_id, file_sha256),
  unique (user_id, id)
);

create table if not exists public.exam_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  code text not null default '' check (char_length(code) <= 40),
  semester text not null default '' check (char_length(semester) <= 80),
  faculty_name text check (faculty_name is null or char_length(faculty_name) <= 120),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create unique index if not exists exam_subjects_name_unique on public.exam_subjects(user_id, lower(name));

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  exam_at timestamptz not null,
  timezone text not null default 'UTC',
  end_at timestamptz,
  venue text check (venue is null or char_length(venue) <= 240),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  notes text not null default '' check (char_length(notes) <= 4000),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  source_import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint exams_subject_owner_fk foreign key (user_id, subject_id) references public.exam_subjects(user_id, id) on delete cascade,
  constraint exams_import_owner_fk foreign key (user_id, source_import_id) references public.timetable_imports(user_id, id)
);

create table if not exists public.exam_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  completed boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'timetable', 'ai')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint exam_topics_exam_owner_fk foreign key (user_id, exam_id) references public.exams(user_id, id) on delete cascade,
  unique (user_id, id)
);
create unique index if not exists exam_topics_title_unique on public.exam_topics(exam_id, lower(title));
create unique index if not exists exams_import_entry_unique on public.exams(user_id, source_import_id, subject_id, exam_at, lower(title)) where source_import_id is not null;

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  topic_id uuid,
  session_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes between 5 and 240),
  completed boolean not null default false,
  title text not null check (char_length(trim(title)) between 1 and 240),
  created_at timestamptz not null default now(),
  constraint study_sessions_exam_owner_fk foreign key (user_id, exam_id) references public.exams(user_id, id) on delete cascade,
  constraint study_sessions_topic_owner_fk foreign key (user_id, topic_id) references public.exam_topics(user_id, id) on delete cascade,
  unique (user_id, id)
);

create table if not exists public.reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  offsets_minutes integer[] not null default array[10080, 4320, 1440, 120],
  all_subjects boolean not null default true,
  selected_subject_ids uuid[] not null default '{}',
  daily_digest boolean not null default false,
  timezone text not null default 'UTC',
  include_notes boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint reminder_offsets_valid check (offsets_minutes <@ array[10080, 4320, 1440, 120]::integer[])
);

create table if not exists public.scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  reminder_kind text not null check (reminder_kind in ('10080', '4320', '1440', '120', 'daily_digest')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz,
  locked_until timestamptz,
  last_error text,
  provider_message_id text,
  exam_updated_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, reminder_kind, exam_updated_at),
  constraint reminders_exam_owner_fk foreign key (user_id, exam_id) references public.exams(user_id, id) on delete cascade
);

create table if not exists public.reminder_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid,
  exam_id uuid,
  status text not null check (status in ('accepted', 'retrying', 'failed', 'skipped')),
  attempt smallint not null default 0,
  provider_message_id text,
  diagnostic text check (diagnostic is null or char_length(diagnostic) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.exam_test_email_limiter (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_requested_at timestamptz not null
);
alter table public.exam_test_email_limiter enable row level security;
revoke all on public.exam_test_email_limiter from public, anon, authenticated;

create index if not exists exams_user_time_idx on public.exams(user_id, exam_at) where status = 'scheduled';
create index if not exists exam_topics_exam_position_idx on public.exam_topics(exam_id, position);
create index if not exists study_sessions_user_time_idx on public.study_sessions(user_id, session_at);
create index if not exists scheduled_reminders_due_idx on public.scheduled_reminders(due_at, next_attempt_at) where status in ('pending', 'sending');
create index if not exists reminder_logs_user_created_idx on public.reminder_delivery_logs(user_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['timetable_imports','exam_subjects','exams','exam_topics','study_sessions','reminder_preferences','scheduled_reminders','reminder_delivery_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' owner access', table_name);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || ' owner access', table_name);
  end loop;
end $$;

revoke insert, update, delete on public.reminder_delivery_logs from authenticated;

create or replace function public.claim_exam_test_email()
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    insert into public.exam_test_email_limiter(user_id, last_requested_at)
    values ((select auth.uid()), now())
    on conflict (user_id) do update set last_requested_at = now()
      where public.exam_test_email_limiter.last_requested_at < now() - interval '1 hour'
    returning user_id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_exam_test_email() from public, anon;
grant execute on function public.claim_exam_test_email() to authenticated;

-- Claim due reminders atomically so overlapping cron invocations don't send the same job twice.
create or replace function public.claim_due_exam_reminders(batch_size integer default 50)
returns setof public.scheduled_reminders
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id from public.scheduled_reminders
    where (status = 'pending' and due_at <= now() and coalesce(next_attempt_at, due_at) <= now())
       or (status = 'sending' and locked_until < now())
    order by due_at
    for update skip locked
    limit least(greatest(batch_size, 1), 100)
  )
  update public.scheduled_reminders r
     set status = 'sending', attempts = least(r.attempts + 1, 5), locked_until = now() + interval '10 minutes'
    from candidates c where r.id = c.id
  returning r.*;
$$;
revoke all on function public.claim_due_exam_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_exam_reminders(integer) to service_role;
