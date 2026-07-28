# AI WORKFLOW RULES
## School App - Rules Every AI Coding Session Must Follow

> CONTEXT FILE 5 of 6. These rules OVERRIDE anything the AI 'thinks' it knows.
> Priority order when instructions conflict:
> 1) The feature file's DB CONTRACT  2) These 6 context files
> 3) The current prompt  4) The AI's own ideas (lowest - never wins).

## Session start ritual

At the start of EVERY session, read (or re-read): project-overview.md,
architecture.md, code-standards.md, ui-context.md, this file, progress-tracker.md.
Then read the DB CONTRACT of the feature being built. Only then write code.

## The 12 iron rules

1. DO NOT touch the database structure. No CREATE/ALTER/DROP, no 'helpful' new
   tables or columns. The 43-table schema in db/schema.sql is FINAL. If a task
   seems to need a schema change: STOP and ask the human.
2. DO NOT overwrite .env.local, db/schema.sql, db/seed.sql, or
   app/api/health/route.js.
3. DO NOT recreate shared files (lib/db.js, lib/auth.js, lib/notify.js,
   lib/audit.js...). Import them. If one is missing, STOP and say so.
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

## Build order (do not shuffle)

01-Prompt0 (skeleton) -> 13 Auth -> 09 Notifications -> 01 Attendance ->
04 Fees (create lib/audit.js from 14-Prompt1 first) -> 05 Groups -> 07 Marks ->
10 Timetable -> 02 Bus -> 03 Complaints -> 06 Leaves -> 08 Admissions ->
12 Posts -> 14 Promotions -> 11 Profiles -> deploy.

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
