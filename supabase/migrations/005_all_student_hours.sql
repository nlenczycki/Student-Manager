-- Migration 005 — per-student hours aggregate (all students at once)
-- Run this AFTER 001, 002, 003, and 004.

-- ===========================================================
-- ALL_STUDENT_TOTAL_HOURS — server-side aggregate, grouped by student
--
-- migration 003's student_total_hours(p_student_id) computes one
-- student's totals at a time — right for the Student detail page, where
-- you only ever need one student's numbers.
--
-- The Course page is different: it needs a "total time" figure for
-- EVERY student in the roster at once, to show as a column. Calling
-- student_total_hours() once per row (one round-trip per student) would
-- mean dozens of separate queries to render one table. This function
-- returns all students' totals in a single query instead, which the
-- Course page can then filter down to just the students in that course.
--
-- Same LEFT JOIN reasoning as course_total_hours (migration 004): a
-- student with zero logged sessions still appears, with 0 hours, rather
-- than being silently dropped from the results.
-- ===========================================================
create or replace function all_student_total_hours()
returns table (
  student_id uuid,
  total_flight_hours numeric,
  total_ground_hours numeric,
  session_count bigint
) as $$
  select
    s.id as student_id,
    coalesce(sum(fs.flight_instruction_hours), 0) as total_flight_hours,
    coalesce(sum(fs.ground_instruction_hours), 0) as total_ground_hours,
    count(fs.id) as session_count
  from students s
  left join flight_sessions fs on fs.student_id = s.id
  group by s.id;
$$ language sql stable security invoker;

grant execute on function all_student_total_hours() to authenticated;
