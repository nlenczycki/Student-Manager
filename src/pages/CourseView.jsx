import { useState } from 'react';
import { TagPill } from '../components/Shared';
import StudentDetail from '../components/StudentDetail';

export default function CourseView({
  course,
  students,
  tags,
  studentTags,
  studentHours,
  studentSelections,
  selectionMode,
  showGraduated,
  session,
  profile,
  onToggleTag,
  onToggleSelection,
}) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState(null); // only one student expanded at a time

  const selectedIds = new Set(studentSelections.map((s) => s.student_id));

  function tagsForStudent(studentId) {
    return studentTags
      .filter((st) => st.student_id === studentId)
      .map((st) => tags.find((t) => t.id === st.tag_id))
      .filter(Boolean);
  }

  function totalHoursForStudent(studentId) {
    const row = studentHours.find((h) => h.student_id === studentId);
    if (!row) return null;
    return Number(row.total_flight_hours) + Number(row.total_ground_hours);
  }

  const courseStudents = students.filter((s) => (s.course || 'Unassigned') === course);

  const filtered = courseStudents.filter((s) => {
    // Shared toggle: when off, graduated students are hidden here too —
    // same behavior as School and Student views, controlled from one place.
    if (!showGraduated && s.status === 'Graduated') return false;
    // Shared "show all / show selected" toggle — when in 'selected' mode,
    // only this user's own checked students appear (selectedIds comes
    // from student_selections, scoped per-user by RLS).
    if (selectionMode === 'selected' && !selectedIds.has(s.id)) return false;
    if (tagFilter) {
      const ids = tagsForStudent(s.id).map((t) => t.id);
      if (!ids.includes(tagFilter)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.instructor_name || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  function toggleExpanded(studentId) {
    setExpandedStudentId((current) => (current === studentId ? null : studentId));
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-1">{course}</h1>
      <p className="text-sm text-gray-500 mb-6">{courseStudents.length} students enrolled</p>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search student or instructor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map((s) => {
          const isExpanded = expandedStudentId === s.id;
          const isSelected = selectedIds.has(s.id);
          const totalHrs = totalHoursForStudent(s.id);
          const appliedTags = studentTags.filter((st) => st.student_id === s.id).map((st) => st.tag_id);

          return (
            <div key={s.id} className="border border-gray-200 rounded-lg">
              {/* Checkbox is a sibling of the expand button, not nested
                  inside it — an <input> inside a <button> is invalid HTML
                  and would make every checkbox click also toggle expansion. */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelection(s.id, isSelected)}
                  onClick={(e) => e.stopPropagation()}
                  className="ml-4 shrink-0"
                  aria-label={`Select ${s.name}`}
                />

                {/* Summary row — always visible, this is the "summary element
                    at the top" that stays shown when everything else is
                    collapsed. Clicking it expands the full student record
                    inline, with all of THAT student's own sections starting
                    collapsed (handled inside StudentDetail). */}
                <button
                  onClick={() => toggleExpanded(s.id)}
                  className="flex-1 flex items-center justify-between px-4 py-3 text-left min-w-0"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{s.name}</span>
                    <span className="text-xs text-gray-500 hidden sm:inline">{s.instructor_name || '—'}</span>
                    <span className="text-xs text-gray-500">{s.status}</span>
                    <span className="text-xs text-gray-500">
                      {totalHrs !== null ? `${totalHrs.toFixed(1)} hrs` : '—'}
                    </span>
                    <span className="hidden md:flex gap-1">
                      {tagsForStudent(s.id).map((t) => (
                        <TagPill key={t.id} label={t.label} />
                      ))}
                    </span>
                  </div>
                  <span className={`text-gray-400 text-xs transition-transform ml-2 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4">
                  <StudentDetail
                    student={s}
                    tags={tags}
                    appliedTags={appliedTags}
                    session={session}
                    profile={profile}
                    onToggleTag={onToggleTag}
                  />
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No students match this filter.</p>
        )}
      </div>
    </div>
  );
}
