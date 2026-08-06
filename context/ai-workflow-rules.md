# AI WORKFLOW RULES
## School App - Rules Every AI Coding Session Must Follow

> These rules OVERRIDE anything the AI 'thinks' it knows.
> Priority order when instructions conflict:
> 1) The feature file's DB CONTRACT  2) The context/ docs
> 3) The current prompt  4) The AI's own ideas (lowest - never wins).

## Session start ritual

At the start of EVERY session, read (or re-read) in this order:

1. 00-MASTER-REFERENCE.md  <- what ALREADY EXISTS. Read this first, always.
2. project-overview.md, architecture.md, code-standards.md, ui-context.md
3. this file, progress-tracker.md
4. 00-PROJECT-STRUCTURE.md for the feature's file manifest
5. context/features/<NN-name>/ for the feature being built - every feature
   keeps its own decisions and reference docs there
6. context/features/13-auth/13-0-decisions.md if the task touches auth,
   sessions, passwords or OTP

Then read the DB CONTRACT of the feature being built. Only then write code.

## The 16 iron rules

1. DO NOT touch the database structure. No CREATE/ALTER/DROP, no 'helpful' new
   tables or columns. The 43-table schema in db/schema.sql is FINAL. If a task
   seems to need a schema change: STOP and ask the human.
2. DO NOT overwrite .env.local, db/schema.sql, db/seed.sql, or
   app/api/health/route.js.
3. DO NOT recreate shared files. These already exist - import them:
   lib/db.js, lib/auth.js, lib/audit.js, lib/mailer.js, lib/sms.js,
   lib/repos/authRepo.js, lib/repos/coreRepo.js, proxy.js.
   Files a LATER feature will create (lib/notify.js in 09, lib/ai.js in 03,
   lib/uploads.js in 12) do not exist yet - that is expected, not an error.
4. DO NOT add npm packages beyond the approved list (see code-standards.md)
   without asking.
5. DO NOT refactor, rename, reformat, or 'improve' files outside the current
   task's scope. Touch only what the prompt asks for.
6. Use EXACT table and column names from the DB CONTRACT. If unsure about a
   column, look it up in db/schema.sql - never guess.
7. One feature, one prompt, one step at a time - follow the feature file's prompt
   order. Never build ahead of the prompts.
8. All SQL parameterized, only inside lib/repos/. All money logic inside
   transactions with audit logging (see code-standards.md).
9. Every API route: session check -> role check -> input validation -> repo call
   -> {ok, data|error} JSON. Branch scoping from session, never from client input.
10. When something is ambiguous, ASK instead of assuming. A question costs a
    minute; a wrong assumption costs days.
11. After completing a task, output: (a) list of files created/changed,
    (b) what to manually test, (c) a progress-tracker.md update block.
12. Never claim something works without a way to verify it. Provide the exact
    URL/steps for the human to test (seed logins: admin 9000000001, teacher
    9000000101, parent 9810000001 - password Pass@123).
13. Next.js in this project is version 16. File CONVENTIONS changed: the
    middleware file is now proxy.js exporting proxy(). A middleware.js file is
    silently ignored. Verify any convention file against
    node_modules/next/dist/docs/ before writing it.
14. When an edit needs more than two separate find-and-replace operations in one
    file, output the COMPLETE file instead. Silently-failed partial edits caused a
    500 that cost an hour ("Export COOKIE_NAME doesn't exist").
15. After adding a new app/api folder, delete .next and restart. Turbopack caches
    its route table and returns 404 for brand-new routes otherwise.
16. NEVER write a documentation path into a code file - not in a comment, not in
    a log string. Docs get reorganised; code must not carry stale directions.
    Describe the doc instead ("see the OTP spec in context/"), never
    "context/features/13-auth/13-1-...md". Feature docs live in
    context/features/<NN-name>/, global docs in context/.

## Build order (do not shuffle)

01-Prompt0 (skeleton) -> 13 Auth -> 09 Notifications -> 01 Attendance ->
04 Fees -> 05 Groups -> 07 Marks -> 10 Timetable -> 02 Bus -> 03 Complaints ->
06 Leaves -> 08 Admissions -> 12 Posts -> 14 Promotions -> 11 Profiles -> deploy.

IMPORTANT: lib/audit.js ALREADY EXISTS (built during feature 13). Feature 04
must IMPORT it, and feature 14 must SKIP its Prompt 1 "create lib/audit.js"
task entirely. Recreating it would produce duplicate, diverging logic.

IMPORTANT: feature 12 (Posts) uses `sharp` for image processing. Upgrade to
next@16.3.0 BEFORE starting it - the current version pins a vulnerable sharp.

## Definition of done (per prompt)

- npm run dev starts with zero errors
- /api/health still returns {"ok":true,"students":400}
- The feature's manual test steps pass with seed data
- No console errors on the touched screens
- progress-tracker.md updated

## When errors happen

- Read the FULL error message first; fix the root cause, not the symptom.
- If a fix requires violating any iron rule: STOP and explain to the human.
- Never fix an error by deleting checks, weakening validation, or bypassing auth.