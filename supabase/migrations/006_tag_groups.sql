-- Migration 006 — tag groups
-- Run this AFTER 001 through 005.
--
-- Adds a `group_name` column to tags, separate from the existing
-- `category` column. They serve different purposes:
--
--   - category ('flag' | 'strength' | 'admin'): controls VISUAL styling
--     only (e.g. flags render in amber, strengths could render in
--     green). This already existed and isn't changing.
--
--   - group_name (new, e.g. 'Progress', 'Course', 'Issue'): controls
--     ORGANIZATION — which section of the tag-management UI and the
--     tag picker a tag appears under. This is what lets a school have
--     "Progress" tags (Behind pace, Ahead of schedule), "Course" tags
--     (PPL Track, Instrument Track), and "Issue" tags (Medical expiring,
--     Billing hold) as visually distinct, separately-manageable groups,
--     rather than one flat list of tags.
--
-- A tag can exist with no group (group_name is nullable) — it'll show
-- up under "Ungrouped" rather than being forced into a category.

alter table tags add column group_name text;

create index idx_tags_group_name on tags (group_name);

-- Backfill a sensible default group for the tags seeded in earlier
-- conversations/migrations, so existing data doesn't end up "Ungrouped"
-- after this migration runs. Adjust or skip this UPDATE if your tags
-- table doesn't have these exact labels.
update tags set group_name = 'Progress'
where label in ('Behind pace', 'Checkride candidate', 'No recent activity', 'Strong progress')
  and group_name is null;
