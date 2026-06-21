-- Migration 010 — weekly progress data + per-user student selection
-- Run this AFTER 001 through 009.
--
-- Two independent additions:
--
-- 1. STUDENT_WEEKLY_PROGRESS — mirrors the structure of the uploaded
--    "Analysis" tracker tab: one row per student per week, with Total
--    Activities, Flight count + hours, Ground count + hours, and
--    Cancels — matching exactly what that spreadsheet computes by hand
--    from the Reservations/Cancellations sheets. This is DERIVED data
--    (computed from flight_sessions, the same source as everything
--    else), not hand-entered, so it's populated by an aggregate
--    function rather than direct import — see student_weekly_progress()
--    below.
--
-- 2. STUDENT_SELECTIONS — the "checkbox to select students" feature.
--    This is deliberately PER-USER (scoped by user_id), not a single
--    global flag on the students table — two instructors selecting
--    different students for their own "show selected" view shouldn't
--    overwrite each other. This replaces the spreadsheet's single
--    shared "X" column (which only supports one global current
--    selection) with something that works the same way the spreadsheet
--    author was already using it, but without the collision risk.

-- ===========================================================
-- CANCELLATIONS — append-only, mirrors flight_sessions' import pattern
-- exactly. Confirmed via the uploaded cancellationsreportexport CSV
-- that cancellations come from FlightCircle's separate Cancellations
-- report, not a status flag on flight_sessions — this replaces the
-- earlier "status ilike '%cancel%'" guess in student_weekly_progress
-- below with a real join against actual cancellation data.
-- ===========================================================
create table cancellations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id), -- nullable: matched after import via name_key, same as flight_sessions
  student_name_key text not null,
  dedup_key text not null unique, -- same dedup approach as flight_sessions.dedup_key
  cancelled_at timestamptz, -- the "Cancelled" column: when the cancellation was logged
  session_depart timestamptz, -- the "Depart" column: the date/time of the session that got cancelled — this is what determines which WEEK the cancellation counts against
  instructor_name text,
  cancelled_by text,
  cancellation_reason text,
  cancellation_notes text,
  notice text,
  source text not null default 'flightcircle_cancellations_export',
  source_file text,
  imported_at timestamptz not null default now()
);

create index idx_cancellations_student_key on cancellations (student_name_key);
create index idx_cancellations_depart on cancellations (session_depart);

alter table cancellations enable row level security;

create policy "cancellations_select_authenticated" on cancellations
  for select using (auth.role() = 'authenticated');

create policy "cancellations_insert_with_capability" on cancellations
  for insert with check (has_capability('can_import_data'));

-- ===========================================================
-- STUDENT_SELECTIONS
-- ===========================================================
create table student_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (user_id, student_id)
);

alter table student_selections enable row level security;

-- Each user can only see and modify their own selections — there's no
-- reason another instructor's selection state should be visible or
-- editable by someone else.
create policy "student_selections_own_only" on student_selections
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================
-- STUDENT_WEEKLY_PROGRESS — server-side aggregate, mirrors the
-- tracker spreadsheet's Analysis tab exactly: one row per student per
-- ISO week, broken into the same six metrics the spreadsheet computes.
--
-- "Flights" / "Grounds" here count SESSIONS (rows in flight_sessions),
-- not hours — matching the spreadsheet's "Flights" and "Grounds" columns
-- being counts, with separate "Hours" columns alongside them. Cancels
-- counts sessions where status indicates a cancellation; flight_sessions
-- does not currently have a dedicated cancelled flag, so this counts
-- session_type/status values containing "Cancel" — if your FlightCircle
-- export uses a different status string for cancellations, this
-- predicate needs adjusting to match (check actual Status values in
-- your data; the original tracker pulled cancellations from a separate
-- "Cancellations" sheet that isn't part of this schema).
-- ===========================================================
create or replace function student_weekly_progress(p_student_id uuid)
returns table (
  week_start date,
  total_activities bigint,
  flights bigint,
  flight_hours numeric,
  grounds bigint,
  ground_hours numeric,
  cancels bigint
) as $$
  with sessions_by_week as (
    select
      date_trunc('week', session_start)::date as week_start,
      count(*) as total_activities,
      count(*) filter (where flight_instruction_hours > 0) as flights,
      coalesce(sum(flight_instruction_hours), 0) as flight_hours,
      count(*) filter (where ground_instruction_hours > 0) as grounds,
      coalesce(sum(ground_instruction_hours), 0) as ground_hours
    from flight_sessions
    where student_id = p_student_id
      and session_start is not null
    group by date_trunc('week', session_start)
  ),
  cancels_by_week as (
    select
      date_trunc('week', session_depart)::date as week_start,
      count(*) as cancels
    from cancellations
    where student_id = p_student_id
      and session_depart is not null
    group by date_trunc('week', session_depart)
  )
  select
    coalesce(s.week_start, c.week_start) as week_start,
    coalesce(s.total_activities, 0) as total_activities,
    coalesce(s.flights, 0) as flights,
    coalesce(s.flight_hours, 0) as flight_hours,
    coalesce(s.grounds, 0) as grounds,
    coalesce(s.ground_hours, 0) as ground_hours,
    coalesce(c.cancels, 0) as cancels
  from sessions_by_week s
  full outer join cancels_by_week c using (week_start)
  order by week_start;
$$ language sql stable security invoker;

grant execute on function student_weekly_progress(uuid) to authenticated;

-- ===========================================================
-- ALL_STUDENTS_WEEKLY_TOTALS — same idea as all_student_total_hours
-- (migration 005): one query returning every student's weekly figures
-- at once, so the Weekly Progress table doesn't make one RPC call per
-- row. Returns one row per (student, week) pair across ALL students —
-- the frontend pivots this into a table with weeks as columns.
-- ===========================================================
create or replace function all_students_weekly_progress()
returns table (
  student_id uuid,
  week_start date,
  total_activities bigint,
  flights bigint,
  flight_hours numeric,
  grounds bigint,
  ground_hours numeric,
  cancels bigint
) as $$
  with sessions_by_week as (
    select
      fs.student_id,
      date_trunc('week', fs.session_start)::date as week_start,
      count(*) as total_activities,
      count(*) filter (where fs.flight_instruction_hours > 0) as flights,
      coalesce(sum(fs.flight_instruction_hours), 0) as flight_hours,
      count(*) filter (where fs.ground_instruction_hours > 0) as grounds,
      coalesce(sum(fs.ground_instruction_hours), 0) as ground_hours
    from flight_sessions fs
    where fs.student_id is not null
      and fs.session_start is not null
    group by fs.student_id, date_trunc('week', fs.session_start)
  ),
  cancels_by_week as (
    select
      c.student_id,
      date_trunc('week', c.session_depart)::date as week_start,
      count(*) as cancels
    from cancellations c
    where c.student_id is not null
      and c.session_depart is not null
    group by c.student_id, date_trunc('week', c.session_depart)
  )
  select
    coalesce(s.student_id, c.student_id) as student_id,
    coalesce(s.week_start, c.week_start) as week_start,
    coalesce(s.total_activities, 0) as total_activities,
    coalesce(s.flights, 0) as flights,
    coalesce(s.flight_hours, 0) as flight_hours,
    coalesce(s.grounds, 0) as grounds,
    coalesce(s.ground_hours, 0) as ground_hours,
    coalesce(c.cancels, 0) as cancels
  from sessions_by_week s
  full outer join cancels_by_week c using (student_id, week_start);
$$ language sql stable security invoker;

grant execute on function all_students_weekly_progress() to authenticated;

-- ===========================================================
-- Sidebar + element permission keys for the new tab — add to the Owner
-- profile so the bootstrap user sees it immediately. Other profiles
-- need this granted manually via the Permissions page, same as any
-- other sidebar item.
-- ===========================================================
update profiles
set permissions = jsonb_set(
  permissions,
  '{sidebar,weekly_progress}',
  'true'::jsonb
)
where name = 'Owner';
