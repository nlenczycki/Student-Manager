"""
import_flightcircle_sessions.py

Parses a FlightCircle "All Reservations" CSV export into clean rows
suitable for loading into a `flight_sessions` table.

Unlike the CTA snapshot importer, this is naturally APPEND-ONLY data:
each reservation happened once and doesn't change after the fact (aside
from late edits to notes/hobbs, which we are not attempting to detect
here). The main jobs of this script are:

  1. Filter out non-student rows (Maintenance blocks, XC blocking holds)
     that have no User and aren't real training sessions.
  2. Normalize student and instructor names so they can be joined against
     the CTA snapshot data later (FlightCircle names often carry a
     parenthetical nickname or rating, e.g. "Andrew Evans (CFII)" or
     "Robert (Nick) Holt" -- see name_utils.py).
  3. Flag rows that are duplicates of a previous import, so re-running
     this script on overlapping date ranges doesn't double-count hours.
     Dedup key: (Start, User, Instructor, Aircraft) -- this is a
     reasonable proxy for "same reservation" since FlightCircle doesn't
     export a reservation ID in this report.

Usage:
    python import_flightcircle_sessions.py <input_csv> <output_csv> [--existing <prior_clean_csv>]

If --existing is passed, rows already present (by dedup key) in that
file are skipped and reported, rather than duplicated.
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from name_utils import normalize_name, display_name  # noqa: E402

# Types that represent real student training activity. Maintenance and
# XC (BLOCKING) rows have no User and are aircraft/schedule holds, not
# training sessions -- excluded by the blank-User check below rather than
# this whitelist, but kept here as a documented reference of what's seen
# in practice as of this export.
KNOWN_NON_STUDENT_TYPES = {"Maintenance", "XC (BLOCKING)"}


def safe_float(val):
    try:
        if val is None or val == "":
            return None
        return float(val)
    except ValueError:
        return None


def import_flightcircle_csv(input_path: str, existing_keys: set):
    rows_out = []
    skipped_no_user = 0
    skipped_duplicate = 0
    new_dedup_keys = set()

    with open(input_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            user_raw = (row.get("User") or "").strip()
            if not user_raw:
                skipped_no_user += 1
                continue

            start = (row.get("Start") or "").strip()
            instructor_raw = (row.get("Instructor") or "").strip()
            aircraft = (row.get("Aircraft") or "").strip()

            dedup_key = (start, normalize_name(user_raw), normalize_name(instructor_raw), aircraft)

            if dedup_key in existing_keys:
                skipped_duplicate += 1
                continue
            new_dedup_keys.add(dedup_key)

            rows_out.append({
                "dedup_key": "|".join(dedup_key),
                "start": start,
                "end": (row.get("End") or "").strip(),
                "session_type": (row.get("Type") or "").strip(),
                "student_name": display_name(user_raw),
                "student_name_key": normalize_name(user_raw),
                "instructor_name": display_name(instructor_raw),
                "instructor_name_key": normalize_name(instructor_raw),
                "aircraft": aircraft,
                "tail_number": (row.get("Tail#") or "").strip(),
                "status": (row.get("Status") or "").strip(),
                "check_in_date": (row.get("Check-in Date") or "").strip(),
                "hobbs_total": safe_float(row.get("Hobbs Total")),
                "flight_instruction_hours": safe_float(row.get("Flight Instruction")),
                "ground_instruction_hours": safe_float(row.get("Ground Instruction")),
                "public_notes": (row.get("Public Notes") or "").strip(),
                "location": (row.get("Location") or "").strip(),
                "source": "flightcircle_export",
                "source_file": Path(input_path).name,
            })

    return rows_out, skipped_no_user, skipped_duplicate, new_dedup_keys


def load_existing_keys(existing_path: str) -> set:
    keys = set()
    if not existing_path:
        return keys
    p = Path(existing_path)
    if not p.exists():
        print(f"WARNING: --existing file {existing_path!r} not found, proceeding with no dedup history.", file=sys.stderr)
        return keys
    with open(p, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dedup_key = row.get("dedup_key", "")
            if dedup_key:
                keys.add(tuple(dedup_key.split("|")))
    return keys


def write_output(rows, output_path, append: bool):
    fieldnames = [
        "dedup_key", "start", "end", "session_type",
        "student_name", "student_name_key",
        "instructor_name", "instructor_name_key",
        "aircraft", "tail_number", "status", "check_in_date",
        "hobbs_total", "flight_instruction_hours", "ground_instruction_hours",
        "public_notes", "location", "source", "source_file",
    ]
    mode = "a" if append else "w"
    write_header = not (append and Path(output_path).exists() and Path(output_path).stat().st_size > 0)
    with open(output_path, mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Import a FlightCircle reservations CSV into clean session rows.")
    parser.add_argument("input_csv", help="Path to the raw FlightCircle reservations export CSV")
    parser.add_argument("output_csv", help="Path to write the cleaned session CSV")
    parser.add_argument("--existing", default=None, help="Path to a prior cleaned output CSV, used to skip duplicate reservations on re-import")
    parser.add_argument("--append", action="store_true", help="Append to output_csv instead of overwriting (use together with --existing pointing at the same file to grow one running log)")
    args = parser.parse_args()

    existing_keys = load_existing_keys(args.existing)
    rows, skipped_no_user, skipped_duplicate, new_keys = import_flightcircle_csv(args.input_csv, existing_keys)
    write_output(rows, args.output_csv, append=args.append)

    total_flight_hrs = sum(r["flight_instruction_hours"] or 0 for r in rows)
    total_ground_hrs = sum(r["ground_instruction_hours"] or 0 for r in rows)
    students = set(r["student_name_key"] for r in rows)

    print(f"\nImported {len(rows)} session rows -> {args.output_csv}")
    print(f"Skipped (no student / maintenance or block row): {skipped_no_user}")
    print(f"Skipped (duplicate of existing data): {skipped_duplicate}")
    print(f"Unique students in this batch: {len(students)}")
    print(f"Total flight instruction hours: {total_flight_hrs:.1f}")
    print(f"Total ground instruction hours: {total_ground_hrs:.1f}")


if __name__ == "__main__":
    main()
