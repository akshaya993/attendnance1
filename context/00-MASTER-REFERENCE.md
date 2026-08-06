# Greenwood School App — MASTER REFERENCE

**What this file is:** the inventory of everything that exists in this project
right now, what each file does, why it exists, and which file to import instead of
writing a new one.

**Last verified:** 2026-08-05 against branch `all-features-in-13-are-done-with-testing`
(commit `b228514c`) of `akshaya993/school-app-branches`. Every path below was read
from the repository, not remembered.

**How this differs from the other context files**

| File | Answers |
|---|---|
| `project-overview.md` | What are we building and for whom? |
| `architecture.md` | How are the layers arranged? |
| `code-standards.md` | How must code be written? |
| `ui-context.md` | What must it look like? |
| `ai-workflow-rules.md` | How must the AI behave? |
| `00-PROJECT-STRUCTURE.md` | **The plan** — what all 14 features will build |
| **`00-MASTER-REFERENCE.md` (this)** | **The inventory** — what exists TODAY and what to reuse |
| `progress-tracker.md` | What is done? |
| `13-*.md` | Deep dive on authentication |

---

# 1. START HERE — for a new AI chat

Read in this order, then confirm understanding before writing code:

1. `project-overview.md` — the product
2. **this file** — what already exists
3. `code-standards.md` + `ui-context.md` — how to write and style
4. `ai-workflow-rules.md` — the 12 iron rules
5. `13-0-decisions.md` — **mandatory if you touch anything auth-related**
6. The feature prompt file you were given

**Before creating ANY file, run the checklist in section 10 of this document.**
The single biggest risk in a per-feature-chat workflow is a new chat writing a
second copy of something that already works.

---

# 2. The product in one screen

A multi-branch school management app for schools in India. One school today
("Greenwood High School - Main Branch", MG Road, Hyderabad, Telangana 500081),
built multi-branch from day one because `branch_id` is on every table.

- **Four roles:** `admin`, `teacher`, `parent`, `bus`. There is no "student login" —
  parents act for students.
- **Login identity is a 10-digit phone number**, not an email.
- **Current scale (seed data):** 1 branch · 1 admin · 20 teachers · 400 parents ·
  2 bus accounts · 400 students · 16 classes · 6 subjects · academic year `2026-27`.
- **Money is INR**, formatted `Rs 12,500.00`. **Dates are IST**, formatted
  `26 Jul 2026`.
- **Hard constraints:** 100% open-source, self-hosted on our own VPS with our own
  PostgreSQL. **No** Prisma, Supabase, Firebase, Clerk, next-auth or Auth0. No
  paid SaaS. JavaScript only, never TypeScript. India-only for v1.

The reasons behind those constraints: predictable cost for a school budget, no
vendor able to raise prices on data we own, and a codebase a small team can read.

---

# 3. The stack

| Layer | Choice | Version | Why this and not the alternative |
|---|---|---|---|
| Framework | **Next.js App Router** | `16.2.12` | One project serves pages and APIs. Server components mean less JavaScript shipped to cheap Android phones. |
| Language | **JavaScript** | ES modules | A deliberate call: a beginner-friendly codebase. No build-time type layer. |
| UI library | **React** | `19.2.4` | Comes with Next. |
| Styling | **Tailwind CSS v4** | `^4` | v4 is **CSS-first**: there is **no `tailwind.config.js`** and you must not create one. Tokens live in `app/globals.css` under `@theme`. |
| Database | **PostgreSQL** | 16 | Real relational integrity, JSONB where needed, free. |
| DB driver | **`pg`** (raw SQL) | `^8.22.0` | No ORM. SQL is visible, tunable, and nothing hides an N+1 query. |
| Password hashing | **`bcryptjs`** | `^3.0.3` | Pure JS. Native `bcrypt` needs a C++ compiler and breaks on Windows and on Node upgrades. **Never install `bcrypt`.** "bcrypt.js" with a dot is not a real package. |
| Tokens | **`jose`** | `^6.2.4` | Signs/verifies JWTs and, crucially, **works in the Edge runtime** where `proxy.js` lives. |
| Email | **`nodemailer`** | latest | MIT-licensed, free, works with any SMTP. Used for OTP delivery. |
| Linting | **ESLint** + `eslint-config-next` | `^9` / `16.2.12` | |
| Dev/build | **Turbopack** (Next default) | — | Fast, but caches its route table — see section 9. |

**Node v22.20.0. PostgreSQL at `C:\Program Files\PostgreSQL\16\bin\psql.exe`.
Project root `C:\projects\school-app`. New PowerShell windows open in
`C:\Users\<you>` — always `cd C:\projects\school-app` first.**

Adding any new npm package requires asking first. Current runtime dependencies are
exactly: `bcryptjs`, `jose`, `next`, `nodemailer`, `pg`, `react`, `react-dom`.

⚠️ `npm audit` reports **4 high-severity advisories** in transitive dev
dependencies. **Do not run `npm audit fix --force`** — it would upgrade Next.js
itself and break the build. Revisit before production.

---

# 4. The complete file tree (verified)
C:projectsschool-app\
│
├── proxy.js                       [13]  THE SECURITY GATE. Next 16 convention.
│                                       NOT middleware.js - that name is IGNORED.
├── package.json                   [-]  dependencies + npm scripts
├── package-lock.json              [-]  exact dependency versions (commit this)
├── next.config.mjs                [-]  Next.js config (near-empty, fine)
├── postcss.config.mjs             [-]  loads @tailwindcss/postcss
├── eslint.config.mjs              [-]  lint rules
├── jsconfig.json                  [-]  makes "@/lib/db" mean "<root>/lib/db"
├── .gitignore                     [-]  ignores .env*, node_modules, .next,
│                                       otp-helpers.ps1
├── .env.local                     [you] SECRETS. NEVER committed, never edited by AI.
├── AGENTS.md                      [-]  warns AI that Next 16 differs from training data
├── CLAUDE.md                      [-]  pointer to AGENTS.md
├── README.md                      [-]  human on-ramp
│
├── .vscode/
│   └── settings.json              [13] stops the CSS linter erroring on Tailwind v4 @theme
│
├── app/                                EVERYTHING URL-ADDRESSABLE
│   ├── layout.js                  [13]  wraps every page; theme pre-paint script
│   ├── globals.css                [13]  the ENTIRE design system (tokens + classes)
│   ├── page.js                    [13]  "/" home + epoch check + password-change gate
│   ├── favicon.ico                [-]
│   │
│   ├── login/page.js              [13]  "/login"
│   ├── forgot-password/page.js    [13]  "/forgot-password" - 3 steps in one route
│   ├── first-login/page.js        [13]  "/first-login" - forced password change
│   │
│   └── api/                            HTTP ENDPOINTS (backend)
│       ├── health/route.js        [01]  public health check
│       ├── branches/route.js      [01]  branch list (now needs a session)
│       ├── classes/route.js       [01]  class list (now needs a session)
│       └── auth/                  [13]
│           ├── login/route.js           POST - password login, lockout, audit
│           ├── logout/route.js          POST - clears this device's cookie
│           ├── otp/send/route.js        POST - quota + cooldown + email/SMS
│           ├── otp/verify/route.js      POST - checks code, issues reset ticket
│           ├── reset-password/route.js  POST - forgot-password finish
│           └── change-password/route.js  POST - signed-in change (private)
│
├── components/                         REUSABLE UI. No SQL, ever.
│   ├── ThemeToggle.js             [13]  light/dark switch
│   └── auth/
│       ├── LoginForm.js           [13]  phone + password form
│       ├── PasswordField.js       [13]  label + input + show/hide  ← REUSE
│       ├── OtpInput.js            [13]  6 boxes, auto-advance, paste ← REUSE
│       └── LogoutButton.js        [13]  sign-out button            ← REUSE
│
├── lib/                                SHARED BRAIN. Imported everywhere.
│   ├── db.js                      [01]  THE ONLY FILE THAT IMPORTS pg. FROZEN.
│   ├── auth.js                    [01→13]  sessions, cookies, JWT, password policy
│   ├── audit.js                   [13]  THE ONLY WRITER of audit_logs
│   ├── mailer.js                  [13]  sendMail() - nodemailer wrapper
│   ├── sms.js                     [13]  sendSms() - console | msg91 (stub)
│   └── repos/                          THE ONLY FILES ALLOWED TO CONTAIN SQL
│       ├── coreRepo.js            [01]  branches, classes, health counts
│       └── authRepo.js            [13]  profiles + otp_codes queries
│
├── db/
│   ├── schema.sql                 [you] 43 tables, 25 indexes. FROZEN - never edit.
│   ├── seed.sql                   [you] test data. FROZEN - never edit.
│   ├── Data.txt                   [you] notes about the seed data
│   └── migrations/
│       └── 002_auth_columns.sql   [13] APPLIED. session_epoch, password_changed_at.
│                                       (001_v1_1.sql is reserved for feature 14)
│
├── context/                            DOCUMENTATION. AI reads this folder first.
│   ├── project-overview.md
│   ├── architecture.md
│   ├── code-standards.md
│   ├── ui-context.md
│   ├── ai-workflow-rules.md
│   ├── progress-tracker.md
│   ├── 00-PROJECT-STRUCTURE.md         the 14-feature plan
│   ├── 00-MASTER-REFERENCE.md          THIS FILE - what exists today
│   ├── 01-0-explanation.md             feature 01 walkthrough
│   ├── 13-0-decisions.md               auth decisions - LOCKED
│   ├── 13-1-otp-and-auth-spec.md       OTP internals, SMS providers, DLT costs
│   └── 13-2-feature-13-reference.md    the full auth deep dive
│
└── public/                             served as-is at "/"
└── file.svg globe.svg next.svg vercel.svg window.svg
[-]  leftover create-next-app art, unused.
Safe to delete whenever.



Not in git, but on your machine: `node_modules/`, `.next/` (build cache),
`.env.local`, `otp-helpers.ps1` (PowerShell test helpers).

---

# 5. Every file — what it does and why

## 5.1 Root configuration

| File | What it does | Why it matters |
|---|---|---|
| **`proxy.js`** | Runs before every request. Blocks anonymous users, enforces role prefixes. | **The single most important file for security.** Next.js 16 renamed this convention from `middleware.js`; a file with the old name is silently ignored — no error, just an unprotected app. We hit that bug. Never rename it back. Default-deny: anything not explicitly public needs a session. |
| `jsconfig.json` | Maps `@/*` to the project root. | Why every import reads `@/lib/db` instead of `../../../lib/db`. Always use the `@/` form. |
| `postcss.config.mjs` | Loads `@tailwindcss/postcss`. | This is all the Tailwind v4 setup there is. **Never create `tailwind.config.js`.** |
| `next.config.mjs` | Next.js options. | Nearly empty on purpose. |
| `eslint.config.mjs` | Lint rules. | `npx eslint <file>` printing nothing means clean. |
| `.gitignore` | Keeps secrets and junk out of git. | Verified: `.env*` is ignored, so `.env.local` cannot be pushed by accident. |
| `.env.local` | Secrets, **your file only**. | AI never reads or writes it. **Restart `npm run dev` after every edit** — env vars are read once at boot. |
| `AGENTS.md` / `CLAUDE.md` | Tell AI tools that this Next.js differs from their training data. | The reason we now verify framework conventions in `node_modules/next/dist/docs/` before writing convention files. |

`.env.local` keys currently in use:


DATABASE_URL=postgres://school_app:<password>@localhost:5432/school
JWT_SECRET=<64 random hex characters>
SMS_PROVIDER=console
SMS_API_KEY=            SMS_SENDER_ID=            SMS_DLT_TEMPLATE_ID=
MAIL_PROVIDER=gmail     # console = print to terminal instead of sending
MAIL_USER=<gmail address>
MAIL_PASS=<16-char Google App Password, no spaces>
MAIL_FROM=Greenwood School <the same gmail address>


Future features will add `AI_*` and `VAPID_*` keys.

## 5.2 `lib/` — the shared brain

**Rule of thumb: if two features would both need it, it belongs in `lib/`.**

### `lib/db.js` 🔒 FROZEN — never modify, never recreate
The only file in the entire project that imports `pg`. Owns one connection pool
(`max: 15`), cached on `globalThis.__schoolAppPool` so hot-reload doesn't leak a
new pool on every save.

Exports `query(text, params)` for one-off statements and
`withTransaction(callback)` for multi-statement work that must succeed or fail as
a unit (Feature 04's fee payments, Feature 14's promotions).

*Why one pool:* PostgreSQL charges real memory per connection. Fifteen shared
connections serve hundreds of users; fifteen files each opening their own pool
would exhaust the server.

### `lib/auth.js` 🧠 EXTEND, never rewrite
Everything about identity that isn't SQL: signing and verifying session tokens,
cookie settings, session lengths, the password policy, and the reset ticket.
Created as a stub by Feature 01-P0 and **appended to** by Feature 13.

**It imports only `jose`, and it must stay that way.** `proxy.js` runs on the Edge
runtime, which cannot load `pg`. The moment this file imports the database, the
security gate stops working.

Most-used exports: `getSession(request)`, `requireRole(user, roles)`,
`createSessionToken(...)`, `sessionCookieOptions(role)`, `COOKIE_NAME`,
`validatePassword(password, { phoneNumber })`, `isPasswordExpired(role, changedAt)`.
Full list in `13-2-feature-13-reference.md`.

### `lib/repos/*.js` 🗄️ THE ONLY PLACE SQL MAY LIVE
One file per subject area. All queries parameterized (`$1, $2`) — this is the
project's SQL-injection defence, and it is absolute. Repos also alias snake_case
columns to camelCase (`full_name AS "fullName"`) so JavaScript never deals with
database naming.

- **`coreRepo.js`** [01] — branches, classes, counts.
- **`authRepo.js`** [13] — every `profiles` and `otp_codes` query: login lookups,
  failed-attempt counting, lockouts, `session_epoch`, password writes, OTP create/
  find/consume, the yearly quota and the 45-second cooldown.

Future features add `feeRepo.js`, `marksRepo.js`, `attendanceRepo.js` and so on —
**new files, never a rewrite of an existing repo.** Need one extra query about
profiles? Add a function to `authRepo.js`.

⚠️ `pg` returns `BIGINT` as a **JavaScript string**. `profile.id` is `"1266"`.
Wrap with `Number()` before sending to a client. This regression already bit us once.

### `lib/audit.js` 🗄️ the only writer of `audit_logs`
`logAudit(entry, client = null)`. The optional second argument is a transaction
client, so an audit row can be written inside the same transaction as the action it
records — Feature 04 needs exactly that.

`AUDIT_ACTIONS` is a **closed list** of legal action strings:
`fee.payment`, `marks.save`, `marks.override`, `attendance.override`, `post.delete`,
`profile.change_review`, `admission.approve`, `auth.admin_login`, `auth.lockout`,
`promotion.run`, `promotion.school_run`, `student.move`.

*Ownership note:* the original plan created this file in Feature 14. Feature 13
needed it on day one for login auditing, so it was **built early**. Features 01,
04, 07, 08, 11, 12 and 14 must **import** it. **Do not recreate it. Do not invent a
new action string** — add one to the list deliberately, or use an existing one.

### `lib/mailer.js` and `lib/sms.js` 🧠 delivery
Deliberately mirror-images of each other, so swapping channels is trivial.

- `sendMail({to, subject, text, html})` → `{delivered, provider, messageId}`
- `sendSms({to, message})` → `{delivered, provider}`
- **Neither ever throws.** A dead mail server must not become a 500 on a parent's
  screen; the caller decides what to do with `delivered: false`.
- `MAIL_PROVIDER` = `console` | `gmail` | `smtp`. `SMS_PROVIDER` = `console` | `msg91`.
- `console` mode prints a banner to the dev terminal instead of sending — that is
  how every OTP test in Feature 13 was run, at zero cost.
- **The `msg91` branch is a stub.** Real SMS in India requires TRAI DLT
  registration (~₹5,000 one-time) plus ₹0.15–0.25 per message. Documented in
  `13-1-otp-and-auth-spec.md`.

Feature 09 (notifications) will add `lib/notify.js` for push, and should call these
two for email/SMS rather than re-implementing delivery.

## 5.3 `app/` — pages and endpoints

**Two kinds of file live here and they behave completely differently.**

| | Server component (default) | Client component (`"use client"` at the top) |
|---|---|---|
| Runs | On the server only | In the browser |
| Can read the DB via a repo | **Yes** (reads only) | **No** — must `fetch("/api/...")` |
| Can use `useState`, `onClick`, timers | No | Yes |
| Can export `metadata` | Yes | **No** |
| Ships JavaScript to the phone | No | Yes |

**Default to server components.** Make a file a client component only when it needs
interactivity — and then keep it small, usually by extracting just the form into
`components/`. That is exactly why `app/login/page.js` (server, holds the metadata)
and `components/auth/LoginForm.js` (client, holds the interactivity) are separate
files.

**Architecture rule, stated precisely:** `app/**/page.js` contains **no SQL**.
Server components **may** import repo functions for **reads** — `app/page.js` does,
and it saves a whole HTTP round trip on a slow phone. **All writes go through
`app/api/*` routes.** Client components may only use `fetch`.

### Pages that exist

| URL | File | Type | Purpose |
|---|---|---|---|
| `/` | `app/page.js` | server | Signed-in home. Also where the `session_epoch` check and the forced-password-change gate actually fire. |
| `/login` | `app/login/page.js` | server shell + client form | Phone + password. |
| `/forgot-password` | `app/forgot-password/page.js` | client | Phone → code → new password, all in one route because each step depends on a short-lived cookie from the last. |
| `/first-login` | `app/first-login/page.js` | client | Forced change for temporary passwords and expired admin passwords. |

**Not built yet:** `/admin`, `/teacher`, `/parent`, `/bus`. `proxy.js` already
guards those prefixes by role, so the day a page appears there it is protected
automatically. A signed-in admin visiting `/admin` today passes the gate and then
gets a Next.js 404 — **expected, not a bug.**

### API routes that exist

Every route returns `{ ok: true, data }` or `{ ok: false, error }` — never a bare
value, never an HTML error page.

| Route | Public? | Purpose |
|---|---|---|
| `GET /api/health` | Yes | `{"ok":true,"students":400}` — proves app + DB are alive |
| `GET /api/branches` | **No** | Branch list |
| `GET /api/classes` | **No** | Class list |
| `POST /api/auth/login` | Yes | Password login |
| `POST /api/auth/logout` | Yes | Clear this device |
| `POST /api/auth/otp/send` | Yes | Send a reset code |
| `POST /api/auth/otp/verify` | Yes | Check a code, issue the reset ticket |
| `POST /api/auth/reset-password` | Yes (ticket-guarded) | Finish a forgotten-password reset |
| `POST /api/auth/change-password` | **No** | Change while signed in |

`/api/branches` and `/api/classes` used to be open and now require a session —
a side effect of default-deny that Feature 01 needs to know about.

**Standard route shape** — copy this skeleton for every new endpoint:
export async function POST(request) {
try {
const session = await getSession(request);          // 1. who is this?
if (!session) return NextResponse.json({ ok:false, error:"Not signed in" }, { status:401 });
requireRole(session, ["admin"]);                    // 2. are they allowed?
const body = await request.json();                  // 3. validate the input
// ...
const rows = await someRepo.doTheThing(...);        // 4. repo does the SQL
await logAudit({ ... });                            // 5. audit if it changed money/marks
return NextResponse.json({ ok:true, data: rows });  // 6. house-shaped reply
} catch (err) {
console.error("[route-name]", err);
return NextResponse.json({ ok:false, error:"Something went wrong" }, { status:500 });
}
}


Status codes: `400` bad input · `401` not signed in / bad credentials ·
`403` signed in but not allowed · `404` not found · `423` locked · `500` our fault.
The `catch` logs the real error to the server and returns a safe sentence — never
leak a stack trace or a SQL message to a browser.

### `app/globals.css` and `app/layout.js`

`globals.css` **is** the design system: `@theme` colour tokens for dark and light,
plus five shared classes — `.card`, `.pill`, `.cta`, `.field`, `.label-micro`.
Never hardcode a hex value in a component; use a token.

`layout.js` wraps every page, sets the real metadata, and carries an **inline
pre-paint script** that reads `localStorage('theme')` before the first paint, so a
dark-mode user never gets flashed with a white screen. Dark is the default.

## 5.4 `components/` — reusable UI

No SQL, no secrets, no direct database access — ever.

| Component | Reuse it for |
|---|---|
| `auth/PasswordField.js` | **Every** password input, anywhere in the app. Already used on three screens. |
| `auth/OtpInput.js` | **Any** short numeric code entry. Handles auto-advance, backspace and pasting all six digits at once. |
| `auth/LogoutButton.js` | Every sign-out control, in every future layout. |
| `auth/LoginForm.js` | Specific to `/login`. Read it as the template for a form that POSTs and then navigates. |
| `ThemeToggle.js` | Drop it into any future header. |

Future features add `components/fees/`, `components/marks/` and so on — folder per
area, PascalCase filenames.

## 5.5 `db/`

| File | Rule |
|---|---|
| `schema.sql` | 43 tables, 25 indexes. **FROZEN.** Never edited by a feature. |
| `seed.sql` | Test data. **FROZEN.** |
| `Data.txt` | Notes about the seed data. |
| `migrations/NNN_name.sql` | **The only way the database ever changes.** |

Migration rules: numbered, wrapped in `BEGIN; ... COMMIT;`, written so running them
twice is harmless (`ADD COLUMN IF NOT EXISTS`), applied by you in psql, and
committed to git. `002_auth_columns.sql` is applied. `001_v1_1.sql` is reserved for
Feature 14 — Feature 13 deliberately took `002` rather than disturb it.

**No application code may ever run `CREATE`, `ALTER` or `DROP`.** If a column seems
to be missing, stop and report it.

## 5.6 `public/`

Static files served at the root URL. Currently only the five leftover
`create-next-app` SVGs, none of which the app uses any more — safe to delete.
Feature 07 will add `public/uploads/` for photos (resized to WebP with `sharp`).

---

# 6. Shared file ownership — READ BEFORE CREATING ANYTHING

The anti-duplication table. "Owner" is the feature that created it; everyone else
**imports**.

| File | Owner | Used by | Rule |
|---|---|---|---|
| `lib/db.js` | 01-P0 | everything | Frozen. Import `query` / `withTransaction`. |
| `lib/auth.js` | 01-P0, extended by 13 | everything protected | Extend by appending. Never import `pg` into it. |
| `lib/audit.js` | **13** (planned for 14) | 01, 04, 07, 08, 11, 12, 13, 14 | Import. Never recreate. Never invent an action. |
| `lib/mailer.js` | 13 | 13, 09, anything emailing | Import `sendMail`. |
| `lib/sms.js` | 13 | 13, 09 | Import `sendSms`. |
| `lib/repos/coreRepo.js` | 01 | 01+ | Add functions; don't fork. |
| `lib/repos/authRepo.js` | 13 | 13, any feature reading profiles | Add functions; don't fork. |
| `proxy.js` | 13 | whole app | **Add rules to it. Never create a second gate file.** |
| `app/layout.js` | 13 | whole app | Shared shell. Coordinate before changing. |
| `app/globals.css` | 13 | whole app | Add tokens/classes; never delete existing ones. |
| `app/page.js` | 13 | whole app | Contains the epoch and password-change gates. Preserve them. |
| `components/auth/*` | 13 | any feature with auth UI | Import. |
| `db/schema.sql`, `db/seed.sql` | you | — | Frozen. Migrations only. |
| `.env.local` | you | — | AI never touches it. |
| `app/api/health/route.js` | 01 | monitoring | Leave it alone. |

---

# 7. Where does new code go?

| I need to… | Put it here | Do NOT |
|---|---|---|
| Add a screen | `app/<name>/page.js` (server) | put SQL in it |
| Make that screen interactive | a client component in `components/<area>/` | make the whole page `"use client"` |
| Save or change data | `app/api/<area>/route.js` | write from a page |
| Write a SQL query | a function in `lib/repos/<area>Repo.js` | write SQL in a route or page |
| Share logic between features | a new `lib/<thing>.js` | copy-paste it twice |
| Protect a new URL | a rule in `proxy.js` | invent a second gate |
| Record something important | `logAudit()` | insert into `audit_logs` yourself |
| Add a column | `db/migrations/003_*.sql` | edit `schema.sql` |
| Add a colour or a card style | a token/class in `app/globals.css` | hardcode a hex value |
| Send an email or SMS | `sendMail()` / `sendSms()` | import `nodemailer` again |
| Record a decision | `context/<feature>-0-decisions.md` | leave it only in a chat |

**Splitting rule:** past roughly 200 lines, split the file.

---

# 8. The database

**43 tables, 25 indexes, one schema file.** Conventions across every table:

- Primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Money: `NUMERIC(10,2)` — never `float`, which loses paise
- Moments in time: `TIMESTAMPTZ` · calendar days: `DATE`
- Flexible payloads: `JSONB` (e.g. `audit_logs.details`)
- Nearly every table carries `branch_id` — multi-branch from day one
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` almost everywhere

Grouped by area:

| Area | Tables |
|---|---|
| Core | `branches`, `profiles`, `subjects`, `classes`, `students`, `student_enrollments`, `teacher_class_assignments`, `staff_details`, `school_calendar` |
| Auth | `otp_codes` *(owned by Feature 13)* |
| Attendance | `student_attendance`, `attendance_submissions`, `staff_attendance`, `leave_requests` |
| Exams & marks | `exams`, `exam_subjects`, `marks` |
| Fees | `fees`, `receipts`, `fee_installments` |
| Transport | `buses`, `bus_assignments`, `bus_alarms`, `device_tokens` |
| Communication | `groups`, `group_members`, `messages`, `message_reactions`, `complaints`, `notifications`, `notification_recipients` |
| Feedback | `feedback_templates`, `feedback_campaigns`, `feedback_responses` |
| Posts | `post_folders`, `posts`, `post_reactions` |
| Admissions | `admissions`, `profile_change_requests` |
| Timetable | `timetable_templates`, `timetables`, `timetable_slots` |
| Audit | `audit_logs` |

**The two tables you will touch constantly:**

`profiles` — every human who can log in.
`id, branch_id, role (CHECK admin|teacher|parent|bus), full_name,
phone_number UNIQUE, email, address, photo_url, password_hash,
must_change_password, last_login_at, failed_login_attempts, locked_until,
created_at` **+ `session_epoch` and `password_changed_at` from migration 002.**

`audit_logs` — the tamper-evident trail.
`id, branch_id NOT NULL, actor_id, action, entity_type, entity_id,
details JSONB DEFAULT '{}', created_at`.

**Indexes that already exist and matter:** `profiles.phone_number UNIQUE` (every
login rides it), `idx_profiles_branch_role`, `idx_otp_phone(phone_number,
created_at DESC)` (all four OTP queries ride this one), `idx_audit_branch_time`,
`idx_audit_entity`. Don't add an index for a column nobody searches on — it costs
write speed and buys nothing.

---

# 9. Running it locally
cd C:projectsschool-app
npm install
npm run dev                    # http://localhost:3000


Check it's alive: open `http://localhost:3000/api/health` → `{"ok":true,"students":400}`

Database, without retyping the password every time (session-only, never saved):


$env:PGPASSWORD = "<your db password>"
$psql = "C:Program FilesPostgreSQL16binpsql.exe"
& $psql -U school_app -d school -c "SELECT count(*) FROM students;"



Test logins — all seed accounts use `Pass@123`:
admin `9000000001` · teachers `9000000101`–`9000000120` ·
parents `9810000001`–`9810000400` · bus `9000000021`, `9000000022`.
Only staff rows have emails, on the **undeliverable** `@greenwood.test` domain;
admin was pointed at a real inbox for OTP testing. Parents have no email, so their
codes appear in the SMS box in the dev terminal.

### Gotchas that will waste your afternoon

1. **New `app/api/<folder>` returns 404 even though the file is right.** Turbopack
   caches its route table. Fix: stop the server, `Remove-Item -Recurse -Force .next`,
   `npm run dev`. Editing an existing file needs none of this.
2. **`.env.local` changes do nothing.** Env vars are read at boot — restart the
   dev server.
3. **PowerShell helper functions vanish.** Functions and `$global:` variables live
   only in the terminal that loaded them. Re-load with `. .\otp-helpers.ps1`
   (dot, space, path) in a **second** terminal — never the one running `npm run dev`.
4. **A new terminal opens in `C:\Users\<you>`,** not the project. `cd` first.
5. **`git` output opens a pager and seems frozen.** Already fixed globally with
   `git config --global core.pager cat`; press `q` if you meet it elsewhere.
6. **VS Code flags `@theme` in `globals.css` as an unknown at-rule.** That's the
   built-in CSS linter not knowing Tailwind v4. Silenced by `.vscode/settings.json`.
   Not a real error.
7. **Never paste the ```` ```powershell ```` fence line into a terminal** — it's
   formatting, not a command.

### Git

Two remotes: `origin` → `school-app` (stable, tested features only) and
`branches` → `school-app-branches` (work in progress). Feature 13 lives on
`all-features-in-13-are-done-with-testing`.

**Never run `git checkout <branch>` without asking** — it rewrites your working
files and has already caused one file-loss scare. `git checkout -b <new-branch>`
from where you are is safe. Branch names cannot contain spaces.

---

# 10. Anti-duplication checklist — run this before creating any file

Ask, in order:

1. **Does `lib/` already do this?** → `db.js` (SQL execution), `auth.js` (identity),
   `audit.js` (audit trail), `mailer.js` (email), `sms.js` (SMS).
2. **Does a repo already query this table?** → `authRepo.js` for `profiles` and
   `otp_codes`, `coreRepo.js` for branches/classes. **Add a function; don't fork
   the file.**
3. **Does `components/auth/` already have this widget?** → password input, OTP
   input, logout button.
4. **Does `globals.css` already have this style?** → `.card`, `.pill`, `.cta`,
   `.field`, `.label-micro`, plus all colour tokens.
5. **Am I about to write a second security gate?** → don't; add a rule to `proxy.js`.
6. **Am I about to write SQL outside `lib/repos/`?** → don't.
7. **Am I about to `ALTER TABLE` from code?** → don't; write a migration and stop
   for approval.
8. **Am I about to install a package?** → ask first.
9. **Am I about to create `middleware.js`?** → the file is `proxy.js` on Next 16.
10. **Am I about to create `tailwind.config.js`?** → v4 doesn't use one.

---

# 11. The 12 iron rules (from `ai-workflow-rules.md`)

1. No `CREATE`/`ALTER`/`DROP` in application code — stop and ask.
2. Never overwrite `.env.local`, `db/schema.sql`, `db/seed.sql`, or
   `app/api/health/route.js`.
3. Never recreate a shared file — import it.
4. No new npm packages without asking.
5. No refactoring outside the current scope.
6. Use exact table and column names from the schema.
7. One prompt at a time.
8. Parameterized SQL only, and only inside `lib/repos/`.
9. Route order: session → role → validate → repo → `{ok, data|error}`.
10. Ambiguity → ask, never guess.
11. Every delivery lists files changed, test steps, and a tracker block.
12. Never claim something works without giving the steps to verify it.

**Conflict priority:** the feature file's DB CONTRACT > the context files > the
current prompt > the AI's own ideas.

Three rules added by experience during Feature 13:

13. Next.js 16 changed **file conventions**. Verify against
    `node_modules/next/dist/docs/` before writing any convention file.
14. If an edit needs more than two find-and-replace operations in one file, output
    the **complete file** instead. Silent partial edits caused a 500 that cost an
    hour.
15. After any git recovery, **re-verify fixes made before it** — a recovery can
    quietly revert them. This happened once.

---

# 12. Feature status

| # | Feature | Status |
|---|---|---|
| 01-P0 | Skeleton: `lib/db.js`, auth stub, `coreRepo.js`, `/api/health`, `/api/branches`, `/api/classes` | **DONE** |
| **13** | **Auth, sessions, OTP, `proxy.js`, real `lib/auth.js`** | **DONE — fully tested 2026-08-05** |
| 09 | Notifications (`lib/notify.js`, push) | Next up |
| 01 (rest) | Core: students, classes, profiles | Planned |
| 04 | Fees — first feature to call `logAudit` | Planned |
| 05, 07, 10, 02, 03, 06, 08, 12, 14, 11 | See `00-PROJECT-STRUCTURE.md` for the per-feature file manifests | Planned |

Build order: `01 P0 → 13 → 09 → 01 rest → 04 → 05 → 07 → 10 → 02 → 03 → 06 → 08 →
12 → 14 → 11 → deploy`.

**What Feature 13 delivered:** password login with 5-strike lockout and admin
audit rows · 100-day sliding sessions (30 for admins) in an httpOnly cookie ·
`session_epoch` as an instant log-out-everywhere switch · `proxy.js` default-deny
with role-prefix gates · email-first OTP password reset with a 30-per-year quota
and a 45-second resend cooldown · forced first-login password change · 30-day
admin password rotation · the Veritas Editorial app shell with light/dark themes.

**Known gaps at the end of Feature 13:** no role dashboards yet · no session-aware
navigation in the layout · real SMS blocked on TRAI DLT registration · Gmail App
Password is fine for development but not production · no CAPTCHA or IP throttling ·
4 unresolved npm advisories.

---

# 13. Quick reference card
Framework   Next.js 16.2.12 App Router, JavaScript, React 19.2.4
Database    PostgreSQL 16, raw pg, no ORM
Styling     Tailwind v4, CSS-first, NO tailwind.config.js
Security    proxy.js (NOT middleware.js), jose JWT, bcryptjs, session_epoch
Import path @/  ->  project root
API shape   { ok: true, data }  |  { ok: false, error }
SQL lives   ONLY in lib/repos/*.js, always parameterized
DB changes  ONLY in db/migrations/NNN_*.sql
Health      GET /api/health -> {"ok":true,"students":400}
Roles       admin | teacher | parent | bus
Login       10-digit phone number + password
Test creds  Pass@123

