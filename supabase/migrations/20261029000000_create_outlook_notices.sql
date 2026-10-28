-- Outlook Notice Inbox. Apply manually after reviewing; do not run against production automatically.
create table if not exists public.microsoft_mailbox_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  microsoft_user_id text not null,
  microsoft_tenant_id text not null,
  email text not null check (char_length(email) <= 320),
  display_name text not null default '' check (char_length(display_name) <= 160),
  encrypted_token_cache text not null,
  delta_link text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_started_at timestamptz,
  sync_status text not null default 'never' check (sync_status in ('never','syncing','success','error')),
  sync_error text check (sync_error is null or char_length(sync_error) <= 300),
  status text not null default 'connected' check (status in ('connected','disconnected')),
  updated_at timestamptz not null default now()
);
alter table public.microsoft_mailbox_connections enable row level security;
revoke all on public.microsoft_mailbox_connections from public, anon, authenticated;
-- This table includes encrypted OAuth material and is accessed only by server routes using service_role.

create table if not exists public.college_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  microsoft_user_id text not null,
  message_id text not null,
  internet_message_id text,
  subject text not null default '' check (char_length(subject) <= 998),
  sender_name text not null default '' check (char_length(sender_name) <= 160),
  sender_address text not null default '' check (char_length(sender_address) <= 320),
  received_at timestamptz not null,
  web_link text,
  summary text,
  category text not null default 'other' check (category in ('exam','assignment','fees','timetable','attendance','event','administrative','other')),
  importance text not null default 'normal' check (importance in ('low','normal','high')),
  extracted_dates jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  processing_status text not null default 'summary_unavailable' check (processing_status in ('classified','summary_unavailable','review_needed')),
  confidence numeric(3,2) not null default 0.25 check (confidence between 0 and 1),
  attachment_metadata jsonb not null default '[]'::jsonb,
  is_notice boolean not null default false,
  archived boolean not null default false,
  read_at timestamptz,
  ignored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, microsoft_user_id, message_id)
);
alter table public.college_notices enable row level security;
revoke all on public.college_notices from public, anon;
grant select, insert, update, delete on public.college_notices to authenticated;
drop policy if exists "College notice owner access" on public.college_notices;
create policy "College notice owner access" on public.college_notices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists college_notices_user_received_idx on public.college_notices(user_id, received_at desc);
create index if not exists college_notices_user_category_idx on public.college_notices(user_id, category, received_at desc);

-- Rollback: drop college_notices, then microsoft_mailbox_connections. User-owned rows are removed on account deletion.
