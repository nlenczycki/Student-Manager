import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { parseCtaCsv } from '../lib/parseCtaCsv';
import { parseFlightCircleCsv } from '../lib/parseFlightCircleCsv';
import { parseCancellationsCsv } from '../lib/parseCancellationsCsv';

const STEPS = { UPLOAD: 'upload', PREVIEW: 'preview', DONE: 'done' };

export default function ImportView({ onImportComplete }) {
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [source, setSource] = useState('cta'); // 'cta' | 'flightcircle' | 'cancellations'
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [parsedRows, setParsedRows] = useState([]);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [headerMismatch, setHeaderMismatch] = useState(null);
  const [skippedNoUser, setSkippedNoUser] = useState(0);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const text = await file.text();

    if (source === 'cta') {
      const { rows, warnings, headerMismatch } = parseCtaCsv(text, snapshotDate, file.name);
      setParsedRows(rows);
      setParseWarnings(warnings);
      setHeaderMismatch(headerMismatch);
      setSkippedNoUser(0);
    } else if (source === 'flightcircle') {
      const { rows, skippedNoUser } = parseFlightCircleCsv(text, file.name);
      setParsedRows(rows);
      setParseWarnings([]);
      setHeaderMismatch(null);
      setSkippedNoUser(skippedNoUser);
    } else {
      const { rows, skippedNoUser } = parseCancellationsCsv(text, file.name);
      setParsedRows(rows);
      setParseWarnings([]);
      setHeaderMismatch(null);
      setSkippedNoUser(skippedNoUser);
    }
    setStep(STEPS.PREVIEW);
  }

  async function confirmImport() {
    setImporting(true);
    setError(null);
    try {
      let result;
      if (source === 'cta') {
        result = await importCtaRows(parsedRows);
      } else if (source === 'flightcircle') {
        result = await importFlightCircleRows(parsedRows);
      } else {
        result = await importCancellationRows(parsedRows);
      }
      setImportResult(result);
      setStep(STEPS.DONE);
      onImportComplete?.();
    } catch (err) {
      // Most likely cause if this fails immediately: the signed-in
      // user's profile lacks can_import_data and/or can_manage_students
      // — RLS rejects the write rather than the UI silently dropping it.
      setError(err.message || String(err));
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep(STEPS.UPLOAD);
    setParsedRows([]);
    setParseWarnings([]);
    setHeaderMismatch(null);
    setSkippedNoUser(0);
    setFileName('');
    setImportResult(null);
    setError(null);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-medium mb-1">Import data</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload a CTA progress report, a FlightCircle reservations export, or a FlightCircle cancellations export.
        Files are cleaned and matched to students entirely in your browser, then written to the database —
        nothing leaves your machine except the final cleaned rows.
      </p>

      {step === STEPS.UPLOAD && (
        <div className="border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium mb-3">1. Choose the source format</p>
          <div className="flex gap-3 mb-5">
            <SourceOption
              label="CTA progress report"
              description="Enrollments export with Instructor/Course/Customer/Active Phases columns"
              active={source === 'cta'}
              onClick={() => setSource('cta')}
            />
            <SourceOption
              label="FlightCircle reservations"
              description="All Reservations export with Start/User/Instructor/Hobbs columns"
              active={source === 'flightcircle'}
              onClick={() => setSource('flightcircle')}
            />
            <SourceOption
              label="FlightCircle cancellations"
              description="Cancellations report with Cancelled/User/Depart/Cancellation Reason columns"
              active={source === 'cancellations'}
              onClick={() => setSource('cancellations')}
            />
          </div>

          {source === 'cta' && (
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">
                Snapshot date — the date this report was generated (not necessarily today, if importing an older
                export)
              </label>
              <input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}

          <p className="text-sm font-medium mb-2">2. Upload the CSV file</p>
          <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>
      )}

      {step === STEPS.PREVIEW && (
        <div className="border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium mb-1">Preview — {fileName}</p>
          <p className="text-sm text-gray-500 mb-4">
            {parsedRows.length}{' '}
            {source === 'cta' ? 'student snapshot rows' : source === 'flightcircle' ? 'session rows' : 'cancellation rows'}
            {' '}ready to import.
          </p>

          {headerMismatch && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-800">
              The file's header row doesn't match the expected CTA export format. Proceeding anyway by column
              position — double check the preview below before confirming.
            </div>
          )}

          {parseWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-800">
              {parseWarnings.length} row(s) had formatting issues and may need review:
              <ul className="list-disc list-inside mt-1">
                {parseWarnings.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-xs">
                    Line {w.lineNumber}
                    {w.student ? ` (${w.student})` : ''}: {w.type === 'unparsed_phase' ? `unrecognized phase value "${w.value}"` : 'too few columns'}
                  </li>
                ))}
              </ul>
              {parseWarnings.length > 5 && <p className="text-xs mt-1">…and {parseWarnings.length - 5} more.</p>}
            </div>
          )}

          {(source === 'flightcircle' || source === 'cancellations') && skippedNoUser > 0 && (
            <p className="text-xs text-gray-500 mb-4">
              {skippedNoUser} row(s) skipped (no student — {source === 'flightcircle' ? 'maintenance or aircraft-blocking entries' : 'operational/non-student cancellations'}).
            </p>
          )}

          <div className="overflow-x-auto mb-4 max-h-72 overflow-y-auto border border-gray-100 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left">
                  {source === 'cta' ? (
                    <>
                      <th className="px-2 py-1.5">Student</th>
                      <th className="px-2 py-1.5">Course</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Phase</th>
                    </>
                  ) : source === 'flightcircle' ? (
                    <>
                      <th className="px-2 py-1.5">Student</th>
                      <th className="px-2 py-1.5">Date</th>
                      <th className="px-2 py-1.5">Type</th>
                      <th className="px-2 py-1.5">Flight hrs</th>
                      <th className="px-2 py-1.5">Ground hrs</th>
                    </>
                  ) : (
                    <>
                      <th className="px-2 py-1.5">Student</th>
                      <th className="px-2 py-1.5">Session date</th>
                      <th className="px-2 py-1.5">Reason</th>
                      <th className="px-2 py-1.5">Notice</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 50).map((r, i) =>
                  source === 'cta' ? (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">{r.student_name}</td>
                      <td className="px-2 py-1">{r.course}</td>
                      <td className="px-2 py-1">{r.status}</td>
                      <td className="px-2 py-1">{r.all_phases_completed ? 'All complete' : r.phase_list || '—'}</td>
                    </tr>
                  ) : source === 'flightcircle' ? (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">{r.student_name}</td>
                      <td className="px-2 py-1">{r.session_start ? new Date(r.session_start).toLocaleDateString() : '—'}</td>
                      <td className="px-2 py-1">{r.session_type}</td>
                      <td className="px-2 py-1">{r.flight_instruction_hours ?? '—'}</td>
                      <td className="px-2 py-1">{r.ground_instruction_hours ?? '—'}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">{r.student_name}</td>
                      <td className="px-2 py-1">{r.session_depart ? new Date(r.session_depart).toLocaleDateString() : '—'}</td>
                      <td className="px-2 py-1">{r.cancellation_reason || '—'}</td>
                      <td className="px-2 py-1">{r.notice || '—'}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {parsedRows.length > 50 && (
              <p className="text-xs text-gray-400 p-2">…and {parsedRows.length - 50} more rows, not shown.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="flex gap-2">
            <button onClick={reset} className="text-sm border border-gray-300 rounded-md px-3 py-2">
              Cancel
            </button>
            <button
              onClick={confirmImport}
              disabled={importing || parsedRows.length === 0}
              className="bg-gray-900 text-white rounded-md px-3 py-2 text-sm disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Confirm import (${parsedRows.length} rows)`}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.DONE && importResult && (
        <div className="border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium mb-3">Import complete</p>
          <ul className="text-sm text-gray-600 space-y-1 mb-4">
            <li>{importResult.studentsUpserted} student record(s) created or updated</li>
            {source === 'cta' ? (
              <li>{importResult.rowsInserted} snapshot row(s) added</li>
            ) : (
              <>
                <li>{importResult.rowsInserted} new {source === 'flightcircle' ? 'session' : 'cancellation'} row(s) added</li>
                <li>{importResult.rowsSkippedDuplicate} row(s) skipped (already imported previously)</li>
              </>
            )}
          </ul>
          <button onClick={reset} className="text-sm border border-gray-300 rounded-md px-3 py-2">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

function SourceOption({ label, description, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left border rounded-md p-3 text-sm ${
        active ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
      }`}
    >
      <p className="font-medium mb-1">{label}</p>
      <p className="text-xs text-gray-500">{description}</p>
    </button>
  );
}

// ===========================================================
// Supabase write logic — mirrors supabase/load_to_supabase.py, adapted
// to run from the browser using the signed-in user's session instead of
// the service role key. Requires the user's profile to hold both
// can_manage_students (to upsert the students table) and
// can_import_data (to insert into student_snapshots / flight_sessions)
// — see migrations 007 and 009. If either is missing, these calls fail
// with an RLS error rather than silently doing nothing.
// ===========================================================

async function upsertStudentsFromRows(rows, getFields) {
  // Build one record per unique student_name_key seen in this batch.
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.student_name_key)) {
      byKey.set(row.student_name_key, getFields(row));
    }
  }

  const nameKeyToId = {};
  let upserted = 0;

  for (const [nameKey, fields] of byKey.entries()) {
    const { data: existing, error: selectErr } = await supabase
      .from('students')
      .select('id')
      .eq('name_key', nameKey)
      .maybeSingle();
    if (selectErr) throw selectErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('students')
        .update({
          status: fields.status,
          instructor_name: fields.instructor_name,
          graduated_date: fields.graduated_date,
        })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
      nameKeyToId[nameKey] = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('students')
        .insert({ name: fields.name, name_key: nameKey, ...fields })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      nameKeyToId[nameKey] = inserted.id;
    }
    upserted += 1;
  }

  return { nameKeyToId, upserted };
}

async function importCtaRows(rows) {
  const { nameKeyToId, upserted } = await upsertStudentsFromRows(rows, (row) => ({
    name: row.student_name,
    course: row.course,
    status: row.status,
    instructor_name: row.instructor_name,
    enrolled_date: row.enrolled_date,
    graduated_date: row.graduated_date,
  }));

  const payload = rows.map((row) => ({
    student_id: nameKeyToId[row.student_name_key] || null,
    student_name_key: row.student_name_key,
    snapshot_date: row.snapshot_date,
    status: row.status,
    course: row.course,
    phase_list: row.phase_list,
    all_phases_completed: row.all_phases_completed,
    graduated_date: row.graduated_date,
    last_flight_date: row.last_flight_date,
    instructor_name: row.instructor_name,
    source: row.source,
    source_file: row.source_file,
  }));

  // Insert in batches to stay well under request size limits, same
  // reasoning as load_to_supabase.py's chunking.
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('student_snapshots').insert(payload.slice(i, i + 500));
    if (error) throw error;
  }

  return { studentsUpserted: upserted, rowsInserted: payload.length };
}

// Generic dedup-key pagination, shared by importFlightCircleRows and
// importCancellationRows — both flight_sessions and cancellations use
// the same "fetch all existing dedup_key values, then skip rows that
// already match" pattern.
async function fetchExistingDedupKeys(tableName) {
  const existingKeys = new Set();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('dedup_key')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r) => existingKeys.add(r.dedup_key));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return existingKeys;
}

async function importFlightCircleRows(rows) {
  const { nameKeyToId, upserted } = await upsertStudentsFromRows(rows, (row) => ({
    name: row.student_name,
    course: null,
    status: 'Active',
    instructor_name: row.instructor_name,
    enrolled_date: null,
    graduated_date: null,
  }));

  // Dedup against existing flight_sessions rows by dedup_key, so
  // re-uploading an overlapping export doesn't double-count hours.
  const existingKeys = await fetchExistingDedupKeys('flight_sessions');

  const newRows = rows.filter((r) => !existingKeys.has(r.dedup_key));
  const payload = newRows.map((row) => ({
    student_id: nameKeyToId[row.student_name_key] || null,
    student_name_key: row.student_name_key,
    dedup_key: row.dedup_key,
    session_start: row.session_start,
    session_end: row.session_end,
    session_type: row.session_type,
    instructor_name: row.instructor_name,
    aircraft: row.aircraft,
    tail_number: row.tail_number,
    status: row.status,
    hobbs_total: row.hobbs_total,
    flight_instruction_hours: row.flight_instruction_hours,
    ground_instruction_hours: row.ground_instruction_hours,
    public_notes: row.public_notes,
    location: row.location,
    source: row.source,
    source_file: row.source_file,
  }));

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('flight_sessions').insert(payload.slice(i, i + 500));
    if (error) throw error;
  }

  return {
    studentsUpserted: upserted,
    rowsInserted: payload.length,
    rowsSkippedDuplicate: rows.length - payload.length,
  };
}

async function importCancellationRows(rows) {
  // Cancellations don't carry course/status info worth writing back to
  // students — a cancelled reservation doesn't tell us a student's
  // current course or active/graduated status the way a CTA snapshot
  // does, so this only creates a student record if one doesn't already
  // exist (so the cancellation has somewhere to attach), without
  // overwriting status/course on an existing record.
  const { nameKeyToId, upserted } = await upsertStudentsFromRows(rows, (row) => ({
    name: row.student_name,
    course: null,
    status: 'Active',
    instructor_name: row.instructor_name,
    enrolled_date: null,
    graduated_date: null,
  }));

  const existingKeys = await fetchExistingDedupKeys('cancellations');

  const newRows = rows.filter((r) => !existingKeys.has(r.dedup_key));
  const payload = newRows.map((row) => ({
    student_id: nameKeyToId[row.student_name_key] || null,
    student_name_key: row.student_name_key,
    dedup_key: row.dedup_key,
    cancelled_at: row.cancelled_at,
    session_depart: row.session_depart,
    instructor_name: row.instructor_name,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    cancellation_notes: row.cancellation_notes,
    notice: row.notice,
    source: row.source,
    source_file: row.source_file,
  }));

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('cancellations').insert(payload.slice(i, i + 500));
    if (error) throw error;
  }

  return {
    studentsUpserted: upserted,
    rowsInserted: payload.length,
    rowsSkippedDuplicate: rows.length - payload.length,
  };
}
