import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const WINDOW_SIZE = 8; // number of weeks visible at once

export default function WeeklyHoursChart({ studentId }) {
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [windowStart, setWindowStart] = useState(0); // index into the full weekly series

  useEffect(() => {
    load();
  }, [studentId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('student_weekly_hours', { p_student_id: studentId });
    const filled = fillMissingWeeks(data || []);
    setWeeklyData(filled);
    // Default the window to show the most recent WINDOW_SIZE weeks.
    setWindowStart(Math.max(0, filled.length - WINDOW_SIZE));
    setLoading(false);
  }

  const maxIndex = Math.max(0, weeklyData.length - WINDOW_SIZE);
  const visible = weeklyData.slice(windowStart, windowStart + WINDOW_SIZE);
  const maxHours = Math.max(1, ...weeklyData.map((w) => w.total_hours));

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  if (weeklyData.length === 0) {
    return <p className="text-sm text-gray-500">No session dates available to chart yet.</p>;
  }

  return (
    <div>
      <div className="flex items-end gap-1 h-32 mb-3" role="img" aria-label="Bar chart of total hours logged per week">
        {visible.map((w) => {
          const heightPct = (w.total_hours / maxHours) * 100;
          return (
            <div key={w.week_start} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[10px] text-gray-500 mb-1">
                {w.total_hours > 0 ? w.total_hours.toFixed(1) : ''}
              </span>
              <div
                className="w-full bg-amber-400 rounded-sm"
                style={{ height: `${Math.max(heightPct, w.total_hours > 0 ? 4 : 0)}%` }}
                title={`Week of ${w.week_start}: ${w.total_hours.toFixed(1)} hrs`}
              />
              <span className="text-[10px] text-gray-400 mt-1 rotate-0 whitespace-nowrap">
                {formatWeekLabel(w.week_start)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setWindowStart((i) => Math.max(0, i - 1))}
          disabled={windowStart === 0}
          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:opacity-30"
          aria-label="Earlier week"
        >
          ←
        </button>
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={windowStart}
          onChange={(e) => setWindowStart(Number(e.target.value))}
          className="flex-1"
          aria-label="Scroll through weeks"
        />
        <button
          onClick={() => setWindowStart((i) => Math.min(maxIndex, i + 1))}
          disabled={windowStart === maxIndex}
          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:opacity-30"
          aria-label="Later week"
        >
          →
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Showing {formatWeekLabel(visible[0]?.week_start)} – {formatWeekLabel(visible[visible.length - 1]?.week_start)}
      </p>
    </div>
  );
}

// The RPC only returns weeks that actually had a session — fill the
// gaps with zero-hour weeks so the chart shows a continuous timeline
// rather than skipping straight from, say, week 3 to week 9.
function fillMissingWeeks(rows) {
  if (rows.length === 0) return [];
  const byWeek = {};
  for (const r of rows) byWeek[r.week_start] = Number(r.total_hours);

  const start = new Date(rows[0].week_start);
  const end = new Date(rows[rows.length - 1].week_start);
  const filled = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
    const key = d.toISOString().slice(0, 10);
    filled.push({ week_start: key, total_hours: byWeek[key] ?? 0 });
  }
  return filled;
}

function formatWeekLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
