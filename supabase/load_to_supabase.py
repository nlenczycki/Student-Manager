"""
load_to_supabase.py

Takes the CLEANED output from import_cta_snapshot.py and
import_flightcircle_sessions.py (the scripts from earlier in this
project) and loads them into the real Supabase database defined in
supabase/migrations/001_initial_schema.sql.

This script:
  1. Upserts a `students` row for every unique student name seen across
     both files (matching/deduping by normalized name_key).
  2. Inserts all CTA rows into `student_snapshots` (append-only).
  3. Inserts all FlightCircle rows into `flight_sessions`, skipping any
     dedup_key that already exists in the table (so re-running this
     script with overlapping exports is always safe).

Requires the Supabase SERVICE ROLE key (not the anon key) because it
writes to tables that RLS normally restricts to admins / the import
process — never put the service role key in the frontend app or commit
it to git. Run this from your own machine or a secure server only.

Usage:
    pip install supabase python-dotenv
    python load_to_supabase.py <cta_clean_csv> <flightcircle_clean_csv>

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment
variables (or a .env file in the same directory).
"""

import argparse
import csv
import os
import sys
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("Missing dependency. Run: pip install supabase python-dotenv", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional; env vars can be set another way


def get_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "(in your environment, or a .env file in this directory).\n"
            "Find both under Project Settings > API in the Supabase dashboard.\n"
            "Use the 'service_role' key here, NOT the anon key.",
            file=sys.stderr,
        )
        sys.exit(1)
    return create_client(url, key)


def upsert_students(supabase, cta_rows, fc_rows):
    """Build a name_key -> students.id map, creating rows for any new student."""
    seen = {}
    for row in cta_rows:
        seen[row["student_name_key"]] = {
            "name": row["student_name"],
            "name_key": row["student_name_key"],
            "course": row["course"],
            "status": row["status"],
            "instructor_name": row["instructor_name"] or None,
            "enrolled_date": row["enrolled_date"] or None,
            "graduated_date": row["graduated_date"] or None,
        }
    for row in fc_rows:
        key = row["student_name_key"]
        if key not in seen:
            seen[key] = {
                "name": row["student_name"],
                "name_key": key,
                "course": None,
                "status": "Active",
                "instructor_name": row["instructor_name"] or None,
                "enrolled_date": None,
                "graduated_date": None,
            }

    name_key_to_id = {}
    for name_key, fields in seen.items():
        existing = supabase.table("students").select("id").eq("name_key", name_key).execute()
        if existing.data:
            student_id = existing.data[0]["id"]
            # keep existing record's name/course/status fresh from the latest import
            supabase.table("students").update({
                "status": fields["status"],
                "instructor_name": fields["instructor_name"],
                "graduated_date": fields["graduated_date"],
            }).eq("id", student_id).execute()
        else:
            inserted = supabase.table("students").insert(fields).execute()
            student_id = inserted.data[0]["id"]
        name_key_to_id[name_key] = student_id

    return name_key_to_id


def load_snapshots(supabase, cta_rows, name_key_to_id):
    payload = []
    for row in cta_rows:
        payload.append({
            "student_id": name_key_to_id.get(row["student_name_key"]),
            "student_name_key": row["student_name_key"],
            "snapshot_date": row["snapshot_date"],
            "status": row["status"],
            "course": row["course"],
            "phase_list": row["phase_list"] or None,
            "all_phases_completed": row["all_phases_completed"] in ("True", "true", True),
            "graduated_date": row["graduated_date"] or None,
            "last_flight_date": row["last_flight_date"] or None,
            "instructor_name": row["instructor_name"] or None,
            "source": row["source"],
            "source_file": row["source_file"],
        })
    if payload:
        # snapshots are append-only by design — no upsert/dedup here.
        # Re-running the CTA import script for the SAME snapshot_date
        # twice will create duplicate rows; pass a distinct
        # --snapshot-date per real import to avoid that.
        supabase.table("student_snapshots").insert(payload).execute()
    return len(payload)


def load_sessions(supabase, fc_rows, name_key_to_id):
    # Find which dedup_keys already exist so we don't violate the unique
    # constraint (and so this script is safe to re-run on overlapping
    # date-range exports).
    existing_keys = set()
    page_size = 1000
    offset = 0
    while True:
        res = supabase.table("flight_sessions").select("dedup_key").range(offset, offset + page_size - 1).execute()
        if not res.data:
            break
        existing_keys.update(r["dedup_key"] for r in res.data)
        if len(res.data) < page_size:
            break
        offset += page_size

    payload = []
    skipped = 0
    for row in fc_rows:
        if row["dedup_key"] in existing_keys:
            skipped += 1
            continue
        payload.append({
            "student_id": name_key_to_id.get(row["student_name_key"]),
            "student_name_key": row["student_name_key"],
            "dedup_key": row["dedup_key"],
            "session_start": row["start"] or None,
            "session_end": row["end"] or None,
            "session_type": row["session_type"] or None,
            "instructor_name": row["instructor_name"] or None,
            "aircraft": row["aircraft"] or None,
            "tail_number": row["tail_number"] or None,
            "status": row["status"] or None,
            "hobbs_total": float(row["hobbs_total"]) if row["hobbs_total"] else None,
            "flight_instruction_hours": float(row["flight_instruction_hours"]) if row["flight_instruction_hours"] else None,
            "ground_instruction_hours": float(row["ground_instruction_hours"]) if row["ground_instruction_hours"] else None,
            "public_notes": row["public_notes"] or None,
            "location": row["location"] or None,
            "source": row["source"],
            "source_file": row["source_file"],
        })

    if payload:
        # batch in chunks of 500 to stay well under request size limits
        for i in range(0, len(payload), 500):
            supabase.table("flight_sessions").insert(payload[i:i + 500]).execute()

    return len(payload), skipped


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    parser = argparse.ArgumentParser(description="Load cleaned CTA/FlightCircle CSVs into Supabase.")
    parser.add_argument("cta_csv", help="Path to the cleaned CTA snapshot CSV (output of import_cta_snapshot.py)")
    parser.add_argument("flightcircle_csv", help="Path to the cleaned FlightCircle sessions CSV (output of import_flightcircle_sessions.py)")
    args = parser.parse_args()

    if not Path(args.cta_csv).exists():
        print(f"ERROR: {args.cta_csv} not found", file=sys.stderr)
        sys.exit(1)
    if not Path(args.flightcircle_csv).exists():
        print(f"ERROR: {args.flightcircle_csv} not found", file=sys.stderr)
        sys.exit(1)

    supabase = get_client()

    cta_rows = read_csv(args.cta_csv)
    fc_rows = read_csv(args.flightcircle_csv)

    print(f"Loaded {len(cta_rows)} CTA rows and {len(fc_rows)} FlightCircle rows from disk.")

    name_key_to_id = upsert_students(supabase, cta_rows, fc_rows)
    print(f"Upserted {len(name_key_to_id)} student records.")

    snap_count = load_snapshots(supabase, cta_rows, name_key_to_id)
    print(f"Inserted {snap_count} snapshot rows.")

    session_count, skipped = load_sessions(supabase, fc_rows, name_key_to_id)
    print(f"Inserted {session_count} new session rows ({skipped} already existed, skipped).")

    print("\nDone. Open your deployed app and the roster should now be populated.")


if __name__ == "__main__":
    main()
