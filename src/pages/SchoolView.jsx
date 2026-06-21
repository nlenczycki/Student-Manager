import { MetricCard } from '../components/Shared';

export default function SchoolView({
  students,
  tags,
  studentTags,
  studentHours,
  studentSelections,
  selectionMode,
  showGraduated,
  onSelectCourse,
}) {
  const selectedIds = new Set(studentSelections.map((s) => s.student_id));

  // Respect both shared toggles at the same chokepoint: when showGraduated
  // is off, Graduated students are excluded; when selectionMode is
  // 'selected', only this user's own checked students remain. Every
  // count, the course grouping, and the average below all derive from
  // visibleStudents, so both toggles propagate consistently everywhere
  // on this page rather than needing separate filters that could drift.
  const visibleStudents = students
    .filter((s) => showGraduated || s.status === 'Active')
    .filter((s) => selectionMode !== 'selected' || selectedIds.has(s.id));

  const activeStudents = visibleStudents.filter((s) => s.status === 'Active');
  const graduatedStudents = visibleStudents.filter((s) => s.status === 'Graduated');

  // Look up each student's individual total hours (flight + ground) from
  // the per-student aggregate, so the average below is built from exactly
  // the same set of students as everything else on this page — if we
  // instead averaged the course-wide total (which always includes every
  // student regardless of the toggle) over only the visible headcount,
  // turning the toggle off would silently inflate the average by still
  // counting graduated students' hours in the numerator. Keeping
  // numerator and denominator in sync avoids that.
  const hoursByStudentId = {};
  for (const row of studentHours) {
    hoursByStudentId[row.student_id] = Number(row.total_flight_hours) + Number(row.total_ground_hours);
  }

  // Group by course (using visibleStudents, so graduated-toggle applies to these counts too)
  const courseMap = {};
  for (const s of visibleStudents) {
    const course = s.course || 'Unassigned';
    if (!courseMap[course]) {
      courseMap[course] = { course, total: 0, active: 0, graduated: 0, flagged: 0, hoursSum: 0, hoursKnownCount: 0 };
    }
    courseMap[course].total += 1;
    if (s.status === 'Active') courseMap[course].active += 1;
    if (s.status === 'Graduated') courseMap[course].graduated += 1;

    const hrs = hoursByStudentId[s.id];
    if (hrs !== undefined) {
      courseMap[course].hoursSum += hrs;
      courseMap[course].hoursKnownCount += 1;
    }
  }

  // Count flagged (any tag with category 'flag') students per course
  const flagTagIds = tags.filter((t) => t.category === 'flag').map((t) => t.id);
  for (const s of visibleStudents) {
    const course = s.course || 'Unassigned';
    const hasFlag = studentTags.some((st) => st.student_id === s.id && flagTagIds.includes(st.tag_id));
    if (hasFlag) courseMap[course].flagged += 1;
  }

  const courseRows = Object.values(courseMap).sort((a, b) => b.total - a.total);

  if (selectionMode === 'selected' && selectedIds.size === 0) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-lg font-medium mb-6">School overview</h1>
        <p className="text-sm text-gray-500">
          No students selected yet. Check students from a course roster, then switch back here — totals will
          reflect only your selected students.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-6">School overview</h1>

      <div className="grid grid-cols-4 gap-3 mb-8">
        <MetricCard label="Active students" value={activeStudents.length} />
        <MetricCard label="Graduated" value={graduatedStudents.length} />
        <MetricCard label="Courses" value={courseRows.length} />
        <MetricCard label="Total students" value={visibleStudents.length} />
      </div>

      <p className="text-sm font-medium mb-3">By course</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 px-2">Course</th>
              <th className="py-2 px-2">Active</th>
              <th className="py-2 px-2">Graduated</th>
              <th className="py-2 px-2">Total</th>
              <th className="py-2 px-2">Flagged</th>
              <th className="py-2 px-2">Avg time / student</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {courseRows.map((row) => {
              const avgHrs = row.hoursKnownCount > 0 ? row.hoursSum / row.hoursKnownCount : null;
              return (
                <tr key={row.course} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">{row.course}</td>
                  <td className="py-2 px-2">{row.active}</td>
                  <td className="py-2 px-2">{row.graduated}</td>
                  <td className="py-2 px-2">{row.total}</td>
                  <td className="py-2 px-2">
                    {row.flagged > 0 ? (
                      <span className="text-red-600 font-medium">{row.flagged}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {avgHrs !== null ? (
                      <span title={`Averaged across ${row.hoursKnownCount} of ${row.total} students currently shown`}>
                        {avgHrs.toFixed(1)} hrs
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => onSelectCourse(row.course)}
                      className="text-xs text-gray-500 underline"
                    >
                      View course →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
