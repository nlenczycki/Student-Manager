// permissions.js
//
// Small helpers for reading the current user's profile permissions.
// See migration 007 for the schema and the important distinction
// between "visibility" (UI-only) and "capabilities" (real RLS-backed
// security) — these helpers read both, but only `capabilities` reflects
// an actual enforced boundary. Hiding a sidebar item or page element
// with these helpers is a convenience, not a guarantee that a profile
// can't reach that data some other way (e.g. direct API access).

export function canSeeSidebarItem(profile, key) {
  if (!profile) return false;
  return Boolean(profile.permissions?.sidebar?.[key]);
}

export function canSeeElement(profile, key) {
  if (!profile) return false;
  return Boolean(profile.permissions?.elements?.[key]);
}

export function hasCapability(profile, key) {
  if (!profile) return false;
  return Boolean(profile.permissions?.capabilities?.[key]);
}

// The full set of keys the app currently understands, used by the
// Permissions management UI to render checkboxes without needing them
// hardcoded separately in that component. Add a new sidebar item, page
// element, or capability here FIRST, then reference it from the
// relevant component — keeps this file as the single source of truth
// for "what permissions exist."
export const SIDEBAR_KEYS = [
  { key: 'school', label: 'School overview' },
  { key: 'weekly_progress', label: 'Weekly Progress' },
  { key: 'courses', label: 'Courses' },
  { key: 'student', label: 'Student search' },
  { key: 'tags', label: 'Manage tags' },
  { key: 'permissions', label: 'Manage permissions' },
  { key: 'users', label: 'Manage users' },
  { key: 'import', label: 'Import data' },
];

export const ELEMENT_KEYS = [
  { key: 'student.progress', label: 'Student page — Progress' },
  { key: 'student.flight_activity', label: 'Student page — Flight activity' },
  { key: 'student.hours_chart', label: 'Student page — Weekly hours chart' },
  { key: 'student.milestones', label: 'Student page — Milestones' },
  { key: 'student.tags', label: 'Student page — Tags' },
  { key: 'student.notes', label: 'Student page — Notes' },
];

export const CAPABILITY_KEYS = [
  { key: 'can_manage_tags', label: 'Create and archive tags' },
  { key: 'can_manage_profiles', label: 'Create and edit permission profiles' },
  { key: 'can_edit_any_note', label: "Edit or delete other instructors' notes" },
  { key: 'can_manage_students', label: 'Edit student records directly' },
  { key: 'can_import_data', label: 'Import CTA / FlightCircle spreadsheet data' },
];
