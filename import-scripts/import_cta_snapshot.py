"""
import_cta_snapshot.py

Parses a CTA "Active Customer Progress Report" CSV export into clean,
structured snapshot rows suitable for loading into a `student_snapshots`
table (see schema discussion).

IMPORTANT — this is a SNAPSHOT importer, not an overwrite importer:
Each run of this script represents one point-in-time snapshot of every
student's status. It does NOT update a single "current state" row — it
APPENDS new rows, one per student per import. This is what lets you later
chart a student's phase progression over time instead of only ever seeing
"now." See the project's snapshot-vs-overwrite discussion for why this
matters.

Input format quirks this script handles:
- The file has 6 metadata/title rows before the real header row
  ("Instructor, Course, Customer, Enrolled, Active Phases, Last Flight,
  Status, Inactive Date"). We skip those explicitly rather than guessing.
- The "Active Phases" column is a messy free-text field with several
  distinct patterns:
    "Phase 5"                      -> in progress, single phase
    "Phase 7, 8"                   -> in progress, multiple phases
    "Phase 4A" / "Phase 5A"        -> phases can have letter suffixes,
                                       so phase numbers must stay strings
    "All phases completed"         -> finished all phases, not yet
                                       marked Graduated in Status column
    "Graduated MM/DD/YYYY"         -> graduated, with date embedded in
                                       this field (redundant with the
                                       Status/Inactive Date columns, but
                                       captured here for completeness)
- Status column is independently either "Active" or "Graduated".

Usage:
    python import_cta_snapshot.py <input_csv> <output_csv> [--snapshot-date YYYY-MM-DD]

If --snapshot-date is omitted, today's date is used. You should pass the
date the *report was generated* if known, not necessarily today, so
historical re-imports backfill correctly.
"""

import argparse
import csv
import re
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from name_utils import normalize_name, display_name  # noqa: E402

HEADER_ROW_INDEX = 6  # 0-indexed; the real header is on the 7th line of the file
GRADUATED_PATTERN = re.compile(r"^Graduated\s+(\d{2}/\d{2}/\d{4})$")


def parse_active_phases(raw: str):
    """Break the messy 'Active Phases' text into structured fields.

    Returns a dict:
        {
            "phase_list": ["5", "7", "8"] or [],
            "all_phases_completed": bool,
            "graduated_date_in_field": "MM/DD/YYYY" or None,
        }
    """
    raw = (raw or "").strip()

    if not raw:
        return {"phase_list": [], "all_phases_completed": False, "graduated_date_in_field": None}

    if raw == "All phases completed":
        return {"phase_list": [], "all_phases_completed": True, "graduated_date_in_field": None}

    grad_match = GRADUATED_PATTERN.match(raw)
    if grad_match:
        return {"phase_list": [], "all_phases_completed": False, "graduated_date_in_field": grad_match.group(1)}

    if raw.startswith("Phase"):
        # "Phase 7, 8" -> phases part is "7, 8"; split on comma, strip whitespace.
        # Keep as strings since suffixes like "4A" / "5A" are valid phase labels.
        phases_part = raw[len("Phase"):].strip()
        phase_list = [p.strip() for p in phases_part.split(",") if p.strip()]
        return {"phase_list": phase_list, "all_phases_completed": False, "graduated_date_in_field": None}

    # Unrecognized pattern — surface it rather than silently dropping data.
    return {"phase_list": [], "all_phases_completed": False, "graduated_date_in_field": None, "_unparsed": raw}


def import_cta_csv(input_path: str, snapshot_date: str):
    rows_out = []
    unparsed_warnings = []

    with open(input_path, newline="", encoding="utf-8-sig") as f:
        all_lines = list(csv.reader(f))

    header = [h.strip() for h in all_lines[HEADER_ROW_INDEX]]
    data_lines = all_lines[HEADER_ROW_INDEX + 1:]

    expected_header = ["Instructor", "Course", "Customer", "Enrolled", "Active Phases", "Last Flight", "Status", "Inactive Date"]
    if header != expected_header:
        print(f"WARNING: header row does not match expected format.", file=sys.stderr)
        print(f"  Expected: {expected_header}", file=sys.stderr)
        print(f"  Found:    {header}", file=sys.stderr)
        print(f"  Proceeding anyway by column position — verify output carefully.", file=sys.stderr)

    for line_num, row in enumerate(data_lines, start=HEADER_ROW_INDEX + 2):
        if not row or all(not cell.strip() for cell in row):
            continue  # skip blank rows
        if len(row) < 8:
            print(f"WARNING: line {line_num} has fewer than 8 columns, skipping: {row}", file=sys.stderr)
            continue

        instructor_raw, course, customer_raw, enrolled, active_phases_raw, last_flight, status, inactive_date = row[:8]

        phase_info = parse_active_phases(active_phases_raw)
        if "_unparsed" in phase_info:
            unparsed_warnings.append((line_num, customer_raw, phase_info["_unparsed"]))

        rows_out.append({
            "snapshot_date": snapshot_date,
            "student_name": display_name(customer_raw),
            "student_name_key": normalize_name(customer_raw),
            "instructor_name": display_name(instructor_raw),
            "instructor_name_key": normalize_name(instructor_raw),
            "course": course.strip(),
            "enrolled_date": enrolled.strip(),
            "status": status.strip(),
            "phase_list": ";".join(phase_info["phase_list"]),
            "all_phases_completed": phase_info["all_phases_completed"],
            "graduated_date": phase_info["graduated_date_in_field"] or (inactive_date.strip() if status.strip() == "Graduated" and inactive_date.strip() != "--" else ""),
            "last_flight_date": last_flight.strip(),
            "source": "cta_export",
            "source_file": Path(input_path).name,
        })

    if unparsed_warnings:
        print(f"\nWARNING: {len(unparsed_warnings)} rows had an unrecognized 'Active Phases' format:", file=sys.stderr)
        for line_num, customer, raw_val in unparsed_warnings[:10]:
            print(f"  line {line_num} ({customer}): {raw_val!r}", file=sys.stderr)
        if len(unparsed_warnings) > 10:
            print(f"  ... and {len(unparsed_warnings) - 10} more", file=sys.stderr)

    return rows_out


def write_output(rows, output_path):
    fieldnames = [
        "snapshot_date", "student_name", "student_name_key",
        "instructor_name", "instructor_name_key", "course",
        "enrolled_date", "status", "phase_list", "all_phases_completed",
        "graduated_date", "last_flight_date", "source", "source_file",
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Import a CTA progress report CSV into clean snapshot rows.")
    parser.add_argument("input_csv", help="Path to the raw CTA export CSV")
    parser.add_argument("output_csv", help="Path to write the cleaned snapshot CSV")
    parser.add_argument("--snapshot-date", default=None, help="Date this report represents (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args()

    snapshot_date = args.snapshot_date or date.today().isoformat()
    try:
        datetime.strptime(snapshot_date, "%Y-%m-%d")
    except ValueError:
        print(f"ERROR: --snapshot-date must be in YYYY-MM-DD format, got {snapshot_date!r}", file=sys.stderr)
        sys.exit(1)

    rows = import_cta_csv(args.input_csv, snapshot_date)
    write_output(rows, args.output_csv)

    statuses = {}
    for r in rows:
        statuses[r["status"]] = statuses.get(r["status"], 0) + 1

    print(f"\nImported {len(rows)} snapshot rows -> {args.output_csv}")
    print(f"Snapshot date: {snapshot_date}")
    print(f"Status breakdown: {statuses}")


if __name__ == "__main__":
    main()
