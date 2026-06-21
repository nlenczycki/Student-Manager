// parseCtaCsv.js
//
// Browser port of import-scripts/import_cta_snapshot.py. Parses a CTA
// "Active Customer Progress Report" CSV export into clean snapshot rows.
// See the Python script's docstring for the full reasoning — ported here
// faithfully so files imported through this tab behave identically to
// ones loaded with the original script.
//
// This is a SNAPSHOT parser, not an overwrite one: every row produced
// here is meant to be INSERTED as a new row in student_snapshots, never
// used to update an existing row. See the project's snapshot-vs-overwrite
// discussion for why.

import Papa from 'papaparse';
import { normalizeName, displayName } from './nameUtils';

const HEADER_ROW_INDEX = 6; // 0-indexed; the real header is on the 7th line
const EXPECTED_HEADER = ['Instructor', 'Course', 'Customer', 'Enrolled', 'Active Phases', 'Last Flight', 'Status', 'Inactive Date'];
const GRADUATED_PATTERN = /^Graduated\s+(\d{2}\/\d{2}\/\d{4})$/;

function parseActivePhases(raw) {
  raw = (raw || '').trim();

  if (!raw) {
    return { phaseList: [], allPhasesCompleted: false, graduatedDateInField: null };
  }
  if (raw === 'All phases completed') {
    return { phaseList: [], allPhasesCompleted: true, graduatedDateInField: null };
  }
  const gradMatch = raw.match(GRADUATED_PATTERN);
  if (gradMatch) {
    return { phaseList: [], allPhasesCompleted: false, graduatedDateInField: gradMatch[1] };
  }
  if (raw.startsWith('Phase')) {
    const phasesPart = raw.slice('Phase'.length).trim();
    const phaseList = phasesPart.split(',').map((p) => p.trim()).filter(Boolean);
    return { phaseList, allPhasesCompleted: false, graduatedDateInField: null };
  }
  // Unrecognized pattern — surfaced via the `unparsed` field rather than silently dropped.
  return { phaseList: [], allPhasesCompleted: false, graduatedDateInField: null, unparsed: raw };
}

// Converts MM/DD/YYYY (as seen in CTA exports) to YYYY-MM-DD for Postgres
// date columns. Returns null for empty/placeholder values like "--".
function toIsoDate(mmddyyyy) {
  if (!mmddyyyy || mmddyyyy === '--') return null;
  const m = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// Parses raw CSV file text into clean snapshot rows ready for insertion
// into student_snapshots. Returns { rows, warnings, headerMismatch }.
export function parseCtaCsv(fileText, snapshotDate, sourceFileName) {
  const parsed = Papa.parse(fileText, { skipEmptyLines: true });
  const allLines = parsed.data;

  const header = (allLines[HEADER_ROW_INDEX] || []).map((h) => (h || '').trim());
  const dataLines = allLines.slice(HEADER_ROW_INDEX + 1);

  const headerMismatch = JSON.stringify(header) !== JSON.stringify(EXPECTED_HEADER) ? header : null;

  const rows = [];
  const warnings = [];

  dataLines.forEach((row, idx) => {
    if (!row || row.every((cell) => !String(cell || '').trim())) return; // skip blank rows
    if (row.length < 8) {
      warnings.push({ type: 'short_row', lineNumber: HEADER_ROW_INDEX + 2 + idx, row });
      return;
    }

    const [instructorRaw, course, customerRaw, enrolled, activePhasesRaw, lastFlight, status, inactiveDate] = row;
    const phaseInfo = parseActivePhases(activePhasesRaw);
    if (phaseInfo.unparsed) {
      warnings.push({
        type: 'unparsed_phase',
        lineNumber: HEADER_ROW_INDEX + 2 + idx,
        student: customerRaw,
        value: phaseInfo.unparsed,
      });
    }

    const trimmedStatus = (status || '').trim();
    const trimmedInactive = (inactiveDate || '').trim();

    rows.push({
      snapshot_date: snapshotDate,
      student_name: displayName(customerRaw),
      student_name_key: normalizeName(customerRaw),
      instructor_name: displayName(instructorRaw) || null,
      course: (course || '').trim() || null,
      enrolled_date: toIsoDate((enrolled || '').trim()),
      status: trimmedStatus,
      phase_list: phaseInfo.phaseList.join(';') || null,
      all_phases_completed: phaseInfo.allPhasesCompleted,
      graduated_date:
        toIsoDate(phaseInfo.graduatedDateInField) ||
        (trimmedStatus === 'Graduated' && trimmedInactive !== '--' ? toIsoDate(trimmedInactive) : null),
      last_flight_date: toIsoDate((lastFlight || '').trim()),
      source: 'cta_export',
      source_file: sourceFileName,
    });
  });

  return { rows, warnings, headerMismatch };
}
