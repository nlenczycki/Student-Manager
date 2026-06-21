-- Migration 007 — custom permission profiles (replaces admin/instructor)
-- Run this AFTER 001 through 006.
--
-- This REPLACES the hardcoded two-role system from migration 002 with
-- fully custom, admin-defined profiles (e.g. "Front Desk", "Senior
-- Instructor", "Owner"). Each profile has its own JSON permission
-- structure controlling:
--
--   1. Which sidebar items are visible (school / courses / student / tags / permissions / import)
--   2. Which elements are visible on each page (e.g. can this profile
--      see the Notes section? The Tags section? The hours histogram?)
--   3. A small set of WRITE capabilities that map to real RLS checks —
--      this is the only part of "permissions" that's an actual security
--      boundary. See the note below.
--
-- IMPORTANT DISTINCTION — read this before assuming the UI checkboxes
-- are a complete security model:
--
--   - Visibility permissions (sidebar items, page elements) are a UI
--     convenience. They control what a profile SEES in the app. They
--     are enforced only in the React code, not the database. A
--     technically sophisticated user could bypass them by calling the
--     Supabase API directly.
--
--   - Write permissions (can_manage_tags, can_manage_profiles,
--     can_edit_any_note, can_manage_students) are real security
--     boundaries, enforced by RLS policies below. These cannot be
--     bypassed by going around the UI.
--
-- If a school's permission needs go beyond "tidier UI per role" into
-- "this profile must NEVER be able to see X data even via direct API
-- access" — that requires a real RLS policy per case, not just a
-- visibility flag. The four write capabilities below cover the cases
-- that mattered in this app's design so far; extending this list means
-- adding both a JSON key AND a corresponding RLS check, not just a flag.

-- ===========================================================
-- Clean up the old role system
-- ===========================================================
drop policy if exists "students_admin_write" on students;
drop policy if exists "tags_admin_write" on tags;
drop policy if exists "tags_admin_update" on tags;
drop policy if exists "notes_modify_own_or_admin" on notes;
drop policy if exists "notes_delete_own_or_admin" on notes;
drop policy if exists "user_roles_select_own_or_admin" on user_roles;
drop policy if exists "user_roles_admin_write" on user_roles;
-- These two were added later by migration 003 (milestones didn't exist
-- yet when 002 first wrote the is_admin()-based policies) and were
-- initially missed here — without dropping them first, dropping
-- is_admin() below fails with "cannot drop function ... other objects
-- depend on it". Both are recreated further down using has_capability()
-- instead, so milestone management keeps working under the new system.
drop policy if exists "milestones_admin_write" on milestones;
drop policy if exists "milestones_admin_update" on milestones;
drop function if exists is_admin();

-- user_roles is superseded by profiles + user_profiles below. Renaming
-- rather than dropping outright preserves any existing admin/instructor
-- assignments as a fallback record, in case you want to cross-reference
-- who had which old role while reassigning new profiles.
alter table user_roles rename to user_roles_legacy;

-- ===========================================================
-- PROFILES — admin-defined permission sets
-- ===========================================================
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- e.g. "Owner", "Senior Instructor", "Front Desk"
  description text,
  is_system boolean not null default false, -- true only for the seeded "Owner" profile — see bootstrap note below
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ===========================================================
-- USER_PROFILES — links an authenticated user to exactly one profile
-- ===========================================================
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  full_name text,
  created_at timestamptz not null default now()
);

-- Helper: does the current user's profile have a given write capability?
-- Write capabilities live under permissions->'capabilities'->'<key>' as a
-- boolean, e.g. permissions = '{"capabilities": {"can_manage_tags": true}}'
create or replace function has_capability(capability_key text)
returns boolean as $$
  select coalesce(
    (
      select (p.permissions -> 'capabilities' ->> capability_key)::boolean
      from user_profiles up
      join profiles p on p.id = up.profile_id
      where up.user_id = auth.uid()
    ),
    false
  );
$$ language sql security definer stable;

-- ===========================================================
-- Seed the bootstrap "Owner" profile — has every capability, cannot be
-- deleted (is_system = true). Without at least one profile that can
-- manage profiles, no one could ever create the second profile.
-- ===========================================================
insert into profiles (name, description, is_system, permissions) values (
  'Owner',
  'Full access to every page, element, and write action. Cannot be deleted.',
  true,
  '{
    "sidebar": {
      "school": true, "courses": true, "student": true,
      "tags": true, "permissions": true, "import": true
    },
    "elements": {
      "student.progress": true, "student.flight_activity": true,
      "student.milestones": true, "student.tags": true, "student.notes": true,
      "student.hours_chart": true
    },
    "capabilities": {
      "can_manage_tags": true,
      "can_manage_profiles": true,
      "can_edit_any_note": true,
      "can_manage_students": true
    }
  }'::jsonb
);

-- ===========================================================
-- Enable RLS on the new tables
-- ===========================================================
alter table profiles enable row level security;
alter table user_profiles enable row level security;

-- Anyone signed in can read profile definitions (needed so the app can
-- render sidebar/element visibility for their own profile). Only
-- holders of can_manage_profiles can create/edit/delete profiles — and
-- the Owner profile additionally can't be deleted at all (enforced below).
create policy "profiles_select_authenticated" on profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_insert_with_capability" on profiles
  for insert with check (has_capability('can_manage_profiles'));

create policy "profiles_update_with_capability" on profiles
  for update using (has_capability('can_manage_profiles'))
  with check (has_capability('can_manage_profiles'));

create policy "profiles_delete_with_capability" on profiles
  for delete using (has_capability('can_manage_profiles') and is_system = false);

create policy "user_profiles_select_own_or_capable" on user_profiles
  for select using (user_id = auth.uid() or has_capability('can_manage_profiles'));

create policy "user_profiles_write_with_capability" on user_profiles
  for all using (has_capability('can_manage_profiles'))
  with check (has_capability('can_manage_profiles'));

-- ===========================================================
-- Re-create the policies that previously used is_admin(), now using
-- has_capability() against the specific capability that matches their
-- original intent.
-- ===========================================================
create policy "students_write_with_capability" on students
  for all using (has_capability('can_manage_students'))
  with check (has_capability('can_manage_students'));

create policy "tags_insert_with_capability" on tags
  for insert with check (has_capability('can_manage_tags'));

create policy "tags_update_with_capability" on tags
  for update using (has_capability('can_manage_tags'))
  with check (has_capability('can_manage_tags'));

-- Recreated from migration 003's milestones_admin_write /
-- milestones_admin_update (originally is_admin()-based — see the drop
-- above for why). Reuses can_manage_tags rather than introducing a
-- separate capability: milestones are the same kind of school-curated
-- structure as tags, so one toggle covers both rather than spreading
-- permission checkboxes thin across conceptually similar features.
create policy "milestones_insert_with_capability" on milestones
  for insert with check (has_capability('can_manage_tags'));

create policy "milestones_update_with_capability" on milestones
  for update using (has_capability('can_manage_tags'))
  with check (has_capability('can_manage_tags'));

create policy "notes_modify_own_or_capable" on notes
  for update using (created_by = auth.uid() or has_capability('can_edit_any_note'));

create policy "notes_delete_own_or_capable" on notes
  for delete using (created_by = auth.uid() or has_capability('can_edit_any_note'));

-- ===========================================================
-- IMPORTANT — bootstrap step, same idea as before but for profiles now.
-- RLS means no signed-in user can assign themselves a profile (every
-- write to user_profiles requires can_manage_profiles, which requires
-- already having a profile). After creating your own login, run this
-- once manually in the SQL Editor to assign yourself the Owner profile:
--
--   insert into user_profiles (user_id, profile_id, full_name)
--   select '<your-auth-user-id>', id, 'Your Name' from profiles where name = 'Owner';
--
-- Find your user id under Authentication > Users in the Supabase
-- dashboard. If you previously had an admin role from migration 002,
-- you need to redo this bootstrap step under the new profiles system —
-- the old user_roles assignment does not automatically carry over.
