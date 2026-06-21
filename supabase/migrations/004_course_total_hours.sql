-- Migration 004 — course-level hours aggregate
-- Run this AFTER 001, 002, and 003.

-- ===========================================================
-- COURSE_TOTAL_HOURS — server-side aggregate, grouped by course
--
-- Same reasoning as student_total_hours (migration 003): the School
-- view needs a "total time" figure per course, summed across every
-- student and every session in that course. Pulling all flight_sessions
-- rows to the browser just to sum them client-side would mean shipping
-- potentially thousands of rows over the network for a handful of
-- numbers — this does the sum inside Postgres instead, returning one
-- row per course.
--
-- Uses a LEFT JOIN (not an inner join) so courses with students but no
-- logged sessions yet still show up with 0 hours, rather than vanishing
-- from the results entirely.
-- ===========================================================
create or replace function course_total_hours()
returns table (
  course text,
  total_flight_hours numeric,
  total_ground_hours numeric,
  session_count bigint
) as $$
  select
    coalesce(s.course, 'Unassigned') as course,
    coalesce(sum(fs.flight_instruction_hours), 0) as total_flight_hours,
    coalesce(sum(fs.ground_instruction_hours), 0) as total_ground_hours,
    count(fs.id) as session_count
  from students s
  left join flight_sessions fs on fs.student_id = s.id
  group by coalesce(s.course, 'Unassigned');
$$ language sql stable security invoker;

grant execute on function course_total_hours() to authenticated;
