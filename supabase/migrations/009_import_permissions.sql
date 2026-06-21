-- Migration 009 — import write permissions
-- Run this AFTER 001 through 008.
--
-- Until now, student_snapshots and flight_sessions only had SELECT
-- policies — writes were expected to go through load_to_supabase.py
-- using the Supabase service role key (which bypasses RLS entirely).
-- The new in-browser import tab writes from the client using the anon
-- key instead, so it needs real INSERT policies, gated by a new
-- capability rather than left open to every authenticated user.

create policy "snapshots_insert_with_capability" on student_snapshots
  for insert with check (has_capability('can_import_data'));

create policy "sessions_insert_with_capability" on flight_sessions
  for insert with check (has_capability('can_import_data'));

-- Grant this to the Owner profile so the bootstrap user can actually use
-- the import tab without a second manual step.
update profiles
set permissions = jsonb_set(
  permissions,
  '{capabilities,can_import_data}',
  'true'::jsonb
)
where name = 'Owner';
