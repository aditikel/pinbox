-- Notes on applications, contact info on touchpoints, and to-do priorities the user picks themselves.
-- Run once in the Supabase SQL editor (after 002 and 003). Safe to re-run.

-- The user's own notes for an application (pipeline "notes" column). Never email text.
alter table applications add column if not exists notes text not null default '';

-- How to reach a contact (email, LinkedIn URL, phone), typed by the user. The companies page copies it.
alter table touchpoints add column if not exists contact text not null default '';

-- false: priority follows the due date (high within 2 days, med within a week, else low). true: the user chose it.
alter table actions add column if not exists priority_manual boolean not null default false;

notify pgrst, 'reload schema';
