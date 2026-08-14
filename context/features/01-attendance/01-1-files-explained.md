# Feature 01 — Attendance: Every File Explained in Plain English

**Built:** 2026-08-13 · **Status:** tested and working
**Read this** if you want to understand what each attendance file does, what
it talks to, and what would break if you changed it. Technical words are
explained (in brackets) the first time they appear.

---

## 1. The big picture in one minute

Attendance works like a paper register, but smarter:

- The teacher opens a class and sees every student already marked **Present**.
  One tap on a student flips them to **Absent**. One button sends it.
- The app only ever stores the ABSENT students. A present student has no record
  at all. (This keeps the database tiny: 2 rows instead of 25 per class per day.)
- When a teacher presses Submit, the app saves one "register page" record for
  the class (who marked it, when, how many absent) plus one row per absent
  student. That register-page record is ALSO what makes the day count as a
  school day for that class (the owner's rule: **a class has a working day
  exactly when a teacher submitted attendance for it** — Sundays and holidays
  count too if someone submits).
- The parent of each absent child immediately gets a notification (bell icon
  in the app + a buzz on their phone if they allowed it).
- The parent can open a screen showing their child's percentage and a
  day-by-day history.
- The admin sees the whole school today, class by class, can drill into a
  class, and can correct the record. Teachers get exactly ONE edit per day;
  admins have no limit. Every correction is written into a tamper-proof
  activity log (the `audit_logs` table) with who did it and what changed.

### The screens and who sees them

| Screen address | Who | What it shows |
|---|---|---|
| `/teacher/attendance` | teacher | Grid of all 16 classes → tap one → marking sheet |
| `/parent/attendance` | parent | Child's % card + day-by-day history (+ child picker if 2+ kids) |
| `/admin/attendance` | admin | School % today, N/16 submitted, per-class cards |
| `/admin/attendance/class/49` | admin | One class: who's absent + Admin Edit |

You cannot open another role's screens: the app's front gate (`proxy.js`,
the security file that checks every request) already blocks it, because the
addresses start with `/teacher`, `/parent`, `/admin`.

---

## 2. The new files, one by one

### A. `lib/repos/attendanceRepo.js` — the database question-answerer

Every question the app asks the database about attendance lives in this one
file, and nowhere else. (A "repo" = a file holding database queries. Project
rule: all SQL — the database language — must live inside `lib/repos/`.)

What each function does:

| Function | Plain-English job |
|---|---|
| `getClassInfo(classId)` | "Does this class exist, and which branch does it belong to?" Used to stop anyone touching another school's class. |
| `getClassRoster(classId)` | The class's students, in roll-number order. Only active students. |
| `getTodayClassState(classId)` | "Has this class been submitted today? By whom? Edited yet? Who's absent?" |
| `getChildrenOfParent(parentId)` | All children linked to a parent's login (for the picker). |
| `getOwnedStudent(studentId, parentId)` | "Is this child really YOURS?" — the safety check behind the parent screen. Returns nothing if not, which becomes a 403 (access denied). |
| `getStudentAttendanceSummary(studentId, classId)` | The full maths: working days of the child's class, absent/half-day/late counts, the weighted percentage, and the day-by-day history list. |
| `getSchoolToday(branchId)` | For the admin: every class with today's status (submitted or not, how many absent/late/half-day). One efficient grouped query. |
| `getClassExceptionsToday(classId)` | The absent/late/half-day students of one class today (admin drill-down). |
| `getParentInfoForStudents(studentIds)` | "Which parent do I notify for each absent child?" |
| `submitAttendance(...)` | First save of the day. Both inserts (register page + absent rows) happen together or not at all (a "transaction" — half-saved data is impossible). If the class was already submitted, the database itself refuses (rule `UNIQUE(class_id, date)`) and the screen shows 409 "already submitted". |
| `modifyAttendance(...)` | The teacher's one edit. Locks the register row while working (so two teachers clicking Save at the same second can't both win), refuses if already edited once, swaps the absent list, records who edited. |
| `adminOverrideAttendance(...)` | The admin correction. No edit limit. If the teacher never submitted, it creates the record. |

**Safety details built in:** every query uses placeholders (`$1`, `$2`) so
user input can never become a database command (SQL injection protection).
Ids coming out of the database are converted from text to real numbers here,
so the rest of the app never trips over `"4" !== 4`. "Today" is always
computed in Indian time inside the query itself.

### B. `lib/attendance.js` — the small shared helper (server-only)

Not database code. Two helpers shared by the three "save" routes:

- `todayIst()` — today's date in India in two shapes: `2026-08-13` (for the
  audit log) and `13 Aug 2026` (for humans).
- `notifyAbsences({...})` — for each newly absent child, finds their parent
  and sends exactly one notification: title "Absence marked: <child name>",
  shown in the parent's bell AND pushed to their phone (priority
  "important" — buzzes, but is not the red emergency level). It never throws
  an error back: attendance is already saved when this runs, so a
  notification problem can never make the teacher's Save look failed.

### C. The five API routes (`app/api/attendance/...`)

An "API route" is a URL the app itself (or a browser fetch) calls to read or
change data. Each one follows the same five steps, in order: **who are you →
are you allowed → is the input sane → do the work → answer in the standard
shape** (`{ ok: true, data }` or `{ ok: false, error }`).

| Route | Method + role | Job |
|---|---|---|
| `students/route.js` | GET · teacher/admin | The marking sheet data: roster + today's saved state in one answer. |
| `submit/route.js` | POST · teacher | First submission. 409 if the class already submitted today. Notifies absent children's parents. |
| `modify/route.js` | POST · teacher | The one allowed edit. 403 if already used up. Writes the audit log, notifies only NEWLY absent children's parents. |
| `parent-summary/route.js` | GET · parent | The child's percentage + history. Hard-403 if the child isn't yours. |
| `admin-summary/route.js` | GET · admin · POST · admin | GET: the whole dashboard (school % over submitted classes only + every class's card data). POST with `{action:"override"}`: the admin correction, always audit-logged. |

### D. The three components (`components/attendance/`)

A "component" is a reusable piece of screen.

- **`ClassPicker.js`** — the grid of class cards (2 columns on phones, more on
  bigger screens). Just links; no interactivity code is shipped to the phone
  for it.
- **`StudentAttendanceList.js`** — the heart of the feature and the ONLY piece
  that runs in the browser ("use client"). Shows the roster; one tap toggles a
  student Present↔Absent; a sticky bottom bar always shows the live count
  ("Submit (2 absent / 23 present)"). After a successful save it refreshes the
  server data so the screen always matches the database. The SAME file is used
  by teachers (submit mode / one-edit mode) and admins (override mode) — the
  `mode` prop tells it which address to save to. One file means one behaviour,
  not two copies that drift apart.
- **`AttendanceStatCard.js`** — the big percentage card with the progress bar
  (green ≥ 90%, amber ≥ 75%, red below, grey "no data yet"). Used on the
  parent screen and the admin dashboard. Follows the app's design system
  (serif number, mono micro-label, 3px coloured left edge).

### E. The four pages (`app/...`)

- **`app/teacher/attendance/page.js`** — decides by URL: no `?classId=` → the
  class grid; with `?classId=49` → that class's marking sheet (pre-filled if
  already submitted, with the Edit button when the one edit is still unused).
- **`app/parent/attendance/page.js`** — loads the parent's children, picks the
  selected one (or the first), renders the % card and the day-by-day history
  (Present / Absent / Late / Half day chips with dates like "Thu, 13 Aug").
- **`app/admin/attendance/page.js`** — the school card + "N of 16 submitted"
  + one card per class (grey "Not submitted yet" until the teacher submits).
  Fresh numbers on every open (it's server-rendered — no stale data).
- **`app/admin/attendance/class/[classId]/page.js`** — today's
  absent/late/half-day list for the class, plus the Admin Edit control.

### F. Three small edits to EXISTING files

`app/teacher/page.js`, `app/parent/page.js`, `app/admin/page.js` each gained
one card linking to their attendance screen. Those pages were built with a
note saying "each feature adds its section to this page" — this is that.
Nothing else in them was touched. **No other existing file was modified**
(`proxy.js`, `lib/auth.js`, `lib/guard.js`, feature 09's files: all untouched,
only imported).

---

## 3. How a day actually flows (follow the data)

1. Teacher opens `/teacher/attendance` → the page (on the server) asks
   `coreRepo` for the branch's classes → grid renders.
2. Teacher taps "1 A" → URL becomes `?classId=49` → the page asks
   `attendanceRepo` for the roster + today's state → marking sheet renders,
   all Present.
3. Teacher taps 2 students (they flip red) → taps **Submit (2 absent / 23
   present)** → the browser POSTs `{classId: 49, absentStudentIds: [417, 401]}`
   to `/api/attendance/submit`.
4. The route checks the session and role, checks the class belongs to the
   school, then one transaction writes the register page + the 2 absent rows.
   That register-page row IS what makes today count as a working day for
   class 1A.
5. The route calls `notifyAbsences` → each child's parent gets a bell
   notification, and their phone buzzes if they allowed push.
6. The parent opens `/parent/attendance` → working days = 7 (6 earlier + today),
   absent = 1 → percentage and history update instantly.
7. Teacher notices a mistake → Edit (available once) → saves → the old absent
   list is replaced, the activity log records who/when/before→after, and only
   NEWLY absent children's parents get pinged.
8. Admin opens `/admin/attendance` → sees "2 of 16 classes submitted" and the
   live school %. Taps a class → sees who's absent → "Admin edit" corrects the
   record (no limit), also logged.

---

## 4. Handoff notes for future features

### 4.1 For Feature 11 (Profiles) — the real Child Switcher

Today `/parent/attendance` carries a TEMPORARY child picker: a row of plain
links (`?student=<id>`), rendered only when a family has 2+ children. When you
build the real `ChildSwitcher`:

- The page already loads the full children list via
  `getChildrenOfParent(session.profileId)` from `attendanceRepo` and already
  honours `?student=<id>` with an ownership-safe fallback (unknown ids fall
  back to the first child; the API hard-403s non-owners).
- Your switcher only needs to drive that same `?student=` parameter (or lift
  the selection into your shared state and pass the chosen student down).
- Keep the rule: never trust an id from the URL — always intersect with the
  parent's own children list (the current page shows how).
- Delete the inline picker block in the page when your component lands (it is
  clearly commented as the stand-in).

### 4.2 The deferred Admin "Staff" tab — full spec

Not built (owner's decision): nothing records staff attendance "today" yet, so
the tab could only show empties. When a staff clock-in feature exists, add it
to `/admin/attendance` as a second tab:

- **Data sources that already exist:** `staff_attendance` (teacher_id, date,
  clock_in, clock_out, status present/absent/on_leave/half_day) and
  `leave_requests` (status 'approved' AND today within start/end dates).
- **UI per the original prompt:** an `AttendanceStatCard` with staff presence
  % today, a small "Teachers on leave today: N" widget, and an expandable list
  of absent teachers (name + subject) and present teachers with clock-in times.
- **Rules to keep:** new SQL goes into `attendanceRepo.js` (or a
  `staffRepo.js` if a staff feature owns it by then); the tab reads only —
  writes belong to the feature that records staff attendance; reuse
  `AttendanceStatCard`.

### 4.3 Test data to clean before launch

This feature's live tests left, in the dev database: submissions for classes
49 and 50 dated 2026-08-13, their absent rows, absence notifications, and
`attendance.override` audit rows. Add them to the pre-launch cleanup list that
feature 09 started.

---

## 5. If something looks broken, check these first

1. **A brand-new page answers 404** → the dev server memorized its page list
   before the file existed. Stop it, delete the `.next` cache folder (safe —
   it rebuilds itself), restart. Editing an existing file never needs this.
2. **The parent screen says "No children are linked"** → the child row in the
   database points to a different parent account. (During the build this exact
   message caught a real bug: the page was reading the id from the wrong
   object.)
3. **A number comparison looks right but behaves wrong** → database BIGINT ids
   arrive as TEXT ("4", not 4). Compare only after converting, or take ids
   from the session token which is already numeric.
4. **Percentages differ between screens** → they shouldn't: parent screen and
   admin screen use the same weights (absent = 0, half day = 0.5, late =
   present). If they ever disagree, one of them was changed without the other.
