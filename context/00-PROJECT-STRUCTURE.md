# 00 — COMPLETE PROJECT STRUCTURE (per-feature manifest + merged tree)

PART 1 lists, for EACH of the 14 features, every file and folder that feature CREATES
and every shared file it only USES (must already exist — never recreate).
PART 2 is the merged final tree. PART 3 is rules + build order.

Extracted directly from the 14 master-prompt files — file names match the prompts exactly.

---

# PART 1 — FEATURE-BY-FEATURE FILE MANIFEST

## 01 — ATTENDANCE (`01-ATTENDANCE-master-prompts.md`)

**Prompt 0 creates the project skeleton (one time, before everything):**
```
db/schema.sql                                  # verbatim copy of 00-FINAL-DB-SCHEMA.md Part A
lib/db.js                                      # the ONLY file importing 'pg' (Pool max 15)
lib/auth.js                                    # placeholder — replaced by real version in file 13
lib/repos/                                     # empty folder, all SQL will live here
app/api/branches/route.js                      # tiny helper: list branches
app/api/classes/route.js                       # tiny helper: list classes of a branch
```
**Feature files created:**
```
lib/repos/attendanceRepo.js
app/api/attendance/submit/route.js             # teacher submits absent list (transaction)
app/api/attendance/modify/route.js             # admin/teacher override (+ audit)
app/api/attendance/students/route.js           # roster for a class+date
app/api/attendance/classes/route.js            # teacher's assigned classes
app/api/attendance/admin-summary/route.js      # branch-wide day summary
app/api/attendance/parent-summary/route.js     # child calendar + % (no-row=1, late=1, half_day=0.5, absent=0)
app/attendance/teacher/page.js                 # absent-only marking screen
app/attendance/parent/page.js                  # child calendar + percentage
app/attendance/admin/page.js                   # branch summary
app/attendance/admin/class/[classId]/page.js   # per-class drill-down + override
components/attendance/ClassPicker.js
components/attendance/StudentAttendanceList.js
components/attendance/AttendanceStatCard.js
```
**Uses (read-only):** `lib/db.js`, `lib/auth.js`, later `lib/audit.js` (override logging).
**DB tables owned:** student_attendance, attendance_submissions, staff_attendance.

## 02 — BUS (`02-BUS-master-prompts.md`)

**Creates:**
```
lib/repos/busRepo.js
lib/eta.js                                     # ETA math from live telemetry
app/api/bus/create/route.js                    # admin: add bus
app/api/bus/list/route.js                      # admin: fleet + assignments
app/api/bus/location/route.js                  # driver GPS ping — IN-PLACE UPDATE on buses row
app/api/bus/live/[busId]/route.js              # parent polls live position + ETA
app/api/bus/alarm/route.js                     # parent sets proximity alarm
app/bus/driver/page.js                         # start/stop trip, sends pings
app/bus/parent/page.js                         # live map + ETA + alarm toggle
app/bus/admin/page.js                          # fleet management + student assignment
components/bus/BusLiveCard.js
workers/busAlarmWorker.js                      # pm2 worker: fires proximity alarms → lib/notify.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/notify.js` (from 09).
**DB tables owned:** buses, bus_assignments, bus_alarms, device_tokens (shared with 09).

## 03 — COMPLAINTS + FEEDBACK (`03-COMPLAINTS-FEEDBACK-master-prompts.md`)

**Creates:**
```
lib/repos/complaintRepo.js
lib/repos/feedbackRepo.js
lib/ai.js                                      # AI client (AI_BASE_URL/AI_API_KEY) — also reused by 07
app/api/complaints/route.js                    # parent creates / lists own complaints
app/api/complaints/[id]/route.js               # admin updates status / responds
app/api/complaints/copilot/route.js            # AI reply suggestions for admin
app/api/feedback/templates/route.js            # admin CRUD feedback form templates
app/api/feedback/campaigns/route.js            # launch campaign to audience
app/api/feedback/respond/route.js              # parent/teacher submits response
app/api/feedback/report/[campaignId]/route.js  # aggregated results
app/complaints/parent/page.js                  # raise + track
app/complaints/admin/page.js                   # ticket queue + copilot
app/feedback/admin/page.js                     # template builder + campaigns + reports
app/feedback/parent/[campaignId]/page.js       # fill a feedback form
components/complaints/TicketQueue.js
components/feedback/FormBuilder.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/notify.js`.
**DB tables owned:** complaints, feedback_templates, feedback_campaigns, feedback_responses.

## 04 — FEES (`04-FEES-master-prompts.md`)

**Creates:**
```
lib/repos/feeRepo.js
app/api/fees/summary/route.js                  # admin dashboard stats
app/api/fees/due/route.js                      # dues by category/class
app/api/fees/search/route.js                   # find student to collect from
app/api/fees/pay/route.js                      # ONE TRANSACTION: fee update + receipt insert + audit
app/api/fees/today/route.js                    # today's collections (IST calendar day)
app/api/fees/parent-summary/route.js           # child dues + receipts
app/fees/admin/page.js                         # dashboard
app/fees/admin/due/[category]/page.js          # dues drill-down by category
app/fees/admin/due/[category]/[classId]/page.js# → then by class
app/fees/admin/pay/page.js                     # record payment + print receipt
app/fees/admin/today/page.js                   # today's collections
app/fees/parent/page.js                        # dues + receipt download
components/fees/DueTable.js
components/fees/StatCard.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/audit.js` ('fee.payment'), `lib/notify.js` (payment confirmations).
**DB tables owned:** fees, receipts, fee_installments (installment logic completed in 14).

## 05 — GROUPS / CHAT (`05-GROUPS-master-prompts.md`)

**Creates:**
```
lib/repos/groupRepo.js
app/api/groups/route.js                        # my groups + last_read_at unread math
app/api/groups/[id]/messages/route.js          # keyset-paginated messages, POST new
app/api/groups/[id]/members/route.js           # member list / admin manage
app/api/groups/[id]/react/route.js             # emoji reactions
app/api/groups/[id]/prefs/route.js             # mute / read state
app/groups/page.js                             # full chat UI (all roles)
components/groups/GroupSidebar.js
components/groups/ChatWindow.js
components/groups/MembersPanel.js
```
**Uses:** `lib/db.js`, `lib/auth.js`.
**DB tables owned:** groups, group_members, messages, message_reactions.

## 06 — LEAVES (`06-LEAVES-master-prompts.md`)

**Creates:**
```
lib/repos/leaveRepo.js
app/api/leaves/apply/route.js                  # staff applies (deduct-on-apply)
app/api/leaves/my/route.js                     # my balance + history
app/api/leaves/queue/route.js                  # admin approval queue
app/api/leaves/[id]/action/route.js            # approve / reject (refund on reject)
app/api/leaves/assign/route.js                 # admin sets yearly quotas
app/leaves/teacher/page.js                     # apply + balance
app/leaves/admin/page.js                       # queue + quota management
components/leaves/LeaveSummaryCards.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/notify.js` (approval alerts).
**DB tables owned:** leave_requests (+ writes staff_details.used_leaves).

## 07 — MARKS (`07-MARKS-master-prompts.md`)

**Creates:**
```
lib/repos/marksRepo.js
app/api/marks/context/route.js                 # exams/subjects/students for entry grid
app/api/marks/submit/route.js                  # bulk save (+ audit 'marks.save'/'marks.override')
app/api/marks/parent-summary/route.js          # child performance
app/api/marks/admin-analytics/route.js         # class/subject analytics
app/api/marks/report-pdf/route.js              # pdfkit report card
app/marks/teacher/page.js                      # entry grid
app/marks/parent/page.js                       # performance overview
app/marks/parent/exam/[examId]/page.js         # per-exam detail
app/marks/admin/page.js                        # analytics
app/marks/admin/class/[classId]/page.js        # class drill-down + override
components/marks/MarksEntryTable.js
components/marks/PerformanceCards.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/audit.js`, `lib/ai.js` (from 03, insights).
**DB tables owned:** exams, exam_subjects, marks.

## 08 — ADMISSIONS (`08-ADMISSIONS-master-prompts.md`)

**Creates:**
```
lib/repos/admissionRepo.js
app/api/admissions/route.js                    # POST new application / GET queue; approval = ONE TRANSACTION
                                               #   → profiles + students + first student_enrollments row + fees + audit
app/admissions/new/page.js                     # admission form + approval queue (admin)
components/admissions/                         # form step components as the AI splits them
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/audit.js` ('admission.approve'), `lib/notify.js`.
**DB tables owned:** admissions (writes-on-approval into profiles/students/student_enrollments/fees).

## 09 — NOTIFICATIONS (`09-NOTIFICATIONS-master-prompts.md`)

**Creates:**
```
lib/notify.js                                  # createNotification + resolveAudience — THE ONLY WRITE PATH,
                                               #   reused by 02/03/04/06/10/12/14
lib/repos/notificationRepo.js
app/api/notifications/route.js                 # my list + unread count (partial index)
app/api/notifications/read-all/route.js
app/api/notifications/broadcast/route.js       # admin broadcast (fan-out-on-write)
app/notifications/broadcast/page.js            # composer
components/notifications/BellMenu.js           # navbar bell + dropdown (mounted in layout)
components/notifications/BroadcastComposer.js
```
**Optional (only if you ask for it):** `workers/reminders.js` — generic scheduled reminders.
**Uses:** `lib/db.js`, `lib/auth.js`.
**DB tables owned:** notifications, notification_recipients, device_tokens (shared with 02).

## 10 — TIMETABLE (`10-TIMETABLE-master-prompts.md`)

**Creates:**
```
lib/repos/timetableRepo.js
app/api/timetable/templates/route.js           # period templates (times/breaks)
app/api/timetable/publish/route.js             # save draft/publish + CROSS-CLASS teacher conflict check
app/api/timetable/class/[classId]/route.js     # class timetable (parent/teacher view)
app/api/timetable/teacher/route.js             # teacher's own weekly grid
app/timetable/admin/page.js                    # drag-drop builder (@dnd-kit)
app/timetable/teacher/page.js                  # my week
app/timetable/parent/page.js                   # child's week
components/timetable/SetupStep.js
components/timetable/BuilderGrid.js
components/timetable/TimetableView.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/notify.js` (publish alerts).
**DB tables owned:** timetable_templates, timetables, timetable_slots.

## 11 — PROFILES + USER MANAGEMENT (`11-PROFILES-USER-MANAGEMENT-master-prompts.md`) — BUILD LAST

**Creates:**
```
lib/privacy.js                                 # role-based field allowlists (teachers NEVER see fees)
lib/activeChild.js                             # parent's selected-child helper
lib/repos/profileRepo.js
app/api/profile/me/route.js
app/api/profile/my-children/route.js
app/api/profile/change-request/route.js        # submit (allowlisted fields only)
app/api/profile/change-request/[id]/route.js   # admin approve/reject (+ audit)
app/api/users/search/route.js                  # admin user directory
app/api/users/[id]/route.js                    # admin view/edit user
app/profile/page.js                            # own profile + change-request + child switcher
app/users/page.js                              # admin user management
components/profile/ProfileIcon.js              # navbar avatar menu (mounted in layout)
components/profile/ChildSwitcher.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/audit.js` ('profile.change_review'), `lib/notify.js`.
**DB tables owned:** profile_change_requests (reads nearly everything else).

## 12 — POSTS (`12-POSTS-master-prompts.md`)

**Creates:**
```
lib/uploads.js                                 # sharp → WebP 1600px q80 → public/uploads/posts/<y>/<m>/
lib/repos/postRepo.js
app/api/posts/route.js                         # feed (keyset pagination) + create
app/api/posts/[id]/route.js                    # delete (hard delete + audit), reactions
app/api/posts/folders/route.js                 # admin folder CRUD
app/posts/page.js                              # feed (all roles)
app/posts/admin/page.js                        # folders + create/delete
public/uploads/posts/                          # image storage (gitignored, backed up)
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/audit.js` ('post.delete'), `lib/notify.js`.
**DB tables owned:** post_folders, posts, post_reactions.

## 13 — AUTH + OTP (`13-AUTH-OTP-master-prompts.md`) — BUILD RIGHT AFTER 01 PROMPT 0

**Creates:**
```
middleware.js                                  # JWT check on EVERY request + role route guard
lib/auth.js                                    # REAL version (replaces Prompt 0 placeholder): jose JWT,
                                               #   bcrypt, getSession, requireRole
lib/sms.js                                     # OTP SMS: console | msg91 | fast2sms via env
lib/repos/authRepo.js
app/api/auth/login/route.js                    # password login + lockout + audit 'auth.admin_login'/'auth.lockout'
app/api/auth/logout/route.js
app/api/auth/change-password/route.js
app/api/auth/reset-password/route.js
app/api/auth/otp/send/route.js
app/api/auth/otp/verify/route.js
app/login/page.js
app/forgot-password/page.js                    # OTP reset
app/first-login/page.js                        # forced password change
components/auth/                               # login form pieces as the AI splits them
```
**Also edits:** `app/page.js` (role-based redirect), `app/layout.js` (session-aware nav).
**Uses:** `lib/db.js`, `lib/audit.js`.
**DB tables owned:** otp_codes (+ auth columns on profiles).

## 14 — PROMOTIONS / YEAR-END (`14-PROMOTIONS-YEAR-END-master-prompts.md`) — AFTER 01/04/09/13

**Creates:**
```
db/migrations/001_v1_1.sql                     # ONLY allowed DDL — upgrade v1.0 DB (skip on fresh install)
lib/audit.js                                   # logAudit(client, {...}) — THE ONLY WRITE PATH for audit_logs
lib/repos/promotionRepo.js                     # preview/run per class + whole school, syncClassGroups, moveStudent
app/api/admin/promotions/preview/route.js      # single-class preview
app/api/admin/promotions/run/route.js          # single-class run
app/api/admin/promotions/school-preview/route.js  # whole-school preview + exceptions
app/api/admin/promotions/school-run/route.js   # whole-school +1 (descending class order, crash-safe resume)
app/api/admin/students/move/route.js           # demotion / mid-year move (reason required)
app/(admin)/promotions/page.js                 # wizard: Entire School tab + Single Class tab + Move modal
app/(admin)/activity/page.js                   # audit log viewer (keyset, 30/page)
workers/feeReminders.js                        # daily 8AM IST installment-due reminders → lib/notify.js
```
**Uses:** `lib/db.js`, `lib/auth.js`, `lib/notify.js`.
**DB tables owned:** student_enrollments, audit_logs, fee_installments (allowed updates: students.class_id/roll_number/is_active, group_members sync).

---

## Shared files — who CREATES vs who USES

| File | Created by | Used by |
|---|---|---|
| lib/db.js | 01 Prompt 0 | every feature |
| lib/auth.js | 01 Prompt 0 (stub) → 13 (real) | every feature |
| middleware.js | 13 | whole app |
| lib/notify.js | 09 | 02, 03, 04, 06, 08, 10, 11, 12, 14 |
| lib/audit.js | 14 | 01, 04, 07, 08, 11, 12, 13 |
| lib/ai.js | 03 | 07 |
| lib/sms.js | 13 | 13 only |
| lib/eta.js | 02 | 02 only |
| lib/uploads.js | 12 | 12 only |
| lib/privacy.js, lib/activeChild.js | 11 | 11 + any page showing other users |

⚠️ **Ordering note:** files 04/07/08/13 call `lib/audit.js`, but its creator prompt lives in file 14 Prompt 1.
When you reach the FIRST feature that needs audit logging (04-FEES), run just the `lib/audit.js` part of
file 14 Prompt 1 at that point (the audit_logs table already exists in schema.sql, so this is safe).

---

# PART 2 — MERGED FINAL TREE (everything above in one view)

```
school-app/
├── .env.local                      [you]   DATABASE_URL, JWT_SECRET, SMS_*, AI_*, VAPID_*
├── .gitignore                      [auto]  + .env.local, public/uploads
├── package.json / next.config.mjs / jsconfig.json / postcss.config.mjs / eslint.config.mjs  [auto]
│                                   NOTE: Tailwind v4 = CSS-first. There is NO tailwind.config.js.
│                                   Theme tokens live in app/globals.css via @theme. Do not create one.
├── ecosystem.config.js             [deploy] pm2: web (cluster) + busAlarmWorker + feeReminders
├── middleware.js                   [13]
├── db/
│   ├── schema.sql                  [01 P0]
│   └── migrations/001_v1_1.sql     [14]
├── lib/
│   ├── db.js [01 P0] · auth.js [13] · notify.js [09] · audit.js [14] · sms.js [13]
│   ├── ai.js [03] · eta.js [02] · uploads.js [12] · privacy.js [11] · activeChild.js [11]
│   └── repos/  attendanceRepo [01] · busRepo [02] · complaintRepo, feedbackRepo [03] · feeRepo [04]
│               groupRepo [05] · leaveRepo [06] · marksRepo [07] · admissionRepo [08]
│               notificationRepo [09] · timetableRepo [10] · profileRepo [11] · postRepo [12]
│               authRepo [13] · promotionRepo [14]
├── app/
│   ├── layout.js · globals.css · page.js
│   ├── login/ · forgot-password/ · first-login/                                  [13]
│   ├── attendance/{teacher,parent,admin,admin/class/[classId]}/page.js           [01]
│   ├── bus/{driver,parent,admin}/page.js                                         [02]
│   ├── complaints/{parent,admin}/page.js · feedback/{admin,parent/[campaignId]}/page.js [03]
│   ├── fees/{parent,admin,admin/pay,admin/today,admin/due/[category],admin/due/[category]/[classId]}/page.js [04]
│   ├── groups/page.js                                                            [05]
│   ├── leaves/{teacher,admin}/page.js                                            [06]
│   ├── marks/{teacher,parent,parent/exam/[examId],admin,admin/class/[classId]}/page.js [07]
│   ├── admissions/new/page.js                                                    [08]
│   ├── notifications/broadcast/page.js                                           [09]
│   ├── timetable/{admin,teacher,parent}/page.js                                  [10]
│   ├── profile/page.js · users/page.js                                           [11]
│   ├── posts/page.js · posts/admin/page.js                                       [12]
│   ├── (admin)/{promotions,activity}/page.js                                     [14]
│   └── api/
│       ├── branches/ · classes/                                                  [01 P0]
│       ├── attendance/{submit,modify,students,classes,admin-summary,parent-summary}/ [01]
│       ├── bus/{create,list,location,live/[busId],alarm}/                        [02]
│       ├── complaints/{,[id],copilot}/ · feedback/{templates,campaigns,respond,report/[campaignId]}/ [03]
│       ├── fees/{summary,due,search,pay,today,parent-summary}/                   [04]
│       ├── groups/{,[id]/messages,[id]/members,[id]/react,[id]/prefs}/           [05]
│       ├── leaves/{apply,my,queue,[id]/action,assign}/                           [06]
│       ├── marks/{context,submit,parent-summary,admin-analytics,report-pdf}/     [07]
│       ├── admissions/                                                           [08]
│       ├── notifications/{,read-all,broadcast}/                                  [09]
│       ├── timetable/{templates,publish,class/[classId],teacher}/                [10]
│       ├── profile/{me,my-children,change-request,change-request/[id]}/ · users/{search,[id]}/ [11]
│       ├── posts/{,[id],folders}/                                                [12]
│       ├── auth/{login,logout,change-password,reset-password,otp/send,otp/verify}/ [13]
│       └── admin/{promotions/preview,promotions/run,promotions/school-preview,promotions/school-run,students/move}/ [14]
├── components/
│   ├── attendance/ ClassPicker · StudentAttendanceList · AttendanceStatCard      [01]
│   ├── bus/ BusLiveCard                                                          [02]
│   ├── complaints/ TicketQueue · feedback/ FormBuilder                           [03]
│   ├── fees/ DueTable · StatCard                                                 [04]
│   ├── groups/ GroupSidebar · ChatWindow · MembersPanel                          [05]
│   ├── leaves/ LeaveSummaryCards                                                 [06]
│   ├── marks/ MarksEntryTable · PerformanceCards                                 [07]
│   ├── admissions/ (form steps)                                                  [08]
│   ├── notifications/ BellMenu · BroadcastComposer                               [09]
│   ├── timetable/ SetupStep · BuilderGrid · TimetableView                        [10]
│   ├── profile/ ProfileIcon · ChildSwitcher                                      [11]
│   └── auth/ (login form pieces)                                                 [13]
├── workers/
│   ├── busAlarmWorker.js                                                         [02]
│   └── feeReminders.js                                                           [14]
└── public/uploads/posts/<year>/<month>/                                          [12]
```

---

# PART 3 — STRUCTURE RULES + BUILD ORDER

1. New files go ONLY in the locations shown above. If the AI proposes a new top-level folder, refuse it.
2. ALL SQL lives in `lib/repos/*.js`. API routes call repo functions — never inline SQL.
3. `lib/db.js` = only importer of `pg`. `lib/notify.js` = only writer of notifications. `lib/audit.js` = only writer of audit_logs.
4. `app/**/page.js` = UI only. Pages call `/api/*` routes, never the database.
5. Every `app/api/**` folder contains exactly one `route.js`.
6. Workers import repos/libs directly (no HTTP) and are registered in `ecosystem.config.js`.

**Build order:** 01 Prompt 0 → 13 → 09 → 01 rest → 04 (create lib/audit.js here, see note) → 05 → 07 → 10 → 02 → 03 → 06 → 08 → 12 → 14 → 11 → deploy.
