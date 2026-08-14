# ⚠️ DB CONTRACT (SCHEMA v1.1 FINAL) — READ BEFORE ANY PROMPT BELOW

The database schema is FINALIZED in `00-FINAL-DB-SCHEMA.md` (Part A is the
complete `db/schema.sql`). Rules for the AI coding tool — repeat them in every
generated file's header comment:

1. The schema is created ONCE from `db/schema.sql`. In THIS feature, Prompt 0
   creates that file: copy Part A of `00-FINAL-DB-SCHEMA.md` VERBATIM — all
   tables, all indexes, unchanged. Never write your own version of any table.
2. NEVER invent tables or columns. Use ONLY the exact names below.
3. If a column you need seems missing, STOP and report it — do not add it.
4. If any SQL inside the prompts below differs from this contract, THE
   CONTRACT WINS (some prompts predate schema v1.1).
5. All indexes already exist in db/schema.sql — do not create or drop indexes.

## Database connection (identical in every feature)

`.env.local` (never committed):
```
DATABASE_URL=postgres://school_app:<madhara>@localhost:5432/school
```

`lib/db.js` is the ONLY file that imports `pg`:
```js
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,                      // hard cap — see Part D of 00-FINAL-DB-SCHEMA.md
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})
module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction: async (fn) => { /* BEGIN → fn(client) → COMMIT / ROLLBACK → release */ },
  pool,
}
```
Every repo imports from `lib/db.js`. No ORM (no Prisma, Sequelize, Supabase,
Drizzle). No `new Pool` anywhere else. Parameterized queries only ($1, $2),
never string concatenation.

## Tables this feature OWNS (reads + writes)

```sql
-- A row here means NOT fully present that day. Present students have NO row.
CREATE TABLE student_attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('absent','late','half_day')),
  recorded_by BIGINT NOT NULL REFERENCES profiles(id),
  UNIQUE (student_id, date)
);

-- PRECOMPUTED: "did class X submit attendance today?"
CREATE TABLE attendance_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id),
  date DATE NOT NULL,
  marked_by BIGINT NOT NULL REFERENCES profiles(id),
  absent_count SMALLINT NOT NULL DEFAULT 0,   -- counts ALL exception rows
  modified_count SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, date)
);

CREATE TABLE staff_attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES profiles(id),
  date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','on_leave','half_day')),
  UNIQUE (teacher_id, date)
);
```

Attendance % math (used everywhere): presence per working day — no row = 1,
late = 1, half_day = 0.5, absent = 0; working days come from school_calendar.

## Tables this feature READS ONLY (exact signatures — do not modify them)

- `students(id, branch_id, class_id, parent_profile_id, full_name, roll_number, date_of_birth, gender, address, photo_url, admission_date, is_active, created_at)` — filter `is_active = true`
- `classes(id, branch_id, class_number, section)`
- `profiles(id, branch_id, role[admin|teacher|parent|bus], full_name, phone_number, email, address, photo_url, password_hash, must_change_password, last_login_at, failed_login_attempts, locked_until, created_at)`
- `teacher_class_assignments(id, teacher_id, class_id, subject_id, is_class_teacher)`
- `school_calendar(branch_id, date, is_working_day)` — composite PK (branch_id, date)

---

# FEATURE 01 — ATTENDANCE (Master Prompt File)

**How to use this file:** Copy ONE prompt at a time into your AI coding tool, in order (0 → 6). Each prompt tells the AI which files already exist and which files to create, so every step stays linked to the previous one. Do not skip Prompt 0.

**Project stack (same for every feature):** Next.js (App Router, JavaScript) + PostgreSQL + raw SQL via the `pg` npm package. No Prisma. No Supabase. Everything self-hosted.

**Files this feature will create:**

```
school-app/
├── db/schema.sql                                  (Prompt 0)
├── lib/db.js                                      (Prompt 0)
├── lib/auth.js                                    (Prompt 0)
├── lib/repos/attendanceRepo.js                    (Prompts 2, 4, 6)
├── components/attendance/ClassPicker.js           (Prompt 1)
├── components/attendance/StudentAttendanceList.js (Prompt 1)
├── components/attendance/AttendanceStatCard.js    (Prompts 3, 5)
├── app/attendance/teacher/page.js                 (Prompt 1)
├── app/attendance/parent/page.js                  (Prompt 3)
├── app/attendance/admin/page.js                   (Prompt 5)
├── app/attendance/admin/class/[classId]/page.js   (Prompt 5)
└── app/api/attendance/
    ├── classes/route.js                           (Prompt 2)
    ├── students/route.js                          (Prompt 2)
    ├── submit/route.js                            (Prompt 2)
    ├── modify/route.js                            (Prompt 2)
    ├── parent-summary/route.js                    (Prompt 4)
    └── admin-summary/route.js                     (Prompt 6)
```

---

## PROMPT 0 — Database Schema + Core Utilities (run once)

Copy and paste this into your AI:

> Act as an expert backend developer. I am building a self-hosted school management app with Next.js (App Router, JavaScript) and PostgreSQL using the raw `pg` npm package. No ORM, no Prisma, no Supabase.
>
> **Task 1 — Create `lib/db.js`:** Export a single shared `pg` connection Pool (read connection settings from environment variables: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD). Also export a helper `query(text, params)` function. The pool must be created only once even when Next.js hot-reloads (use the `globalThis` pattern).
>
> **Task 2 — Create `lib/auth.js`:** Export a `getSessionUser(request)` helper that reads a signed session cookie (JWT signed with `jose`, secret from env var SESSION_SECRET) and returns `{ profileId, role, branchId }` or null. Also export `requireRole(user, roles)` that throws a 403 error if the user's role is not in the allowed list. (The real login screens are built in the Auth feature — for now this is the shared utility every API route will import.)
>
> **Task 3 — Create `db/schema.sql`** with these attendance-related tables (UUID primary keys with `gen_random_uuid()`):
> - `branches(id, name, address, created_at)`
> - `profiles(id, branch_id → branches, full_name, phone_number UNIQUE, email, password_hash, role CHECK (role IN ('admin','teacher','parent','bus')), is_verified boolean, created_at)`
> - `classes(id, branch_id → branches, class_name, section_name)`
> - `students(id, parent_id → profiles, class_id → classes, branch_id → branches, full_name, roll_number, dob, gender, admission_date DATE, created_at)`
> - `teacher_class_assignments(id, teacher_id → profiles, class_id → classes, subject_id, is_class_teacher boolean)`
> - `school_calendar(date DATE, branch_id → branches, is_working_day boolean, PRIMARY KEY(date, branch_id))`
> - `student_attendance(id, student_id → students, date, UNIQUE(student_id, date))` — **absent rows ONLY; present is never stored** (keeps the table tiny and queries fast)
> - `attendance_submissions(id, class_id → classes, date, marked_by → profiles, submitted_at, modified_count INT DEFAULT 0, UNIQUE(class_id, date))` — tracks WHO marked attendance and enforces the one-modification rule
> - `staff_attendance(id, teacher_id → profiles, date, clock_in, clock_out, status, UNIQUE(teacher_id, date))`
> - `leave_requests(id, profile_id → profiles, branch_id, start_date, end_date, reason_type, description, status, created_at)`
>
> Add indexes on every foreign key, plus `student_attendance(date)` and `attendance_submissions(date)`.
>
> *Confirmation: One shared DB pool, one shared auth helper, and a schema where storing only absentees keeps the attendance table extremely small.*

---

## PROMPT 1 — Teacher Attendance UI (frontend only)

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. **Files that already exist:** `lib/db.js`, `lib/auth.js`, `db/schema.sql`. Build ONLY the UI for the Teacher attendance flow (use mock data for now; APIs come in the next step).
>
> **Create `app/attendance/teacher/page.js`:**
> 1. A back button at the top-left returning to the teacher dashboard (`/dashboard/teacher`).
> 2. Screen 1: list of the teacher's assigned classes with sections (e.g., "Class 10 — Section A"). Render using a new component `components/attendance/ClassPicker.js`.
> 3. Screen 2 (after picking a class): render `components/attendance/StudentAttendanceList.js` — the list of students sorted by roll number, each row showing Roll Number + Name.
> 4. **Smart defaulting:** every student starts as "Present" with a green highlight. Tapping the row's status button toggles to "Absent" (red). One tap = one absentee. No separate tick/cross pair per student.
> 5. A sticky "Submit Attendance" button at the bottom showing a live count: "Submit (3 absent / 42 present)".
> 6. If attendance was already submitted today for this class, show the saved result in review mode with an "Edit (1 change allowed)" button — the list is pre-filled with who was present/absent so the teacher can modify.
> 7. Keep components mobile-first: teachers use phones.
>
> *Confirmation: The teacher marks a full class in seconds because everyone defaults to Present.*

---

## PROMPT 2 — Teacher Attendance Backend + DB wiring

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Files that already exist:** `lib/db.js`, `lib/auth.js`, `db/schema.sql`, `app/attendance/teacher/page.js`, `components/attendance/ClassPicker.js`, `components/attendance/StudentAttendanceList.js`. Wire the teacher UI to real data.
>
> **Create `lib/repos/attendanceRepo.js`** — ALL raw SQL for this feature lives in this one file. Add functions: `getTeacherClasses(teacherId)`, `getClassStudents(classId)`, `getSubmission(classId, date)`, `getAbsentees(classId, date)`, `submitAttendance(classId, date, teacherId, absentStudentIds)`, `modifyAttendance(classId, date, teacherId, absentStudentIds)`.
>
> **Create these API routes (each one must call `getSessionUser` + `requireRole(user, ['teacher'])`):**
> 1. `app/api/attendance/classes/route.js` — GET: classes assigned to the logged-in teacher via `teacher_class_assignments`.
> 2. `app/api/attendance/students/route.js` — GET `?classId=`: students of that class sorted by roll number. Verify the teacher is actually assigned to this class; otherwise 403. If a submission already exists for today, also return the absent student IDs so the UI can show review mode.
> 3. `app/api/attendance/submit/route.js` — POST `{classId, absentStudentIds}`: **payload contains ONLY absentees** (present students are never sent — saves bandwidth). Inside ONE SQL transaction: insert a row into `attendance_submissions` (who marked, when) and bulk-insert absent rows into `student_attendance` with a single multi-row INSERT. Reject with 409 if a submission already exists for this class today.
> 4. `app/api/attendance/modify/route.js` — POST `{classId, absentStudentIds}`: allowed only if `modified_count = 0` for today's submission (one modification rule). In ONE transaction: delete today's absent rows for this class, re-insert the new list, set `modified_count = 1`. If already modified, return 403 "Modification limit reached — contact admin."
>
> Use parameterized queries everywhere ($1, $2). Never build SQL by string concatenation.
>
> *Confirmation: The DB stores only absentees + one submission record per class per day, enforcing the single-modification rule at the database level.*

---

## PROMPT 3 — Parent Attendance UI (frontend only)

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. **Files that already exist:** `lib/db.js`, `lib/auth.js`, `lib/repos/attendanceRepo.js`, and the teacher attendance pages. Build ONLY the Parent attendance UI (mock data for now).
>
> 1. **Create `components/attendance/AttendanceStatCard.js`:** a reusable widget card showing an attendance percentage with a horizontal stat/progress bar (e.g., "92% Present"). It will also be reused on the Admin dashboard later.
> 2. **Create `app/attendance/parent/page.js`:** 
>    - Top: the child's attendance percentage using `AttendanceStatCard`.
>    - Below: a scrollable history list of ALL working days till date (newest first). Each row: date, weekday, and a status chip — green "Present" or red "Absent".
>    - A back button to the parent dashboard.
> 3. This page must read the currently selected child from the global "Child Switcher" context (parents with multiple children), defaulting to the first child.
>
> *Confirmation: Parent sees a clean percentage widget that expands into a full day-by-day history.*

---

## PROMPT 4 — Parent Attendance Backend + DB wiring

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Files that already exist:** `lib/db.js`, `lib/auth.js`, `lib/repos/attendanceRepo.js`, `app/attendance/parent/page.js`, `components/attendance/AttendanceStatCard.js`. Wire the parent UI to real data.
>
> **Add to `lib/repos/attendanceRepo.js`:** a function `getStudentAttendanceSummary(studentId)` implementing this optimized on-the-fly calculation (NO stored "present" data):
> - Step A: COUNT working days from `school_calendar` for the student's branch, between GREATEST(student's `admission_date`, academic year start) and today.
> - Step B: COUNT rows in `student_attendance` for this student in the same range (these are the absences).
> - Step C: Present Days = A − B.
> - Step D: Percentage = (Present Days / A) × 100, rounded to 1 decimal.
> - Also return the day-by-day list: every working day with status 'absent' if a row exists in `student_attendance`, else 'present' (use a LEFT JOIN from `school_calendar` to `student_attendance`). Do this in ONE SQL query, newest first.
>
> **Create `app/api/attendance/parent-summary/route.js`** — GET `?studentId=`: call `getSessionUser`, `requireRole(user, ['parent'])`, and **verify `students.parent_id` equals the logged-in parent's ID — otherwise 403** (a parent must never read another child's data). Return `{percentage, presentDays, totalWorkingDays, history[]}`.
>
> *Confirmation: Perfect percentages generated mathematically from a tiny absentee-only table, with strict parent-child ownership checks.*

---

## PROMPT 5 — Admin Attendance UI (frontend only)

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. **Files that already exist:** all teacher/parent attendance files and `components/attendance/AttendanceStatCard.js`. Build ONLY the Admin attendance UI (mock data for now).
>
> **Create `app/attendance/admin/page.js`** with two tabs: "Students" and "Staff".
>
> **Students tab:**
> 1. Top: overall school attendance today (reuse `AttendanceStatCard`, e.g., "90% Present") plus a submission-progress chip: "12/15 classes submitted" — the percentage is live and never waits for all teachers.
> 2. Below: a class-wise grid — each class+section card shows its own percentage today and turns grey with "Not submitted yet" if the teacher hasn't marked it.
> 3. Clicking a class card navigates to `app/attendance/admin/class/[classId]/page.js`.
>
> **Create `app/attendance/admin/class/[classId]/page.js`:** the list of ABSENT students for that class today (Name, Roll Number, Class-Section), plus an "Admin Edit" button that lets the admin correct the attendance (admins bypass the teacher's one-modification limit).
>
> **Staff tab:**
> 1. `AttendanceStatCard` showing staff presence today (e.g., "93% Present").
> 2. A separate small widget: "Teachers on Leave today: N".
> 3. Clicking the staff percentage expands the list of absent teachers (name + subject), and present teachers with clock-in times.
>
> *Confirmation: Admin gets a live school-wide pulse without waiting for every class, and can drill from school → class → absent student in two clicks.*

---

## PROMPT 6 — Admin Attendance Backend + DB wiring

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Files that already exist:** everything from Prompts 0–5, especially `lib/repos/attendanceRepo.js`. Wire the admin UI to real data.
>
> **Add to `lib/repos/attendanceRepo.js`:**
> 1. `getSchoolAttendanceToday(branchId)` — ONE grouped SQL query returning, per class: total students, submitted-or-not (from `attendance_submissions`), absent count, and percentage. Compute the school-wide percentage across ONLY submitted classes, plus `submittedClasses / totalClasses`.
> 2. `getClassAbsenteesToday(classId)` — absent students with name, roll number, class-section.
> 3. `getStaffAttendanceToday(branchId)` — from `staff_attendance`: present teachers (with clock-in), absent teachers, and a count of teachers on approved leave today from `leave_requests` (status = 'approved' AND today BETWEEN start_date AND end_date).
> 4. `adminOverrideAttendance(classId, date, adminId, absentStudentIds)` — same transaction as modify, but skips the modified_count check and records the admin's ID in `marked_by`.
>
> **Create `app/api/attendance/admin-summary/route.js`** — GET returns the Students-tab + Staff-tab data in one response (one round trip). POST with `{action:'override', classId, absentStudentIds}` performs the admin correction. Both must call `getSessionUser` + `requireRole(user, ['admin'])` and scope every query to the admin's `branchId`.
>
> *Confirmation: One efficient grouped query powers the whole admin dashboard, and admin corrections are audited via `marked_by`.*

---

## NOTES — decisions & things I removed (read once)

1. **Removed:** separate tick ✅ + cross ❌ buttons per student. Replaced with default-Present + tap-to-toggle-Absent (your own master requirement — fewer taps, smaller payload).
2. **Removed:** "wait until ALL teachers submit before showing admin percentage." Replaced with live percentage + "12/15 submitted" indicator (otherwise one late teacher blanks the whole dashboard).
3. **Added:** `attendance_submissions` table — required for "track who marked attendance" and the one-modification rule. Without it these two requirements are impossible.
4. **Added:** `admission_date` on students so percentages are fair for mid-year admissions.
5. **Kept:** absentee-only storage — excellent for low CPU/storage.
6. **Next feature files should follow this same pattern:** `02-MARKS-master-prompts.md`, `03-FEES-master-prompts.md`, etc. All of them will reuse `lib/db.js`, `lib/auth.js`, and the `lib/repos/` pattern created in Prompt 0.
