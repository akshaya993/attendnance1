# Feature 13 — Authentication: Locked Decisions

Status: DONE (all tasks tested 2026-08-04/05)
Owner feature: 13 (Login, Sessions, OTP, Password Reset)
Written: 2026-08-01
Read this before touching ANY auth code in any future chat.

---

## 0. Priority

If anything below conflicts with the feature-13 prompt file, THIS FILE WINS.
The prompt file was written before schema v1.1 and before these decisions.

---

## 1. Database — what we did and did NOT do

- db/schema.sql is FINAL and was NOT edited in feature 13.
- db/seed.sql was NOT edited.
- ONE approved migration was added: db/migrations/002_auth_columns.sql
  It adds exactly two columns to `profiles`:
    - session_epoch       SMALLINT NOT NULL DEFAULT 0
    - password_changed_at TIMESTAMPTZ
  Nothing else. No new tables. No new indexes.
- `otp_codes` and `idx_otp_phone` already existed. Feature 13 only INSERTs
  and SELECTs from them.

## 2. Password hashing — bcryptjs ONLY

- Package: `bcryptjs` (pure JavaScript). Cost factor 10.
- NEVER install or import the native `bcrypt` package. It needs C++ build
  tools on Windows and on the VPS, and breaks on every Node upgrade.
- "bcrypt.js" (with a dot) is not a real npm package. Do not type it.

### The pgcrypto question — settled, do not revisit
db/seed.sql ran `crypt('Pass@123', gen_salt('bf', 10))`. `bf` = Blowfish =
bcrypt. Those seeded hashes are standard `$2a$10$...` bcrypt hashes.
`bcryptjs.compare()` reads them correctly with zero changes.
=> No re-hash. No migration. No data change. Ever.
Postgres was only the seed-time generator. Application code never calls
`crypt()` again; all hashing goes through `bcryptjs.hash(pw, 10)`.

## 3. Sessions — 100-day sliding, with an instant kill switch

- Cookie name: `session`. httpOnly, sameSite=lax, secure in production.
- JWT via `jose`. Payload: { profileId, role, branchId, epoch }.
- Lifetime:
    - parent / teacher / bus : 100 days
    - admin                  : 30 days
  Cookie maxAge always equals JWT expiry.
- Sliding: on a normal request, if more than 10 days of the lifetime have
  been used, re-issue a fresh token. Never re-sign on every request.

### session_epoch — how "log out everywhere" works
Every token carries the user's current `session_epoch`. On password change,
password reset, or an admin forcing a logout, we run:
    UPDATE profiles SET session_epoch = session_epoch + 1 WHERE id = $1;
Every old token now carries a stale epoch and is rejected.

IMPORTANT: middleware.js runs on the Edge runtime and CANNOT use `pg`.
Middleware checks signature + expiry ONLY. The epoch comparison happens in
Node-side pages and API routes, folded into a `profiles` read they already do.

## 4. Login rules

- Login identifier is the 10-digit phone number. Password is PRIMARY.
- 5 failed attempts  -> `locked_until = now() + 15 minutes`
  (columns failed_login_attempts and locked_until already exist)
- Successful login   -> reset failed_login_attempts to 0, set last_login_at
- Admin logins and all lockouts are audited. Regular user logins are NOT
  (400 parents logging in daily would flood audit_logs for no benefit).
- Anti-enumeration: wrong phone and wrong password return the SAME message
  and the same HTTP status. Never reveal that an account exists.

## 5. Admin password rotation — 30 days

- Only role = 'admin'.
- On login, if password_changed_at IS NULL or older than 30 days, the admin
  is redirected to /first-login and cannot use the app until they set a new
  password.
- Changing the password sets password_changed_at = now() and bumps
  session_epoch.
- Non-admin roles are never forced to rotate.

## 6. OTP — one single limit


- 30 OTPs per phone number per ROLLING 365 days. That is the only QUOTA.
  No per-day, per-week or per-month buckets.
- PLUS a resend cooldown (task 9C): 45 seconds minimum between two codes for
  the same phone + purpose, enforced by otpCooldownRemaining() in
  lib/repos/authRepo.js (OTP_COOLDOWN_SECONDS = 45). A refused send returns the
  byte-identical generic 200, writes NO row, spends NO quota, and leaves the
  previous code valid. The UI shows a 60-second countdown
  (CLIENT_COOLDOWN_SECONDS in app/forgot-password/page.js) - deliberately
  LONGER than the server rule, because the server refuses silently.

- Enforced by counting rows, not by counter columns:

    SELECT count(*)::int AS used FROM otp_codes
    WHERE phone_number = $1 AND created_at > now() - interval '365 days';

  Uses the existing index idx_otp_phone (phone_number, created_at DESC).
  Rows ARE the history, so we keep full forensics for free and there is no
  cron job to reset counters and no midnight double-spend race.
- Code: 6 digits, stored ONLY as a bcryptjs hash in otp_codes.code_hash.
- Expiry: 5 minutes (expires_at column).
- Wrong guesses: 5 max per code (attempts column), then the code is dead.
- Used codes: consumed_at is stamped; a code can never be reused.
- purpose is 'reset' or 'first_login' only (CHECK constraint).

Cooldown and resend timers ARE implemented (task 9C). DLT registration and real
SMS provider setup are documented in context/13-1-otp-and-auth-spec.md and are
NOT implemented in v1.

## 7. OTP delivery channel

- EMAIL is the default channel for EVERY account and EVERY role.
- A visible "Use phone instead" switch is always shown, identical on every
  screen, for every role.
- Because the screen never changes based on who typed, it leaks nothing.
- The response text is always identical:
      "If an account exists, a code has been sent."
  regardless of whether the phone exists or has an email on file.
- Email sender: nodemailer + Gmail App Password (MAIL_PROVIDER=gmail).
- SMS sender: MUST stay MAIL/SMS_PROVIDER=console in development. Real SMS
  in India requires TRAI DLT registration and costs ~Rs 0.20 per message.
  No SMS is sent in v1.

## 8. Reset token

After a correct OTP the user is NOT logged in. They receive a separate
short-lived `jose` JWT with { purpose: 'reset', profileId }, 10-minute
expiry, in a temporary httpOnly cookie named `reset`. /api/auth/reset-password
accepts only that cookie, then deletes it. otp_codes.consumed_at is stamped
in the same transaction.

## 9. Shared files created early — DO NOT RECREATE

### lib/audit.js
OWNER on paper: Feature 14 (Promotions), Prompt 1.
BUILT EARLY in Feature 13, because auth must log 'auth.admin_login' and
'auth.lockout' on day one.
=> Progress tracker row 14-P1 is DONE.
=> Features 01, 04, 07, 08, 11, 12 and 14 must IMPORT lib/audit.js.
   They must NEVER create it again.
Signature: logAudit({ branchId, actorId, action, entityType, entityId, details })

### lib/auth.js
Existed as a partial file from 01-P0 (getSession, getSessionUser,
requireRole, AuthError). Feature 13 APPENDS to it. It was not rewritten.

### middleware.js
### proxy.js
Created by Feature 13, at the project ROOT. Next.js 16 renamed the middleware
file convention to `proxy.js` and the exported function from `middleware` to
`proxy`. A file named middleware.js is SILENTLY IGNORED on Next 16 - no error,
no warning, every route simply unprotected. Never rename it back.
All future features add route rules to this file, never replace it.

### lib/mailer.js
Created by Feature 13. Mirrors lib/sms.js. Any feature needing email
(notifications, admissions, fees) imports it.

## 10. New environment variables

Added to .env.local in feature 13:

    JWT_SECRET=<64 random hex chars>
    SMS_PROVIDER=console
    SMS_API_KEY=
    SMS_SENDER_ID=
    SMS_DLT_TEMPLATE_ID=
    MAIL_PROVIDER=gmail
    MAIL_USER=testingprototype3@gmail.com
    MAIL_PASS=<16-char Gmail App Password, no spaces>
    MAIL_FROM=Greenwood School <testingprototype3@gmail.com>

.env.local is NEVER committed and NEVER overwritten by an AI.

## 11. Packages

Approved and used by feature 13:
    bcryptjs   (already present)
    jose       (already present)
    pg         (already present)
    nodemailer (ADDED in feature 13, Task 7)

No other package may be added without asking.

## 12. UI

The app shell (app/layout.js, app/globals.css) and the light/dark
ThemeToggle were created ONCE here, in feature 13, using the Veritas
Editorial tokens from context/ui-context.md. Dark is the default.
No fonts are downloaded. No feature may hardcode a colour.