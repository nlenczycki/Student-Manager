// parseFlightCircleCsv.js
//
// Browser port of import-scripts/import_flightcircle_sessions.py. Parses
// a FlightCircle "All Reservations" CSV export into clean session rows.
//
// Naturally append-only data (each reservation happened once). The two
// jobs here: filter out non-student rows (Maintenance/blocking holds
// with no User), and normalize names for joining against CTA data. Dedup
// against EXISTING Supabase rows happens separately in ImportView (it
// needs a live query against flight_sessions, which this pure-parsing
// module doesn't have access to) — see ImportView.jsx.

import Papa from 'papaparse';
import { normalizeName, displayName } from './nameUtils';

function safeFloat(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return Number.isNaN(n) ? null : n;
}

// Converts a FlightCircle timestamp string to ISO 8601 for Postgres
// timestamptz columns. FlightCircle exports vary in exact format, so
// this leans on the Date constructor's parsing rather than a strict
// pattern — if it can't be parsed, the raw string is kept as a fallback
// (Postgres may still accept it; if not, the row will be flagged at
// insert time rather than silently dropped here).
function toIsoTimestamp(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString();
}

// Parses raw CSV file text into clean session rows. Returns
// { rows, skippedNoUser }. Each row includes a `dedup_key` for matching
// against existing flight_sessions rows — actual de-duplication against
// the database happens in the caller (ImportView), not here.
export function parseFlightCircleCsv(fileText, sourceFileName) {
  const parsed = Papa.parse(fileText, { header: true, skipEmptyLines: true });
  const rows = [];
  let skippedNoUser = 0;

  for (const row of parsed.data) {
    const userRaw = (row['User'] || '').trim();
    if (!userRaw) {
      skippedNoUser += 1;
      continue;
    }

    const start = (row['Start'] || '').trim();
    const instructorRaw = (row['Instructor'] || '').trim();
    const aircraft = (row['Aircraft'] || '').trim();

    const dedupKey = [start, normalizeName(userRaw), normalizeName(instructorRaw), aircraft].join('|');

    rows.push({
      dedup_key: dedupKey,
      session_start: toIsoTimestamp(start),
      session_end: toIsoTimestamp((row['End'] || '').trim()),
      session_type: (row['Type'] || '').trim() || null,
      student_name: displayName(userRaw),
      student_name_key: normalizeName(userRaw),
      instructor_name: displayName(instructorRaw) || null,
      aircraft: aircraft || null,
      tail_number: (row['Tail#'] || '').trim() || null,
      status: (row['Status'] || '').trim() || null,
      hobbs_total: safeFloat(row['Hobbs Total']),
      flight_instruction_hours: safeFloat(row['Flight Instruction']),
      ground_instruction_hours: safeFloat(row['Ground Instruction']),
      public_notes: (row['Public Notes'] || '').trim() || null,
      location: (row['Location'] || '').trim() || null,
      source: 'flightcircle_export',
      source_file: sourceFileName,
    });
  }

  return { rows, skippedNoUser };
}
