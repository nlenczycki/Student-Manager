import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Collapsible } from './Shared';
import { canSeeElement } from '../lib/permissions';
import WeeklyHoursChart from './WeeklyHoursChart';

// StudentDetail renders a student's full record — summary header,
// Progress, Weekly hours, Flight activity, Milestones, Tags, Notes.
// Used by both StudentView (full-page, navigated to from search) and
// CourseView (rendered inline when a course row is expanded) so the two
// entry points stay in sync rather than maintaining duplicate copies of
// this logic.
export default function StudentDetail({ student, tags, appliedTags, session, profile, onToggleTag }) {
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState('Progress');
  const [saving, setSaving] = useState(false);

  // Synced, read-only data from CTA / FlightCircle imports
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [sessions, setSessions] = useState([]); // most recent 10, for the table display
  const [totalHours, setTotalHours] = useState(null); // true cumulative, from the server-side aggregate
  const [syncedLoading, setSyncedLoading] = useState(true);

  // Milestones — your own checklist layer, same pattern as tags
  const [milestones, setMilestones] = useState([]);
  const [studentMilestones, setStudentMilestones] = useState([]);
  const [milestonesLoading, setMilestonesLoading] = useState(true);

  useEffect(() => {
    loadNotes();
    loadSyncedData();
    loadMilestones();
  }, [student.id]);

  async function loadNotes() {
    // notes_with_author (migration 011) joins in the author's display
    // name server-side, rather than fetching user_profiles separately
    // and matching it up client-side for every note.
    const { data } = await supabase
      .from('notes_with_author')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });
    setNotes(data || []);
  }

  async function loadSyncedData() {
    setSyncedLoading(true);
    const [{ data: snapshotRows }, { data: sessionRows }, { data: totalsRows }] = await Promise.all([
      supabase
        .from('student_snapshots')
        .select('*')
        .eq('student_id', student.id)
        .order('snapshot_date', { ascending: false })
        .limit(1),
      supabase
        .from('flight_sessions')
        .select('*')
        .eq('student_id', student.id)
        .order('session_start', { ascending: false })
        .limit(10),
      // Server-side aggregate — covers ALL sessions, not just the 10 shown above.
      // See migration 003 for why this is an RPC rather than a client-side sum.
      supabase.rpc('student_total_hours', { p_student_id: student.id }),
    ]);
    setLatestSnapshot(snapshotRows && snapshotRows.length ? snapshotRows[0] : null);
    setSessions(sessionRows || []);
    setTotalHours(totalsRows && totalsRows.length ? totalsRows[0] : null);
    setSyncedLoading(false);
  }

  async function loadMilestones() {
    setMilestonesLoading(true);
    const [{ data: milestoneRows }, { data: studentMilestoneRows }] = await Promise.all([
      supabase.from('milestones').select('*').eq('active', true).order('sort_order'),
      supabase.from('student_milestones').select('*').eq('student_id', student.id),
    ]);
    // A milestone with course = null applies to everyone; otherwise it
    // must match this student's course.
    const relevant = (milestoneRows || []).filter((m) => !m.course || m.course === student.course);
    setMilestones(relevant);
    setStudentMilestones(studentMilestoneRows || []);
    setMilestonesLoading(false);
  }

  async function toggleMilestone(milestoneId, currentlyDone) {
    if (currentlyDone) {
      await supabase.from('student_milestones').delete().match({ student_id: student.id, milestone_id: milestoneId });
    } else {
      await supabase.from('student_milestones').insert({
        student_id: student.id,
        milestone_id: milestoneId,
        completed_at: new Date().toISOString().slice(0, 10),
        completed_by: session.user.id,
      });
    }
    loadMilestones();
  }

  const phaseList = latestSnapshot?.phase_list ? latestSnapshot.phase_list.split(';').filter(Boolean) : [];

  async function addNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    await supabase.from('notes').insert({
      student_id: student.id,
      category: noteCategory,
      body: noteText.trim(),
      created_by: session.user.id,
    });
    setNoteText('');
    setSaving(false);
    loadNotes();
  }

  return (
    <div>
      {/* Summary header — always visible, not collapsible, matches the
          "summary element at the top" requirement for course drill-down
          consistency: this is the student-level equivalent. */}
      <div className="border border-gray-200 rounded-lg p-5 mb-4">
        <h2 className="text-base font-medium">{student.name}</h2>
        <p className="text-sm text-gray-500 mb-3">
          {student.course} · {student.status}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Instructor</p>
            <p>{student.instructor_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Enrolled</p>
            <p>{student.enrolled_date || '—'}</p>
          </div>
        </div>
      </div>

      {canSeeElement(profile, 'student.progress') && (
        <Collapsible title="Progress" defaultOpen={false}>
          {syncedLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !latestSnapshot ? (
            <p className="text-sm text-gray-500">No CTA progress data imported for this student yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {latestSnapshot.all_phases_completed ? (
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
                    All phases completed
                  </span>
                ) : phaseList.length > 0 ? (
                  phaseList.map((p) => (
                    <span key={p} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      Phase {p}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">No active phase recorded</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Last flight (CTA)</p>
                  <p>{latestSnapshot.last_flight_date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Snapshot date</p>
                  <p>{latestSnapshot.snapshot_date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Graduated</p>
                  <p>{latestSnapshot.graduated_date || '—'}</p>
                </div>
              </div>
            </>
          )}
          <p className="text-xs text-gray-400 mt-3">Synced from CTA export — read-only here.</p>
        </Collapsible>
      )}

      {canSeeElement(profile, 'student.hours_chart') && (
        <Collapsible title="Weekly hours" defaultOpen={false}>
          <WeeklyHoursChart studentId={student.id} />
        </Collapsible>
      )}

      {canSeeElement(profile, 'student.flight_activity') && (
        <Collapsible title="Flight activity" defaultOpen={false}>
          {syncedLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !totalHours || totalHours.session_count === 0 ? (
            <p className="text-sm text-gray-500">No FlightCircle session data imported for this student yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-sm mb-1">
                <div>
                  <p className="text-xs text-gray-500">Total flight instruction hrs</p>
                  <p className="text-lg font-medium">{Number(totalHours.total_flight_hours).toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total ground instruction hrs</p>
                  <p className="text-lg font-medium">{Number(totalHours.total_ground_hours).toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total sessions logged</p>
                  <p className="text-lg font-medium">{totalHours.session_count}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Across all logged sessions — not just the recent ones shown below.
              </p>
              <p className="text-xs text-gray-500 mb-2">Most recent sessions</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Type</th>
                    <th className="py-1 pr-2">Instructor</th>
                    <th className="py-1 pr-2">Flight hrs</th>
                    <th className="py-1 pr-2">Ground hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="py-1 pr-2">
                        {s.session_start ? new Date(s.session_start).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-1 pr-2">{s.session_type || '—'}</td>
                      <td className="py-1 pr-2">{s.instructor_name || '—'}</td>
                      <td className="py-1 pr-2">{s.flight_instruction_hours ?? '—'}</td>
                      <td className="py-1 pr-2">{s.ground_instruction_hours ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="text-xs text-gray-400 mt-3">Synced from FlightCircle export — read-only here.</p>
        </Collapsible>
      )}

      {canSeeElement(profile, 'student.milestones') && (
        <Collapsible title="Milestones" defaultOpen={false}>
          {milestonesLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : milestones.length === 0 ? (
            <p className="text-sm text-gray-500">No milestones defined for this course yet.</p>
          ) : (
            <div className="space-y-1">
              {milestones.map((m) => {
                const completion = studentMilestones.find((sm) => sm.milestone_id === m.id);
                const done = Boolean(completion);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMilestone(m.id, done)}
                    className="w-full flex items-center justify-between text-sm py-1.5 text-left hover:bg-gray-50 rounded px-1 -mx-1"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] ${
                          done ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className={done ? 'text-gray-900' : 'text-gray-600'}>{m.label}</span>
                    </span>
                    {done && completion.completed_at && (
                      <span className="text-xs text-gray-400">{completion.completed_at}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Checked off by instructors — not synced from CTA or FlightCircle.</p>
        </Collapsible>
      )}

      {canSeeElement(profile, 'student.tags') && (
        <Collapsible title="Tags" defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => {
              const has = appliedTags.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => onToggleTag(student.id, t.id, has)}
                  className={`text-xs px-3 py-1 rounded-full border ${
                    has ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {t.label}
                  {has ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        </Collapsible>
      )}

      {canSeeElement(profile, 'student.notes') && (
        <Collapsible title="Notes" defaultOpen={false} badge={notes.length > 0 && (
          <span className="text-xs text-gray-400">{notes.length}</span>
        )}>
          <div className="flex gap-2 mb-4">
            <select
              value={noteCategory}
              onChange={(e) => setNoteCategory(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-2 text-sm"
            >
              <option>Progress</option>
              <option>Concern</option>
              <option>Admin</option>
            </select>
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note about this student"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={addNote}
              disabled={saving}
              className="bg-gray-900 text-white rounded-md px-3 py-2 text-sm disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {notes.length === 0 && <p className="text-sm text-gray-500">No notes yet.</p>}
          {notes.map((n) => (
            <div key={n.id} className="border border-gray-100 rounded-md p-3 mb-2">
              <p className="text-xs text-gray-500 mb-1">
                {new Date(n.created_at).toLocaleDateString()} — {n.category} — {n.author_name}
              </p>
              <p className="text-sm">{n.body}</p>
            </div>
          ))}
        </Collapsible>
      )}
    </div>
  );
}
