-- Flight School CRM — initial schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
-- This implements the data model discussed: students with a separate
-- tags table (many-to-many via student_tags), freeform notes, and
-- append-only snapshot/session tables for data imported from CTA and
-- FlightCircle.

-- ===========================================================
-- STUDENTS — stable identity record
-- ===========================================================
create table students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null, -- normalized lowercase name, used for CSV import matching
  course text,
  status text not null default 'Active', -- 'Active' | 'Graduated'
  instructor_name text,
  enrolled_date date,
  graduated_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_students_name_key on students (name_key);
create index idx_students_status on students (status);

-- ===========================================================
-- TAGS — defined once, soft-deletable (see "active" flag)
-- This is the table we discussed: never hard-delete a tag that's in use,
-- archive it instead so history is preserved.
-- ===========================================================
create table tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text not null default 'flag', -- 'flag' | 'strength' | 'admin'
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ===========================================================
-- STUDENT_TAGS — the join table (many-to-many relationship)
-- ===========================================================
create table student_tags (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  tag_id uuid not null references tags(id), -- intentionally NOT on delete cascade —
                                              -- see schema notes: tags are archived, not deleted,
                                              -- so this reference should never need to cascade
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now(),
  unique (student_id, tag_id)
);

create index idx_student_tags_student on student_tags (student_id);
create index idx_student_tags_tag on student_tags (tag_id);

-- ===========================================================
-- NOTES — freeform notes per student, categorized
-- ===========================================================
create table notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  category text not null default 'Progress', -- 'Progress' | 'Concern' | 'Admin'
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_notes_student on notes (student_id);

-- ===========================================================
-- STUDENT_SNAPSHOTS — append-only history from CTA exports
-- One row per student per import. Never overwritten — see the
-- snapshot-vs-overwrite discussion. This is what lets you chart a
-- student's phase progression over time.
-- ===========================================================
create table student_snapshots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id), -- nullable: matched after import via name_key
  student_name_key text not null,
  snapshot_date date not null,
  status text,
  course text,
  phase_list text, -- semicolon-separated, e.g. "7;8" (kept as text — phases can have letter suffixes like "4A")
  all_phases_completed boolean default false,
  graduated_date date,
  last_flight_date date,
  instructor_name text,
  source text not null default 'cta_export',
  source_file text,
  imported_at timestamptz not null default now()
);

create index idx_snapshots_student_key on student_snapshots (student_name_key);
create index idx_snapshots_date on student_snapshots (snapshot_date);

-- ===========================================================
-- FLIGHT_SESSIONS — append-only event log from FlightCircle exports
-- Naturally append-only (each reservation happened once). Dedup is
-- handled at import time using the dedup_key (see import script).
-- ===========================================================
create table flight_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id), -- nullable: matched after import via name_key
  student_name_key text not null,
  dedup_key text not null unique, -- prevents re-importing the same reservation twice
  session_start timestamptz,
  session_end timestamptz,
  session_type text,
  instructor_name text,
  aircraft text,
  tail_number text,
  status text,
  hobbs_total numeric,
  flight_instruction_hours numeric,
  ground_instruction_hours numeric,
  public_notes text,
  location text,
  source text not null default 'flightcircle_export',
  source_file text,
  imported_at timestamptz not null default now()
);

create index idx_sessions_student_key on flight_sessions (student_name_key);
create index idx_sessions_start on flight_sessions (session_start);

-- ===========================================================
-- updated_at trigger for students
-- ===========================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_students_updated_at
  before update on students
  for each row execute function set_updated_at();
