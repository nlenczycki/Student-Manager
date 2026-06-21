// parseCancellationsCsv.js
//
// Parses a FlightCircle "Cancellations Report" CSV export into clean
// rows for the cancellations table. Structurally similar to
// parseFlightCircleCsv.js (Start/User/Instructor pattern, blank User on
// operational/non-student rows that should be excluded) — confirmed
// against a real export: 467 rows, 92 with blank User.
//
// Two date columns matter here, and they mean different things:
//   - "Cancelled" = when the cancellation was logged (not used for
//     weekly bucketing)
//   - "Depart" = the date/time of the SESSION that got cancelled — this
//     is what determines which week the cancellation counts against in
//     student_weekly_progress, matching how the original tracker
//     spreadsheet's Cancels column worked.

import Papa from 'papaparse';
import { normalizeName, displayName } from './nameUtils';

function toIsoTimestamp(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString();
}

// Parses raw CSV file text into clean cancellation rows. Returns
// { rows, skippedNoUser }. Each row includes a dedup_key, same pattern
// as flight_sessions, so re-uploading an overlapping export is safe.
export function parseCancellationsCsv(fileText, sourceFileName) {
  const parsed = Papa.parse(fileText, { header: true, skipEmptyLines: true });
  const rows = [];
  let skippedNoUser = 0;

  for (const row of parsed.data) {
    const userRaw = (row['User'] || '').trim();
    if (!userRaw) {
      skippedNoUser += 1;
      continue;
    }

    const cancelled = (row['Cancelled'] || '').trim();
    const depart = (row['Depart'] || '').trim();
    const instructorRaw = (row['Instructor'] || '').trim();

    const dedupKey = [cancelled, normalizeName(userRaw), depart].join('|');

    rows.push({
      dedup_key: dedupKey,
      student_name: displayName(userRaw),
      student_name_key: normalizeName(userRaw),
      cancelled_at: toIsoTimestamp(cancelled),
      session_depart: toIsoTimestamp(depart),
      instructor_name: displayName(instructorRaw) || null,
      cancelled_by: (row['CancelledBy'] || '').trim() || null,
      cancellation_reason: (row['Cancellation Reason'] || '').trim() || null,
      cancellation_notes: (row['Cancellation Notes'] || '').trim() || null,
      notice: (row['Notice'] || '').trim() || null,
      source: 'flightcircle_cancellations_export',
      source_file: sourceFileName,
    });
  }

  return { rows, skippedNoUser };
}
