import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const WINDOW_SIZE = 4; // number of weeks visible at once — six metrics per week makes more than this cramped

export default function WeeklyProgressView({ students, studentSelections, selectionMode, showGraduated }) {
  const [rawRows, setRawRows] = useState([]); // one row per (student_id, week_start) from the aggregate
  const [loading, setLoading] = useState(true);
  const [windowStart, setWindowStart] = useState(0); // index into the full sorted week list
  const [search, setSearch] = useState('');
  const [expandedWeek, setExpandedWeek] = useState(null); // which single week (if any) shows the full 6-metric breakdown; null = Total Hours only

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('all_students_weekly_progress');
    setRawRows(data || []);
    setLoading(false);
  }

  const selectedIds = useMemo(() => new Set(studentSelections.map((s) => s.student_id)), [studentSelections]);

  const visibleStudents = useMemo(() => {
    return students
      .filter((s) => showGraduated || s.status === 'Active')
      .filter((s) => selectionMode !== 'selected' || selectedIds.has(s.id))
      .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, showGraduated, selectionMode, selectedIds, search]);

  // Every week that ANY student has data for, sorted chronologically —
  // this defines the full set of columns, independent of which students
  // are currently visible (so scrolling the week window stays stable as
  // you filter/select students).
  const allWeeks = useMemo(() => {
    const set = new Set(rawRows.map((r) => r.week_start));
    return Array.from(set).sort();
  }, [rawRows]);

  // Lookup: (student_id, week_start) -> metrics row, for fast rendering.
  const rowsByStudentAndWeek = useMemo(() => {
    const map = new Map();
    for (const r of rawRows) {
      map.set(`${r.student_id}|${r.week_start}`, r);
    }
    return map;
  }, [rawRows]);

  useEffect(() => {
    // Default the window to the most recent weeks once data loads.
    if (allWeeks.length > 0) {
      setWindowStart(Math.max(0, allWeeks.length - WINDOW_SIZE));
    }
  }, [allWeeks.length]);

  const maxIndex = Math.max(0, allWeeks.length - WINDOW_SIZE);
  const visibleWeeks = allWeeks.slice(windowStart, windowStart + WINDOW_SIZE);

  function metricsFor(studentId, week) {
    return rowsByStudentAndWeek.get(`${studentId}|${week}`) || null;
  }

  function totalHours(m) {
    if (!m) return 0;
    return Number(m.flight_hours) + Number(m.ground_hours);
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading weekly progress…</div>;

  if (allWeeks.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-lg font-medium mb-1">Weekly progress</h1>
        <p className="text-sm text-gray-500">
          No session data with dates has been imported yet — import a FlightCircle reservations export to populate
          this table.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-1">Weekly progress</h1>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search student"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1 max-w-xs"
        />
        <span className="text-xs text-gray-400 ml-auto">
          {visibleStudents.length} student{visibleStudents.length === 1 ? '' : 's'} shown
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setWindowStart((i) => Math.max(0, i - 1))}
          disabled={windowStart === 0}
          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:opacity-30"
          aria-label="Earlier weeks"
        >
          ←
        </button>
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={windowStart}
          onChange={(e) => setWindowStart(Number(e.target.value))}
          className="flex-1 max-w-sm"
          aria-label="Scroll through weeks"
        />
        <button
          onClick={() => setWindowStart((i) => Math.min(maxIndex, i + 1))}
          disabled={windowStart === maxIndex}
          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:opacity-30"
          aria-label="Later weeks"
        >
          →
        </button>
        <span className="text-xs text-gray-400 ml-2">
          Weeks of {formatWeek(visibleWeeks[0])} – {formatWeek(visibleWeeks[visibleWeeks.length - 1])}
        </span>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-xs w-full">
          <thead className="bg-gray-50">
            <tr className="text-left border-b border-gray-200">
              <th className="px-3 py-2 sticky left-0 bg-gray-50 z-10 min-w-[160px]">Student</th>
              {visibleWeeks.map((week) => (
                <th key={week} colSpan={expandedWeek === week ? 6 : 1} className="px-2 py-2 border-l border-gray-200">
                  <button
                    onClick={() => setExpandedWeek((cur) => (cur === week ? null : week))}
                    className="font-medium hover:underline"
                    title="Click to toggle full breakdown for this week"
                  >
                    {formatWeek(week)} {expandedWeek === week ? '▾' : '▸'}
                  </button>
                </th>
              ))}
            </tr>
            {visibleWeeks.some((w) => w === expandedWeek) && (
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="px-3 py-1 sticky left-0 bg-gray-50 z-10"></th>
                {visibleWeeks.map((week) =>
                  expandedWeek === week ? (
                    <Fragment key={week}>
                      <th className="px-2 py-1 font-normal border-l border-gray-200 text-center">Total</th>
                      <th className="px-2 py-1 font-normal text-center">Flights</th>
                      <th className="px-2 py-1 font-normal text-center">Flt hrs</th>
                      <th className="px-2 py-1 font-normal text-center">Grounds</th>
                      <th className="px-2 py-1 font-normal text-center">Gnd hrs</th>
                      <th className="px-2 py-1 font-normal text-center">Cancels</th>
                    </Fragment>
                  ) : (
                    <th key={week} className="px-2 py-1 font-normal border-l border-gray-200 text-center">Total hrs</th>
                  )
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {visibleStudents.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5 sticky left-0 bg-white z-10 font-medium truncate max-w-[160px]">
                  {s.name}
                </td>
                {visibleWeeks.map((week) => {
                  const m = metricsFor(s.id, week);
                  if (expandedWeek === week) {
                    return (
                      <Fragment key={week}>
                        <td className="px-2 py-1.5 border-l border-gray-100 text-center">{m ? m.total_activities : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{m ? m.flights : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{m ? Number(m.flight_hours).toFixed(1) : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{m ? m.grounds : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{m ? Number(m.ground_hours).toFixed(1) : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{m ? m.cancels : '—'}</td>
                      </Fragment>
                    );
                  }
                  return (
                    <td key={week} className="px-2 py-1.5 border-l border-gray-100 text-center">
                      {m ? totalHours(m).toFixed(1) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {visibleStudents.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No students match the current filters.</p>
        )}
      </div>
    </div>
  );
}

function formatWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
