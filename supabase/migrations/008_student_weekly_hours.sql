-- Migration 008 — weekly hours aggregate for the student histogram
-- Run this AFTER 001 through 007.

-- ===========================================================
-- STUDENT_WEEKLY_HOURS — buckets one student's sessions by week
--
-- The histogram needs flight+ground hours summed per calendar week for
-- one student. Doing the date-bucketing in JS would mean fetching every
-- session row for that student to the browser; Postgres's date_trunc
-- does this in one pass server-side instead, returning one row per week
-- that actually has a session (no row for weeks with zero hours — the
-- frontend fills gaps for display).
-- ===========================================================
create or replace function student_weekly_hours(p_student_id uuid)
returns table (
  week_start date,
  flight_hours numeric,
  ground_hours numeric,
  total_hours numeric
) as $$
  select
    date_trunc('week', session_start)::date as week_start,
    coalesce(sum(flight_instruction_hours), 0) as flight_hours,
    coalesce(sum(ground_instruction_hours), 0) as ground_hours,
    coalesce(sum(flight_instruction_hours), 0) + coalesce(sum(ground_instruction_hours), 0) as total_hours
  from flight_sessions
  where student_id = p_student_id
    and session_start is not null
  group by date_trunc('week', session_start)
  order by week_start;
$$ language sql stable security invoker;

grant execute on function student_weekly_hours(uuid) to authenticated;
