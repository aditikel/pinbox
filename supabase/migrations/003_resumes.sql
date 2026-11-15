-- Resumes page: a library of PDF resumes, one default, attachable to applications.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  storage_path text not null unique,         -- <user id>/<random>.pdf in the private "resumes" bucket
  size_bytes integer,
  is_default boolean not null default false,
  uploaded_at timestamptz not null default now()
);
create unique index if not exists one_default_resume on resumes (user_id) where is_default;

-- An application can name the resume it used; when empty, the default resume applies.
alter table applications add column if not exists resume_id uuid references resumes on delete set null;

alter table resumes enable row level security;
drop policy if exists own_resumes on resumes;
create policy own_resumes on resumes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket: PDFs only, 5 MB max. Each user can only touch files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

drop policy if exists resumes_own_files_select on storage.objects;
drop policy if exists resumes_own_files_insert on storage.objects;
drop policy if exists resumes_own_files_delete on storage.objects;
create policy resumes_own_files_select on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_own_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_own_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tell the Supabase API to pick up the new table and column right away.
notify pgrst, 'reload schema';
