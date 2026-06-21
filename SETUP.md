# Flight School CRM — setup guide

This is a real, deployable app: React frontend, Supabase database (with
login and role-based permissions), hosted free on Vercel. Follow these
steps in order — each one builds on the last.

Total accounts needed, all free at this scale: **GitHub, Supabase, Vercel.**

---

## Part 1 — Create your accounts

1. **GitHub** — go to github.com, sign up (free). This is where your code
   lives and what Vercel deploys from.
2. **Supabase** — go to supabase.com, sign up (free), using "Sign in with
   GitHub" is easiest. Click **New Project**.
   - Name it something like `flight-school-crm`.
   - Set a database password (save it somewhere — a password manager is
     fine — you likely won't need it again, but keep it just in case).
   - Pick the region closest to your school.
   - Wait ~2 minutes for the project to finish provisioning.
3. **Vercel** — go to vercel.com, sign up using "Continue with GitHub"
   (free). This is what hosts the live website.

---

## Part 2 — Set up the database

1. In your Supabase project, click **SQL Editor** in the left sidebar,
   then **New query**.
2. Open `supabase/migrations/001_initial_schema.sql` from this project,
   copy its entire contents, paste into the SQL editor, click **Run**.
   You should see "Success. No rows returned."
3. Repeat with `supabase/migrations/002_row_level_security.sql` — new
   query, paste, run.
4. Repeat with `supabase/migrations/003_hours_and_milestones.sql` — new
   query, paste, run. This adds the true cumulative-hours calculation
   and the student milestones checklist (First Solo, Solo XC, Written
   Exam, Checkride Scheduled — edit the seed list at the bottom of that
   file before running if you want different defaults).
5. Repeat with `supabase/migrations/004_course_total_hours.sql` — new
   query, paste, run. (This one is superseded by 005 below for what the
   app actually displays now, but still safe and useful to have — leave
   it in place.)
6. Repeat with `supabase/migrations/005_all_student_hours.sql` — new
   query, paste, run. This adds per-student hour totals used for the
   School page's "Avg time / student" column and the Course page's
   "Total time" column.
7. Repeat with `supabase/migrations/006_tag_groups.sql` — new query,
   paste, run. This adds tag grouping (e.g. "Progress," "Course,"
   "Issue") so the tag management page can organize tags by section
   instead of one flat list.
8. Repeat with `supabase/migrations/007_permission_profiles.sql` — new
   query, paste, run. **This replaces the old admin/instructor role
   system entirely** with fully custom permission profiles. It seeds one
   built-in "Owner" profile with full access. If you'd already bootstrapped
   yourself as admin under the old system, that assignment no longer
   applies — you'll redo the bootstrap step below using the new system.
9. Repeat with `supabase/migrations/008_student_weekly_hours.sql` — new
   query, paste, run. Adds the weekly-hours aggregate used by the chart
   on the student page.
10. Repeat with `supabase/migrations/009_import_permissions.sql` — new
    query, paste, run. Adds write permissions needed for the in-browser
    Import tab.
11. Repeat with `supabase/migrations/010_weekly_progress_and_selection.sql`
    — new query, paste, run. Adds a third importable data source
    (FlightCircle cancellations), the Weekly Progress aggregate (matches
    the uploaded tracker spreadsheet's six-column-per-week layout:
    Total Activities, Flights, Flight Hours, Grounds, Ground Hours,
    Cancels), and per-user student selection (the checkbox / "show
    selected" feature).
12. You now have a real database with students, tags, notes, milestones,
    permission profiles, and the permission system we designed, but no
    data in it yet (next: Part 4).

---

## Part 3 — Get your app talking to Supabase

1. In Supabase, go to **Project Settings > API**. You'll need two values
   from this page:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string under "Project API keys")
2. In this project folder, copy `.env.example` to a new file named `.env`
   and paste in those two values:
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```
3. **Never commit `.env` to GitHub** — it's already in `.gitignore` so
   this should happen automatically, but worth double-checking.

---

## Part 4 — Load your real data

There are two ways to get CTA/FlightCircle data into the app. **The
in-browser Import tab (Part 4a) is the easiest and is now the primary
way to do this** — the Python scripts (Part 4b) still work and are kept
as a fallback (useful for scripting/automation later, or if you'd rather
not grant browser-based write access to anyone).

### Part 4a — Import tab (recommended)

This only works once you've completed Part 5 below (signed in once and
bootstrapped yourself as Owner), since importing requires being signed
in with a profile that holds the `can_import_data` and
`can_manage_students` capabilities — the built-in Owner profile has both
by default.

1. Sign in to the app, go to **Import data** in the sidebar (under Admin
   — only visible to profiles with that permission).
2. Choose **CTA progress report**, **FlightCircle reservations**, or
   **FlightCircle cancellations**,
   upload the CSV file you exported, review the preview, and click
   **Confirm import**.
3. Repeat any time you have a fresh export — duplicate sessions are
   automatically skipped, and CTA snapshots always add a new row rather
   than overwriting (see the in-app description for why).

Everything happens in your browser; no Python install needed for this path.

### Part 4b — Python scripts (alternative / automation path)

1. Install Python dependencies (one time):
   ```
   pip install supabase python-dotenv pandas
   ```
2. Clean your raw exports using the scripts in `import-scripts/`:
   ```
   cd import-scripts
   python import_cta_snapshot.py <your_cta_export.csv> cta_clean.csv --snapshot-date 2026-06-20
   python import_flightcircle_sessions.py <your_flightcircle_export.csv> flightcircle_clean.csv
   ```
3. Get your **service role key** (different from the anon key — this one
   has full write access, so treat it like a password): Supabase >
   Project Settings > API > "service_role" key.
4. In the `supabase/` folder, create a `.env` file (yes, a second one,
   separate from the app's):
   ```
   SUPABASE_URL=https://abcdefgh.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```
5. Run the loader:
   ```
   cd supabase
   python load_to_supabase.py ../import-scripts/cta_clean.csv ../import-scripts/flightcircle_clean.csv
   ```
   You should see a summary of students and rows inserted.

Both paths use the same dedup logic, so it's safe to mix — e.g. import via
the browser most of the time, fall back to the Python path occasionally —
without double-counting.

---

## Part 5 — Run it locally first (recommended before deploying)

1. Install Node.js if you don't have it: nodejs.org, download the LTS
   version, install it.
2. In this project folder:
   ```
   npm install
   npm run dev
   ```
3. Open the URL it prints (usually `http://localhost:5173`).
4. You'll see a sign-in screen. Enter your email — Supabase sends a
   magic link (no password). Click the link in your email.
5. **First-time-only step:** right after you sign in once, you need to
   assign yourself the Owner profile (full access to everything). In
   Supabase SQL Editor, run:
   ```sql
   select id, email from auth.users;
   ```
   to find your user id, then:
   ```sql
   insert into user_profiles (user_id, profile_id, full_name)
   select '<paste-your-user-id-here>', id, 'Your Name' from profiles where name = 'Owner';
   ```
6. Refresh the app — you should see your student roster, populated from
   the data you loaded in Part 4, and the full sidebar including the
   Admin section (Manage tags, Permissions, Import data).

---

## Part 6 — Deploy it live (so it has a real URL)

1. Create a new repository on GitHub (github.com > New repository).
2. Push this project to it:
   ```
   git init
   git add .
   git commit -m "Initial flight school CRM"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. In Vercel: **Add New > Project**, select your GitHub repo, click
   **Import**.
4. Before clicking Deploy, expand **Environment Variables** and add the
   same two values from your `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. After a minute or two, you'll get a real URL like
   `flight-school-crm.vercel.app` — that's your live app.

---

## What you have now vs. what's still manual

**Working:** real login, real database, tags and notes that persist for
everyone who uses the link, fully custom permission profiles (sidebar
visibility, page-element visibility, and database-enforced write
capabilities — see the Permissions page), a weekly-hours histogram on
the student page, expandable course rosters with per-row checkboxes,
a "show all / show selected" toggle that carries through to School
totals and the Weekly Progress table, a Weekly Progress tab matching
the tracker spreadsheet's per-week layout (Total Activities, Flights,
Flight Hours, Grounds, Ground Hours, Cancels — click a week's header to
expand the full breakdown), collapsible sidebar groups, a three-source
in-browser data import tool (CTA, FlightCircle reservations, and
FlightCircle cancellations), and your actual data loaded in.

**Adding instructors going forward:** have them sign in once (so their
account exists), then go to **Permissions** in the sidebar and assign
them a profile under "Assign users." Until assigned, a signed-in user
sees a "No profile assigned yet" message rather than the app — this is
intentional, not a bug.

**Permissions — what's a real security boundary vs. a UI convenience:**
Sidebar and page-element visibility (what a profile *sees*) are
convenience settings enforced only in the React code. The write
capabilities (managing tags, profiles, students, others' notes, and
importing data) are enforced by the database itself (RLS) and can't be
bypassed by going around the UI. See the note at the top of the
Permissions page, and the comments in
`supabase/migrations/007_permission_profiles.sql`, for the full
reasoning.

**Still manual:** pulling fresh exports from CTA/FlightCircle and
importing them (via the Import tab or the Python scripts) — there's no
live API connection yet (that was the open question from earlier in
this project: FSP has a documented Training API, FlightCircle's
training-data API access is unconfirmed, and CTA has no public API at
all). Automating this pull is a natural next step once you've confirmed
what's actually available.

**On "too many students" from old imports:** importing CSVs with several
years of history pulls in every student who ever appears in that export
— including ones long graduated or inactive. There's no automatic
purge of old students (deleting them would silently lose their
historical hours/notes/tags, which is rarely what you want). Instead,
use the checkboxes: check the students who are actually current, switch
the top-bar toggle to "Show selected," and every view — School totals,
Course rosters, Weekly Progress — narrows to just that set. The
underlying records for everyone else stay intact, just out of view
until you need them.

**Worth doing before wider rollout:** create a couple of non-Owner
profiles (e.g. "Instructor" with school/courses/student visibility but
no admin capabilities), assign a few real instructors, and see how the
tagging/notes/histogram workflow holds up in real use before treating
this as the school's system of record.
