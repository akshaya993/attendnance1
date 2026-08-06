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

## Read before writing code

Everything lives in `context/`:

| File | What it is |
|---|---|
| project-overview.md | product, roles, constraints |
| architecture.md | layers, folders, shared-file ownership |
| code-standards.md | how code must be written |
| ui-context.md | Veritas Editorial design system |
| ai-workflow-rules.md | the 12 iron rules |
| progress-tracker.md | live build status |
| 00-PROJECT-STRUCTURE.md | per-feature file manifest |
| 13-0-decisions.md | auth decisions - READ BEFORE TOUCHING AUTH |
| 13-3-file-map-and-flows.md | every auth file, how they connect |

## Status

Feature 13 (authentication) complete and tested. Next: 09 Notifications.

## Conventions that will bite you

- `proxy.js` at the root, NOT `middleware.js` (Next 16 renamed it; the old name
  is silently ignored).
- Tailwind v4 is CSS-first: there is no `tailwind.config.js`. Tokens are in
  `app/globals.css` under `@theme`.
- All SQL lives in `lib/repos/*.js`. `lib/db.js` is the only file importing `pg`.
- `bcryptjs` only, never native `bcrypt`.