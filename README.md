# Greenwood School App

Multi-branch school management app for schools in India. Next.js 16 (App Router,
JavaScript), PostgreSQL 16 with raw `pg`, Tailwind v4. Self-hosted, no paid
services.

## Run locally

    npm install
    npm run dev        # http://localhost:3000

Requires PostgreSQL 16 with the `school` database loaded from `db/schema.sql`
and `db/seed.sql`, plus a `.env.local` (never committed) containing
DATABASE_URL, JWT_SECRET, SMS_*, MAIL_*.

Health check: `GET /api/health` -> `{"ok":true,"students":400}`

Note: `db/migrations/` starts at `002`. `001_v1_1.sql` is deliberately reserved
for feature 14 (year-end promotions) and does not exist yet.

## Read before writing code

Global docs, in `context/` — these apply to every feature:

| File | What it is |
|---|---|
| 00-MASTER-REFERENCE.md | **READ FIRST** - inventory of what already exists |
| 00-PROJECT-STRUCTURE.md | per-feature file manifest (the plan) |
| project-overview.md | product, roles, constraints |
| architecture.md | layers, folders, shared-file ownership |
| code-standards.md | how code must be written |
| ui-context.md | Veritas Editorial design system |
| ai-workflow-rules.md | the 16 iron rules |
| progress-tracker.md | live build status (status only) |

Per-feature docs, in `context/features/<NN-name>/`:

| File | What it is |
|---|---|
| features/13-auth/13-0-decisions.md | auth decisions + build log - READ BEFORE TOUCHING AUTH |
| features/13-auth/13-1-otp-and-auth-spec.md | OTP, email, SMS, TRAI DLT and cost reference |
| features/13-auth/13-2-feature-13-reference.md | every auth file, how they connect |
| features/01-attendance/01-0-explanation.md | feature 01 Prompt 0 walkthrough |

## Status

Feature 13 (authentication) complete and tested. Next: 09 Notifications.

**Open risk for feature 09:** `must_change_password` is enforced in
`app/page.js`, not `proxy.js`, because the Edge runtime cannot reach
PostgreSQL. It therefore guards only `/`. Before adding any new page, extract
that check into `lib/guard.js` as `requireActiveSession()` and call it as the
first line of every server page.

## Conventions that will bite you

- `proxy.js` at the root, NOT `middleware.js` (Next 16 renamed it; the old name
  is silently ignored).
- Tailwind v4 is CSS-first: there is no `tailwind.config.js`. Tokens are in
  `app/globals.css` under `@theme`.
- All SQL lives in `lib/repos/*.js`. `lib/db.js` is the only file importing `pg`.
- `bcryptjs` only, never native `bcrypt`.
- `jose` only, never `jsonwebtoken` (it cannot run on the Edge runtime).
- `lib/audit.js` already exists. Import it. Never recreate it.
- No code file may contain a documentation path. Describe the doc instead.