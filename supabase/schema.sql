-- Run in Supabase SQL editor. No email body column exists, by design.
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company text not null,
  company_key text not null,
  role text not null default '',
  role_key text not null default '',
  status text not null default 'Applied',
  date_applied date,
  next_action text,
  deadline date,
  source text not null default 'email',
  starred boolean not null default false,
  edited_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, company_key, role_key)
);
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  application_id uuid references applications on delete cascade,
  category text not null,
  occurred_at timestamptz,
  fields jsonb not null default '{}',
  confidence real,
  gmail_thread_id text,
  unique (user_id, gmail_thread_id)
);
create table actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  application_id uuid references applications on delete cascade,
  title text not null,
  due date,
  priority text not null default 'med',
  done boolean not null default false,
  snoozed_until date
);
create table ignored_items (
  user_id uuid not null references auth.users on delete cascade,
  external_id text not null,
  primary key (user_id, external_id)
);
create table google_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token_enc text not null,
  updated_at timestamptz not null default now()
);

alter table applications enable row level security;
alter table events enable row level security;
alter table actions enable row level security;
alter table ignored_items enable row level security;
alter table google_tokens enable row level security;

create policy own_applications on applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_events on events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_actions on actions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_ignored on ignored_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- google_tokens: no client policy. Only the service role (server) reads or writes it.

-- Later migrations live in supabase/migrations/ (002_companies.sql: touchpoints, company_favorites).
