-- Migration 003 — cumulative hours aggregate + milestones table
-- Run this AFTER 001_initial_schema.sql and 002_row_level_security.sql.

-- ===========================================================
-- CUMULATIVE HOURS — server-side aggregate, not a client-side sum
--
-- Why an RPC function instead of summing in the browser: the "recent
-- lessons" table intentionally only fetches the last 10 sessions (so the
-- page stays fast as a student accumulates years of history). But a
-- "total hours" figure needs to reflect EVERY session, not just the 10
-- shown. Pulling potentially hundreds of rows to the browser just to add
-- them up client-side would be slow and wasteful — Postgres can do this
-- in one query without shipping the rows over the network at all.
-- ===========================================================
create or replace function student_total_hours(p_student_id uuid)
returns table (
  total_flight_hours numeric,
  total_ground_hours numeric,
  total_hobbs numeric,
  session_count bigint
) as $$
  select
    coalesce(sum(flight_instruction_hours), 0) as total_flight_hours,
    coalesce(sum(ground_instruction_hours), 0) as total_ground_hours,
    coalesce(sum(hobbs_total), 0) as total_hobbs,
    count(*) as session_count
  from flight_sessions
  where student_id = p_student_id;
$$ language sql stable security invoker;

-- Any authenticated user can call this (it only reads flight_sessions,
-- which already has a select policy for authenticated users).
grant execute on function student_total_hours(uuid) to authenticated;

-- ===========================================================
-- MILESTONES — discrete checklist items per student
--
-- Neither CTA nor FlightCircle exports give us discrete milestone flags
-- (e.g. "First Solo completed on this date") — that data doesn't exist
-- in either source. This is a genuinely new concept, separate from tags:
--
--   - tags: open-ended, many-per-student, school-defined labels
--     ("Behind pace", "Checkride candidate") — no inherent order,
--     no "completed" state, can be added/removed freely.
--   - milestones: a FIXED, ordered checklist that's the same shape for
--     every student in a course (First Solo, Solo XC, Written Exam,
--     Checkride Scheduled) — each one is either done or not done, with
--     a date when it was completed.
--
-- Two tables, same shape of relationship as tags: a definitions table
-- (milestones) and a per-student completion table (student_milestones).
-- ===========================================================

create table milestones (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  course text, -- nullable: a milestone can be course-specific, or null = applies to all courses
  sort_order integer not null default 0, -- controls display order in the checklist
  active boolean not null default true, -- soft-delete, same pattern as tags — see tags table notes
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table student_milestones (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  milestone_id uuid not null references milestones(id), -- not on delete cascade — milestones are archived, not deleted
  completed_at date,
  completed_by uuid references auth.users(id),
  notes text, -- optional short note, e.g. "signed off by J. Alvarez"
  created_at timestamptz not null default now(),
  unique (student_id, milestone_id)
);

create index idx_student_milestones_student on student_milestones (student_id);

-- Seed a reasonable default checklist (matches the wireframe). Edit or
-- add to this list freely — it's just initial data, not a fixed schema.
insert into milestones (label, sort_order) values
  ('First Solo', 1),
  ('Solo Cross-Country', 2),
  ('Written Exam Passed', 3),
  ('Checkride Scheduled', 4);

-- ===========================================================
-- RLS for the new tables — same pattern as tags/student_tags:
-- everyone signed in can read; only admins manage the definitions;
-- any signed-in user can check off a milestone for a student.
-- ===========================================================
alter table milestones enable row level security;
alter table student_milestones enable row level security;

create policy "milestones_select_authenticated" on milestones
  for select using (auth.role() = 'authenticated');

create policy "milestones_admin_write" on milestones
  for insert with check (is_admin());

create policy "milestones_admin_update" on milestones
  for update using (is_admin()) with check (is_admin());

create policy "student_milestones_select_authenticated" on student_milestones
  for select using (auth.role() = 'authenticated');

create policy "student_milestones_insert_authenticated" on student_milestones
  for insert with check (auth.role() = 'authenticated');

create policy "student_milestones_update_authenticated" on student_milestones
  for update using (auth.role() = 'authenticated');

create policy "student_milestones_delete_authenticated" on student_milestones
  for delete using (auth.role() = 'authenticated');
