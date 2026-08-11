<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# School App — read this before you touch anything

A school management web app (Next.js 16, PostgreSQL, plain JavaScript). One school,
16 classes, 400 students, 423 accounts. Built one feature at a time by AI, so the
documentation is the memory. Trust it over your instincts.

**This file does not contain the project rules. It tells you where they are, and it
lists the mistakes that have already cost this project hours.**

## 1. Read these before writing code, in this order

1. `context/ai-workflow-rules.md` — the 16 iron rules and the session-start ritual. **Mandatory.**
2. `context/00-MASTER-REFERENCE.md` — what already exists, so you do not rebuild it.
3. `context/00-PROJECT-STRUCTURE.md` — the file manifest and the build order.
4. `context/features/<NN-name>/` — the feature you were asked to build.
5. `context/features/13-auth/` — additionally, if the task touches login, sessions, passwords or OTP.

The iron rules exist in exactly one place: `context/ai-workflow-rules.md`. If you find a
second copy of a rule list anywhere, the copy is stale and the canonical file wins.
Do not paste rules into a new file. Point at them.

## 2. Traps — every one of these has already broken this build

1. **The middleware file is `proxy.js` at the project root**, exporting `proxy(request)`.
   A file named `middleware.js` is silently ignored on Next 16. No error, no warning —
   every page just stops being protected.
2. **There is no `tailwind.config.js` and there must never be one.** This is Tailwind v4.
   Configuration lives in the `@theme inline` block inside `app/globals.css`.
3. **After adding a new folder under `app/`, delete `.next` and restart the dev server.**
   Turbopack caches its route table and serves 404 for a brand-new route otherwise.
   Not needed when you only edit an existing file, or touch only the database or docs.
4. **`params` arrives as a Promise in route handlers.** Always `await params`.
5. **Output complete files, never fragments.** A partial edit that silently missed once
   produced `Export listForProfile doesn't exist` and broke every route in the app.
6. **`db/schema.sql` and `db/seed.sql` are frozen.** Any structural or data change ships
   as a new numbered file in `db/migrations/`, written to be safe to run twice.
7. **All SQL lives in `lib/repos/*.js`, parameterised.** Never write SQL in a route,
   a page or a component. One historical exception is documented in section 4.
8. **Never write a documentation path into a code file** (iron rule 16). Describe the doc
   instead. Docs move; code must not carry stale directions.
9. **Never run `npm audit fix --force`.** The advisories here are known and accepted.
10. **A `"use client"` component must never import anything that reaches `lib/db.js`.**
    Share constants through a plain constants module instead.
11. **`lib/auth.js` must stay Edge-safe.** `proxy.js` imports it and the Edge runtime has
    no database. Never import `query` into it, and never check `session_epoch` there.
12. **A Server Component cannot set or delete a cookie.** Only route handlers can.

## 3. Verify you have not broken anything

- `npm run dev` starts with zero errors.
- `GET /api/health` still returns `{"ok":true,"students":400}`.
- `npm run build` completes.
- No console errors on the screens you touched.

Seed logins are listed in iron rule 12.

## 4. Two facts that live only in this file

### Database run order

A fresh database must be built in exactly this order. Reversing seed and 002 leaves
400+ accounts with a NULL `password_changed_at`, which breaks admin password rotation.

- `psql -U school_app -d school -f db/schema.sql`
- `psql -U school_app -d school -f db/seed.sql`
- `psql -U school_app -d school -f db/migrations/002_auth_columns.sql`
- `psql -U school_app -d school -f db/migrations/003_notification_kind.sql`

There is no `001` — that number is reserved for feature 14. On Windows you may need the
full path to `psql.exe` instead of the bare command.

### NextResponse or Response

A route handler that **sets or clears a cookie** must return `NextResponse`
(from `next/server`), because a plain `Response` has no cookie helper. Every other route
returns a plain `Response`.

Today the six `/api/auth/*` routes use `NextResponse`; the other nine routes use
`Response`. Both are correct. Do not "standardise" them — see iron rule 5.

### The one sanctioned SQL exception

`app/api/health/route.js` contains a direct `SELECT count(*) FROM students`. It is on the
do-not-overwrite list in iron rule 2 because its entire job is to prove the database is
reachable with the fewest moving parts. Leave it alone. It is the only permitted exception
to trap 7, and its `{ok, students}` response shape is the only permitted exception to the
standard `{ok, data}` envelope.

## 5. Where things live

- `proxy.js` — the gate every request passes through. Default-deny.
- `app/` — screens. `app/api/` — 15 route handlers.
- `components/` — React components, grouped by feature folder.
- `lib/` — the engine (db, auth, guard, audit, notify, push, mailer, sms).
- `lib/repos/` — every line of SQL in the project.
- `db/` — the frozen schema and seed, plus `db/migrations/`.
- `context/` — all documentation. Global docs at the top level, per-feature docs in
  `context/features/<NN-name>/`.
- `public/` — the PWA manifest, the service worker, the app icon. Served raw.
- `jsconfig.json` — defines the `@/` alias as the project root. Delete it and nothing builds.

## 6. When you finish a task

Status goes in `context/progress-tracker.md`. Reasoning goes in the feature's own
decisions file under `context/features/<NN-name>/`. Never mix the two — a build log
pasted into the tracker has already had to be moved out once.