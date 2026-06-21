import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { canSeeSidebarItem } from '../lib/permissions';
import Sidebar from '../components/Sidebar';
import SchoolView from './SchoolView';
import CourseView from './CourseView';
import StudentView from './StudentView';
import TagsView from './TagsView';
import PermissionsView from './PermissionsView';
import UsersView from './UsersView';
import ImportView from './ImportView';
import WeeklyProgressView from './WeeklyProgressView';

export default function Dashboard({ session }) {
  const [students, setStudents] = useState([]);
  const [tags, setTags] = useState([]); // active tags only — used by pickers across the app
  const [allTags, setAllTags] = useState([]); // active + archived — used only by the tag management page
  const [studentTags, setStudentTags] = useState([]);
  const [studentHours, setStudentHours] = useState([]);
  const [studentSelections, setStudentSelections] = useState([]); // this user's own checked students — see migration 010
  const [profile, setProfile] = useState(null); // current user's full profile, including permissions
  const [loading, setLoading] = useState(true);

  // Shared "include graduated students" toggle — applies across School,
  // Course, and Student views so the behavior is consistent everywhere,
  // not three separate filters that could drift out of sync.
  const [showGraduated, setShowGraduated] = useState(false);

  // Shared "show all students vs. only my checked ones" toggle. Mirrors
  // showGraduated's pattern — one switch, applied consistently across
  // School (totals), Course (roster), and anywhere else a student list
  // appears, rather than a per-page filter that could drift out of sync.
  const [selectionMode, setSelectionMode] = useState('all'); // 'all' | 'selected'

  // Navigation state
  const [view, setView] = useState('school'); // 'school' | 'weekly_progress' | 'course' | 'student' | 'tags' | 'permissions' | 'users' | 'import'
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [
      { data: studentRows },
      { data: tagRows },
      { data: allTagRows },
      { data: studentTagRows },
      { data: studentHoursRows },
      { data: selectionRows },
      { data: userProfileRow },
    ] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('tags').select('*').eq('active', true).order('group_name').order('label'),
      supabase.from('tags').select('*').order('group_name').order('label'),
      supabase.from('student_tags').select('*'),
      // One query, covers every student's cumulative hours — used by both
      // the School page (averaged per course) and the Course page (shown
      // per student). See migration 005 for why this is a single
      // all-students aggregate rather than one call per student.
      supabase.rpc('all_student_total_hours'),
      // Selection is shared across all users as of migration 012 — this
      // returns every selected student, not just the current user's.
      supabase.from('student_selections').select('student_id'),
      // Fetch the user's profile assignment, joined with the full
      // permissions JSON from profiles. RLS only lets a user see their
      // own user_profiles row unless they hold can_manage_profiles — see
      // migration 007. .maybeSingle() because a brand new user won't
      // have a profile assigned yet (treated as no permissions below).
      supabase
        .from('user_profiles')
        .select('full_name, profiles(id, name, permissions)')
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ]);
    setStudents(studentRows || []);
    setTags(tagRows || []);
    setAllTags(allTagRows || []);
    setStudentTags(studentTagRows || []);
    setStudentHours(studentHoursRows || []);
    setStudentSelections(selectionRows || []);
    setProfile(userProfileRow?.profiles || null);
    setLoading(false);
  }

  async function toggleSelection(studentId, currentlySelected) {
    // Selection is shared across all users (migration 012) — keyed by
    // student_id alone, not scoped to the current user. selected_by is
    // still recorded as an audit trail of who last toggled it, but
    // doesn't restrict who can see or change it.
    if (currentlySelected) {
      await supabase.from('student_selections').delete().eq('student_id', studentId);
    } else {
      await supabase.from('student_selections').insert({ student_id: studentId, selected_by: session.user.id });
    }
    loadData();
  }

  async function toggleTag(studentId, tagId, currentlyApplied) {
    if (currentlyApplied) {
      await supabase.from('student_tags').delete().match({ student_id: studentId, tag_id: tagId });
    } else {
      await supabase.from('student_tags').insert({
        student_id: studentId,
        tag_id: tagId,
        added_by: session.user.id,
      });
    }
    loadData();
  }

  const courses = useMemo(() => {
    const set = new Set(students.map((s) => s.course || 'Unassigned'));
    return Array.from(set).sort();
  }, [students]);

  function handleSelectCourse(course) {
    setSelectedCourse(course);
    setView('course');
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading roster…</div>;
  }

  if (!profile) {
    return (
      <div className="p-8 max-w-md mx-auto text-sm text-gray-600">
        <p className="font-medium mb-2">No profile assigned yet</p>
        <p className="mb-4">
          Your account is signed in but hasn't been assigned a permission profile, so there's nothing this
          screen is allowed to show you. An Owner needs to assign you a profile under Manage Permissions, or —
          if you're setting this up for the first time — follow the bootstrap step in SETUP.md / migration 007
          to assign yourself the Owner profile directly in Supabase.
        </p>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-gray-500 underline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        view={view}
        setView={setView}
        courses={courses}
        selectedCourse={selectedCourse}
        setSelectedCourse={setSelectedCourse}
        profile={profile}
      />

      <div className="flex-1">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showGraduated}
                onChange={(e) => setShowGraduated(e.target.checked)}
              />
              Show graduated students
            </label>

            <div className="flex items-center gap-1 text-sm border border-gray-200 rounded-md p-0.5">
              <button
                onClick={() => setSelectionMode('all')}
                className={`px-2 py-1 rounded ${selectionMode === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
              >
                Show all
              </button>
              <button
                onClick={() => setSelectionMode('selected')}
                className={`px-2 py-1 rounded ${selectionMode === 'selected' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
              >
                Show selected ({studentSelections.length})
              </button>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-gray-500">
            Sign out
          </button>
        </div>

        {view === 'school' && canSeeSidebarItem(profile, 'school') && (
          <SchoolView
            students={students}
            tags={tags}
            studentTags={studentTags}
            studentHours={studentHours}
            studentSelections={studentSelections}
            selectionMode={selectionMode}
            showGraduated={showGraduated}
            onSelectCourse={handleSelectCourse}
          />
        )}

        {view === 'weekly_progress' && canSeeSidebarItem(profile, 'weekly_progress') && (
          <WeeklyProgressView
            students={students}
            studentSelections={studentSelections}
            selectionMode={selectionMode}
            showGraduated={showGraduated}
          />
        )}

        {view === 'course' && selectedCourse && canSeeSidebarItem(profile, 'courses') && (
          <CourseView
            course={selectedCourse}
            students={students}
            tags={tags}
            studentTags={studentTags}
            studentHours={studentHours}
            studentSelections={studentSelections}
            selectionMode={selectionMode}
            showGraduated={showGraduated}
            session={session}
            profile={profile}
            onToggleTag={toggleTag}
            onToggleSelection={toggleSelection}
          />
        )}

        {view === 'student' && canSeeSidebarItem(profile, 'student') && (
          <StudentView
            studentId={selectedStudentId}
            students={students}
            tags={tags}
            studentTags={studentTags}
            session={session}
            profile={profile}
            showGraduated={showGraduated}
            onSelectStudent={setSelectedStudentId}
            onToggleTag={toggleTag}
          />
        )}

        {view === 'tags' && canSeeSidebarItem(profile, 'tags') && (
          <TagsView allTags={allTags} onReload={loadData} />
        )}

        {view === 'permissions' && canSeeSidebarItem(profile, 'permissions') && <PermissionsView />}

        {view === 'users' && canSeeSidebarItem(profile, 'users') && <UsersView />}

        {view === 'import' && canSeeSidebarItem(profile, 'import') && <ImportView onImportComplete={loadData} />}
      </div>
    </div>
  );
}
