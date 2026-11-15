-- Companies page: touchpoints (coffee chats, calls, contacts, referrals) and favorite companies.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists touchpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company text not null,
  company_key text not null,                 -- matches applications.company_key, so touchpoints carry over when an application is created
  application_id uuid references applications on delete set null,
  person text not null,
  person_role text not null default '',
  kind text not null default 'Coffee chat',  -- Coffee chat | Call | Email | Event | Other
  happened_on date not null,
  notes text not null default '',            -- the user's own notes; never email or calendar text
  referral boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists touchpoints_user_company on touchpoints (user_id, company_key);

create table if not exists company_favorites (
  user_id uuid not null references auth.users on delete cascade,
  company_key text not null,
  primary key (user_id, company_key)
);

alter table touchpoints enable row level security;
alter table company_favorites enable row level security;

drop policy if exists own_touchpoints on touchpoints;
create policy own_touchpoints on touchpoints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_company_favorites on company_favorites;
create policy own_company_favorites on company_favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tell the Supabase API to pick up the new tables right away.
notify pgrst, 'reload schema';
