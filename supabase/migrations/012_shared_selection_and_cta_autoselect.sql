-- Migration 012 — shared student selection + CTA auto-select
-- Run this AFTER 001 through 011.
--
-- TWO CHANGES:
--
-- 1. student_selections becomes SHARED across all users, reversing the
--    per-user design from migration 010. Previously each instructor had
--    their own independent "checked" set, isolated by RLS so nobody
--    could see or change anyone else's selections. This migration
--    removes that isolation: selection is now ONE list, shared by
--    everyone — any signed-in user can check/uncheck a student, and
--    that choice is immediately visible to and overwritable by everyone
--    else. selected_by is kept as an audit trail (who last toggled a
--    given student), not as an access boundary.
--
--    If two instructors are both using "Show selected" at the same time
--    expecting their OWN private working set, this change means they're
--    now sharing one set instead — worth knowing before relying on this
--    for personal triage lists.
--
-- 2. CTA imports now auto-select a student (add them to the shared
--    selection) when they have an assigned instructor and have not
--    graduated — matching the "currently active, being actively
--    worked with" signal the original tracker spreadsheet's manual "X"
--    column was approximating by hand. This only ADDS selections during
--    import; it never removes one, so a student manually selected for
--    other reasons isn't silently unselected by a later import.

-- ===========================================================
-- Convert student_selections to shared (drop user_id from the key)
-- ===========================================================
drop policy if exists "student_selections_own_only" on student_selections;

-- Collapse any existing per-user duplicate rows for the same student
-- down to one row before changing the primary key, keeping the most
-- recent selected_at as the survivor.
delete from student_selections a
using student_selections b
where a.student_id = b.student_id
  and a.selected_at < b.selected_at;

alter table student_selections drop constraint student_selections_pkey;
alter table student_selections rename column user_id to selected_by;
alter table student_selections alter column selected_by drop not null;
alter table student_selections add primary key (student_id);

-- Any authenticated user can read or write the shared selection list —
-- no per-user restriction, by design (see note above).
create policy "student_selections_shared_authenticated" on student_selections
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ===========================================================
-- CTA auto-select function — called from the import flow after a CTA
-- snapshot batch is loaded. Adds a row to student_selections for any
-- student in that batch with status != 'Graduated' AND a non-blank
-- instructor_name, who isn't already selected. Never removes existing
-- selections.
-- ===========================================================
create or replace function auto_select_active_cta_students(p_student_ids uuid[])
returns integer as $$
declare
  v_count integer;
begin
  insert into student_selections (student_id, selected_by, selected_at)
  select s.id, auth.uid(), now()
  from students s
  where s.id = any(p_student_ids)
    and s.status is distinct from 'Graduated'
    and s.instructor_name is not null
    and s.instructor_name <> ''
  on conflict (student_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security invoker;

grant execute on function auto_select_active_cta_students(uuid[]) to authenticated;

-- ===========================================================
-- Grant the Owner profile sidebar access to the new Manage Users page
-- ===========================================================
update profiles
set permissions = jsonb_set(
  permissions,
  '{sidebar,users}',
  'true'::jsonb
)
where name = 'Owner';
