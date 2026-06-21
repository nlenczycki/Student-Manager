import { useState, useMemo } from 'react';
import StudentDetail from '../components/StudentDetail';

export default function StudentView({
  studentId,
  students,
  tags,
  studentTags,
  session,
  profile,
  showGraduated,
  onSelectStudent,
  onToggleTag,
}) {
  const [searchInput, setSearchInput] = useState('');
  const [showResults, setShowResults] = useState(false);

  const student = students.find((s) => s.id === studentId);
  const appliedTags = studentTags.filter((st) => st.student_id === studentId).map((st) => st.tag_id);

  const searchResults = useMemo(() => {
    if (!searchInput.trim()) return [];
    const q = searchInput.toLowerCase();
    // The toggle controls who shows up in search results. It intentionally
    // does NOT hide a student you've already navigated to — flipping the
    // checkbox off shouldn't yank away a graduated student's page out from
    // under you mid-review, only affect who you can find next.
    return students
      .filter((s) => showGraduated || s.status !== 'Graduated')
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchInput, students, showGraduated]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Student search — always visible at top of this level */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search for a student…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-sm mt-1 max-h-64 overflow-y-auto">
            {searchResults.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onSelectStudent(s.id);
                  setSearchInput('');
                  setShowResults(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center"
              >
                <span>
                  <span className="font-medium">{s.name}</span>{' '}
                  <span className="text-gray-400 text-xs">{s.course}</span>
                </span>
                <span className="text-xs text-gray-400">{s.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!student ? (
        <p className="text-sm text-gray-500">Search above to select a student.</p>
      ) : (
        <StudentDetail
          student={student}
          tags={tags}
          appliedTags={appliedTags}
          session={session}
          profile={profile}
          onToggleTag={onToggleTag}
        />
      )}
    </div>
  );
}
