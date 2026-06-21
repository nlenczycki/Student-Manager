-- Row-Level Security (RLS) — role-based access
-- Run this AFTER 001_initial_schema.sql
--
-- This implements the two-role model discussed (admin + instructor),
-- starting minimal on purpose per the MVP scope: every signed-in user
-- can read/write everything for now. We add a `user_roles` table so the
-- structure is there to tighten later (e.g. "only admins can archive
-- tags") without a schema change.

-- ===========================================================
-- USER_ROLES — links an authenticated user to a role
-- ===========================================================
create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'instructor', -- 'admin' | 'instructor'
  full_name text,
  created_at timestamptz not null default now()
);

-- Helper function: is the current user an admin?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ===========================================================
-- Enable RLS on every table
-- ===========================================================
alter table students enable row level security;
alter table tags enable row level security;
alter table student_tags enable row level security;
alter table notes enable row level security;
alter table student_snapshots enable row level security;
alter table flight_sessions enable row level security;
alter table user_roles enable row level security;

-- ===========================================================
-- STUDENTS — any signed-in user (admin or instructor) can read.
-- Only admins can insert/update/delete student records directly
-- (normal flow is via CSV import using the service role, not this policy).
-- ===========================================================
create policy "students_select_authenticated" on students
  for select using (auth.role() = 'authenticated');

create policy "students_admin_write" on students
  for all using (is_admin()) with check (is_admin());

-- ===========================================================
-- TAGS — any signed-in user can read active tags.
-- Only admins can create or archive tags (matches the "school admin
-- decides what tags exist" model from our design discussion).
-- ===========================================================
create policy "tags_select_authenticated" on tags
  for select using (auth.role() = 'authenticated');

create policy "tags_admin_write" on tags
  for insert with check (is_admin());

create policy "tags_admin_update" on tags
  for update using (is_admin()) with check (is_admin());

-- ===========================================================
-- STUDENT_TAGS — any signed-in user (instructor or admin) can apply
-- or remove tags. This is the day-to-day instructor action.
-- ===========================================================
create policy "student_tags_select_authenticated" on student_tags
  for select using (auth.role() = 'authenticated');

create policy "student_tags_insert_authenticated" on student_tags
  for insert with check (auth.role() = 'authenticated');

create policy "student_tags_delete_authenticated" on student_tags
  for delete using (auth.role() = 'authenticated');

-- ===========================================================
-- NOTES — any signed-in user can read and add notes.
-- Only the original author or an admin can edit/delete a note
-- (basic accountability — matches the "who wrote this" requirement
-- from the wireframe).
-- ===========================================================
create policy "notes_select_authenticated" on notes
  for select using (auth.role() = 'authenticated');

create policy "notes_insert_authenticated" on notes
  for insert with check (auth.role() = 'authenticated');

create policy "notes_modify_own_or_admin" on notes
  for update using (created_by = auth.uid() or is_admin());

create policy "notes_delete_own_or_admin" on notes
  for delete using (created_by = auth.uid() or is_admin());

-- ===========================================================
-- SNAPSHOTS / SESSIONS — read-only to all signed-in users.
-- Writes happen only via the import scripts using the Supabase
-- service role key (server-side), never from the browser client —
-- this is "synced data," not something instructors edit by hand,
-- matching the read-only framing from the wireframe.
-- ===========================================================
create policy "snapshots_select_authenticated" on student_snapshots
  for select using (auth.role() = 'authenticated');

create policy "sessions_select_authenticated" on flight_sessions
  for select using (auth.role() = 'authenticated');

-- ===========================================================
-- USER_ROLES — users can see their own role; only admins can change roles.
-- ===========================================================
create policy "user_roles_select_own_or_admin" on user_roles
  for select using (user_id = auth.uid() or is_admin());

create policy "user_roles_admin_write" on user_roles
  for all using (is_admin()) with check (is_admin());

-- ===========================================================
-- IMPORTANT — first-user bootstrap
-- RLS means NO ONE can grant the first admin role through the app
-- (every write to user_roles requires is_admin() to already be true).
-- After creating your own login, run this once manually in the SQL
-- Editor (using the Supabase service role, which bypasses RLS) to
-- make yourself an admin:
--
--   insert into user_roles (user_id, role, full_name)
--   values ('<your-auth-user-id>', 'admin', 'Your Name');
--
-- Find your user id under Authentication > Users in the Supabase dashboard.
