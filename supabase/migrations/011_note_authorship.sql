-- Migration 011 — note authorship display
-- Run this AFTER 001 through 010.
--
-- notes.created_by was already being recorded correctly on every insert
-- (see StudentDetail.jsx's addNote) — the gap was purely that nothing
-- displayed it. Rather than have the frontend fetch user_profiles
-- separately and match it up client-side for every note, this adds a
-- view that does the join once, server-side.
--
-- Falls back to 'Unknown' when created_by has no matching user_profiles
-- row (e.g. the user who wrote the note was later removed, or a note
-- was created before this app existed and backfilled without an
-- author) — so the UI always has something to show rather than a blank.

create or replace view notes_with_author as
select
  n.*,
  coalesce(up.full_name, 'Unknown') as author_name
from notes n
left join user_profiles up on up.user_id = n.created_by;

-- Views inherit the security context of the querying user by default in
-- Postgres (not the view owner's), so the existing RLS policies on
-- notes and user_profiles still apply transparently here — no separate
-- grant needed for authenticated users, who already have select access
-- to both underlying tables.
