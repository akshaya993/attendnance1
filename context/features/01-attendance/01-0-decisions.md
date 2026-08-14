# Feature 01 â€” Attendance: Locked Decisions

> **URL RESTRUCTURE NOTE (2026-08-14):** the pages moved from role-first to
> FEATURE-FIRST URLs after this doc was written: `/attendance/teacher` â†’
> `/attendance/teacher`, `/attendance/parent` â†’ `/attendance/parent`,
> `/attendance/admin` â†’ `/attendance/admin`. (This supersedes the "role-first"
> answer recorded in section 2's Q1 â€” the owner later chose the feature-first
> layout used by the leaves/marks reference repo.) All logic, APIs
> (`/api/attendance/*` unchanged), components, and the repo are identical;
> only page locations and their links/gates moved. Every test below was
> re-run and passes on the new URLs.

Status: **DONE â€” built and tested 2026-08-13.**
Owner feature: 01 (Attendance). Built after 13 (Auth) and 09 (Notifications).
Read this before touching ANY attendance code in any future chat.

This file records WHAT was decided and WHY. For what each file does in plain
English, read the companion: `01-1-files-explained.md` (same folder).

---

## 1. THE WORKING-DAY RULE (the owner's rule â€” it overrides everything older)

**A date is a working day FOR A CLASS if and only if that class has a row in
`attendance_submissions` for that date. Nothing else decides it.**

- `school_calendar` is NOT used anywhere in this feature. Not for working days,
  not for Sundays, not for holidays. Do not import it, query it, or reference it.
- **Sundays and public holidays count** if a teacher submits on them. There is
  NO date-based exclusion anywhere in the code.
- Classes are fully independent: Class 9 can have 18 working days while
  Class 10 has 20. There is no school-wide working-day count.
- **The submission row IS the "+1 working day" mark.** The database enforces
  one per class per day (`UNIQUE(class_id, date)`), so counting a class's
  submission rows IS its working-day count. No counter column was added
  (owner approved: "Submission row IS the +1").

### Attendance percentage (per child, against the child's OWN class)

```
workingDays = submissions for the child's class, up to today
attended    = workingDays âˆ’ (absent Ã— 1) âˆ’ (half_day Ã— 0.5)     [late = 1]
percentage  = attended / workingDays Ã— 100, rounded to 1 decimal
```

This is the DB-contract weighting (the owner chose it over the prompt's
simpler "any exception = absent" math). Exception rows only count when a
matching submission exists for that class + date (a JOIN enforces it), so a
stray row can never distort the percentage.

**Known accepted edge case (owner's rule followed literally):** a student who
joins mid-year gets the class's earlier working days counted as attended,
because exception rows can only exist after they joined. No admission-date
cap exists â€” the rule above is the ONLY rule. Revisit only if a real school
complains about a mid-year joiner's percentage.

---

## 2. Decisions locked by the owner (Q&A before the build)

| # | Question | Locked answer |
|---|---|---|
| 1 | URLs | **Role-first:** `/attendance/teacher`, `/attendance/parent`, `/attendance/admin`, `/attendance/admin/class/[classId]`. Matches feature 09's pattern; proxy.js needed ZERO changes (its ROLE_PREFIXES already gate `/teacher`, `/parent`, `/admin`). The prompt file's `/attendance/teacher` layout was NOT used. |
| 2 | Percentage math | Contract weights (absent 0, half_day 0.5, late 1). |
| 3 | Teacher marking | **Absent-only one-tap toggle.** Everyone starts Present. The UI never creates 'late'/'half_day' rows (seed history has them; displays honour them). |
| 4 | Admin Staff tab | **NOT BUILT.** Nothing records staff clock-in data yet, so it could only show empty states. Returns when a staff-attendance feature exists. Full spec for it lives in `01-1-files-explained.md`. |
| 5 | Absence alerts | **Yes, and the phone must buzz:** priority `important` (in PUSH_PRIORITIES), not `urgent` (reserved for emergencies). Bell row + push. One notification per absent child, to that child's OWN parent only. |
| 6 | Days allowed | **Today only**, for teachers AND admin override. No backfill UI exists. ("Today" is always IST.) |
| 7 | Teacher-class rule | **Any class.** Teachers are NOT restricted to assigned classes (overrides the prompt file's 403-on-unassigned). Branch boundaries still apply and are enforced from the session. |
| 8 | Multiple children | Minimal link-based picker on the parent page (`?student=<id>`), rendered only when the family has 2+ children. **Feature 11 replaces it** with the real ChildSwitcher â€” see `01-1-files-explained.md` for the handoff notes. |
| 9 | Audit | Every post-submission change is logged: teacher's one edit AND every admin override. Action: `attendance.override` (pre-existing in AUDIT_ACTIONS). Details carry date, who (`teacher`/`admin`), and the before/after absent id lists. First submissions are NOT audited (routine). `marked_by` on the submission row tracks the LAST person who touched it. |

---

## 3. Design decisions (implementation-level, made and tested)

### 3.1 Reused, not rebuilt

- `lib/guard.js` â€” `requireActiveApiSession()` is the first line of every API
  route; `requireActiveSession()` is the first line of every page. The
  session_epoch kill-switch therefore covers attendance for free.
- `lib/auth.js` â€” `requireRole()` for role gates.
- `lib/audit.js` â€” `logAudit()` for overrides (standalone mode, same as
  feature 09's broadcast: a failed audit row never rolls back saved attendance).
- `lib/notify.js` â€” `createNotification()` is the ONLY thing writing
  notification rows. Attendance adds no delivery code of its own.
- `lib/db.js` â€” `query` / `withTransaction`.
- `coreRepo.listClassesByBranch()` â€” the teacher's class grid reuses it
  (snake_case rows are mapped to camelCase in the page before reaching
  components).
- `components/BackLink.js`, `ThemeToggle`, the `.card`/`.pill`/`.cta`/
  `.field`/`.label-micro` classes, the Veritas tokens.
- The bell, push subscriptions, service worker â€” untouched; absence alerts
  ride them through `lib/notify.js`.

### 3.2 Deliberately NOT created

- **`/api/attendance/classes` route** â€” the prompt file lists it, but the
  teacher picker is a server component that reads classes straight from
  `coreRepo` (fewer moving parts, and `/api/classes` already exists for client
  needs). Creating it would duplicate existing functionality.
- **Any migration.** The schema already had everything: `student_attendance`,
  `attendance_submissions`, and (from feature 09's migration 003) the
  `notifications.source` CHECK list already includes `'attendance'`.
- **A `workers/` job, a counter column, a new table** â€” nothing. The
  submission rows answer every working-day question.

### 3.3 Where the notification logic lives

`lib/attendance.js` (new, tiny, server-only) holds the two things all three
write routes share: `todayIst()` (IST date as ISO + human label) and
`notifyAbsences()` (looks up parents via the repo, then one
`createNotification()` per child). It never throws: attendance is already
committed when it runs, so an alert hiccup must not error the teacher's save.

**Delta rule on edits:** a modify/override notifies ONLY parents of children
who are absent in the new list but were not absent before. Removals are
silent. Verified live (re-edit notified 0).

### 3.4 The pages are server components; only the marking sheet is client

- Teacher/parent/admin pages render on the server straight from repos
  (allowed: pages may READ via repos; only writes must go through `/api/*`).
- `StudentAttendanceList.js` ("use client") is the one interactive piece:
  toggle state, sticky submit bar, review mode, the Edit button. It is shared
  by the teacher screen AND the admin drill-down; the `mode` prop
  ("teacher" | "admin") decides the endpoint and payload shape.
- After a save it calls `router.refresh()` so the screen always matches the
  database.

### 3.5 "Today" is pinned to IST twice, independently

- SQL: every query computes `(now() AT TIME ZONE 'Asia/Kolkata')::date`.
- JS (labels, audit details): `Intl.DateTimeFormat` with
  `timeZone: "Asia/Kolkata"`.
Neither depends on the server machine's own timezone.

### 3.6 Errors are outcomes, not exceptions

`modifyAttendance` returns `{ ok: false, reason: "no_submission" | "limit_reached" }`
for the two EXPECTED refusals (route maps them to 404 / 403), and lets the
23505 unique violation bubble out of `submitAttendance` for the route to map
to 409. No new error class was invented.

---

## 4. Bugs found DURING this build (and the lesson)

### 4.1 `profile.branchId` is a STRING â€” use `session.branchId`

`requireActiveSession()` returns `{ session, profile }`. `session.branchId`
comes from the signed JWT (a real number). `profile.branchId` comes from pg's
BIGINT parsing (the STRING `"4"`). Comparing `classInfo.branchId !== profile.branchId`
was `"4" !== 4` â†’ always true â†’ silent 404 on both parameterised pages.
Feature 09's docs warned about exactly this ("pg returns BIGINT as a string")
and it still bit once. **Rule: in pages and routes, take ids/branchId from the
SESSION. Treat every raw pg BIGINT as a string until Number()-ed.**

### 4.2 `profile.id`, not `profile.profileId`

The profile row from `authRepo` calls the id field `id`; only the session
calls it `profileId`. `getChildrenOfParent(profile.profileId)` queried with
`undefined` and silently returned zero children. Fixed to
`session.profileId`. Same lesson as 4.1: know which object carries which name.

---

## 5. Test evidence (all live, 2026-08-13, against the real dev DB)

Logins used: teacher `9000000101`, parent `9810000002`, admin `9000000001`,
bus `9000000021` â€” all `Pass@123`. NOTE: `9810000001`'s password no longer
matches (changed during some earlier feature's testing) â€” use 9810000002.

- Teacher submit class 49 with [417, 401] â†’ `200 {absentCount:2, notified:2}`.
- Immediate second submit â†’ `409` with a clean message; no partial rows.
- Teacher state read â†’ `submitted:true, absentIds:[401,417], modifiedCount:0`.
- Teacher modify to [417] â†’ `200 {absentCount:1, notified:0}` (no re-alert â€”
  417 was already absent; 401's removal is silent).
- Second teacher modify â†’ `403 Modification limit reached - contact admin.`
- Modify on a never-submitted class â†’ `404`.
- Parent summary for child 417: workingDays went 6 â†’ **7** the moment the
  teacher submitted (the working-day rule working live), percentage
  recomputed correctly each time (83.3 â†’ 71.4 â†’ 85.7 as edits happened).
- Parent bell: "Absence marked: Vihaan Varma" as an **important**,
  unread notification; unread count moved exactly once per NEW absence.
- Parent reading another family's child (ids 402, 418) â†’ `403`.
- Admin dashboard: school % averages ONLY submitted classes; counter read
  `1/16` then `2/16` as classes submitted.
- Admin override class 49 â†’ `200 {created:false, notified:1}` (only the newly
  absent child's family alerted); state then showed `markedBy: School
  Administrator`, `modifiedCount: 2`.
- Override on a class with NO submission creates it (`created:true` path used
  for class 50's empty-absent test: `absentCount: 0` â€” an all-present day
  still counts as a working day, exactly per the rule).
- Guards: parent POST submit â†’ 403 Â· teacher GET admin-summary â†’ 403 Â·
  teacher POST override â†’ 403 Â· bus POST submit â†’ 403 Â· anonymous â†’ 401 Â·
  bad `classId=abc` â†’ 400.
- Pages render: `/attendance/teacher` (grid + sheet), `/attendance/parent`
  (card "71.4%", history chips with "Thu, 13 Aug" on top), `/attendance/admin`,
  `/attendance/admin/class/49` â€” all HTTP 200 with expected content.
- `npx eslint` on every touched file: clean. `npm run build`: completes.
- `/api/health` after everything: `{"ok":true,"students":400}`.

### Edge-case battery (2026-08-14, second pass)

- **Weights on real data:** student 449 (1 late + 1 absent seeded) â†’
  attended = 7 âˆ’ 1 âˆ’ 0 = 6 â†’ 85.7% (late costs nothing). Student 465 (1
  half_day + 1 absent) â†’ 7 âˆ’ 1 âˆ’ 0.5 = 5.5 â†’ 78.6% (half day costs exactly
  half). Both match the contract maths to the decimal.
- **Class independence:** a child of class 1B (submitted Aug 13, all-present)
  has 7 working days; a child of class 2A (not submitted) has 6. One class's
  submission never leaks into another class's count.
- **All-present submissions count:** class 50's zero-absent submission raised
  its working days 6 â†’ 7 with nobody marked absent.
- **Notification deltas, measured by unread counts:** empty submit â†’
  notified=0, bell unchanged (11â†’11). Modify adding one child â†’ notified=1,
  bell 11â†’12, top item is the absence alert. Admin override [417,433] â†’
  notified=1: 433's parent 8â†’9, 417's parent stays 12 (no re-alert for a
  family that already knew).
- **Audit write path:** dev log contains zero `[audit] failed` lines across
  the whole battery - every override/modify audit row committed (standalone
  logAudit logs failures; silence = success).

**Test residue left in the dev DB on purpose** (so the owner can click through
and see real data): the 2026-08-13 submissions for classes 49 and 50, the
2026-08-14 submission for class 49 (plus its modify + admin override), their
absent rows, absence notifications, and `attendance.override` audit rows.
Delete before launch along with feature 09's listed test rows.

---

## 6. What this feature owes later features

1. **Feature 11 (Profiles):** replace the link-based child picker on
   `/attendance/parent` with the real `ChildSwitcher`. The page already loads
   `getChildrenOfParent()` and honours `?student=<id>` â€” the switcher only
   needs to drive that same param. Handoff details in `01-1-files-explained.md`.
2. **Staff tab for the admin page** â€” specced in `01-1-files-explained.md`;
   blocked until some feature records staff attendance for "today".
3. **Feature 02 (Bus) / others:** to send attendance-style alerts from your own
   feature, call `createNotification()` with your own `source` â€” do NOT copy
   `lib/attendance.js`; write your own tiny helper if you need one.
