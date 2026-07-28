# CODE STANDARDS
## School App - How Code Must Be Written

> CONTEXT FILE 3 of 6.

## Language & style

- JavaScript ONLY. No TypeScript files, no .ts/.tsx, no JSDoc type gymnastics.
- Modern syntax: async/await, const/let, template literals, optional chaining.
- Small files, one responsibility each. If a file passes ~200 lines, split it.
- Naming: camelCase for variables/functions, PascalCase for components,
  kebab-case for route folders (they become URLs).
- No new npm packages without explicit approval. Current allowed list:
  next, react, react-dom, tailwindcss, pg, bcryptjs, jose, pdfkit, sharp,
  web-push, @dnd-kit/*.

## Database rules (the most important section)

1. SQL exists ONLY inside lib/repos/*.js. Pages, components, API routes and
   workers NEVER contain SQL strings.
2. Every query is parameterized: query('... WHERE id = $1', [id]).
   String interpolation of user input into SQL is FORBIDDEN.
3. Use exact table/column names from db/schema.sql (the DB CONTRACT in each
   feature file repeats them). Never invent, rename, or guess columns.
4. NEVER run CREATE/ALTER/DROP. The schema is final. Schema changes happen only
   as human-approved numbered files in db/migrations/.
5. Multi-step writes use withTransaction from lib/db.js - especially anything
   touching money (fees + receipts + balance in one transaction) and promotions.
6. Money is NUMERIC: treat as strings/decimal in JS, never float arithmetic.
   Display with 2 decimals.
7. Sensitive mutations call logAudit(client, {...}) from lib/audit.js INSIDE the
   same transaction. Actions: 'fee.payment', 'marks.save', 'marks.override',
   'attendance.override', 'post.delete', 'profile.change_review',
   'admission.approve', 'auth.admin_login', 'auth.lockout', 'promotion.run',
   'promotion.school_run', 'student.move'.

## API route rules

- One route.js per action folder under app/api/. Export named HTTP methods
  (GET/POST/PATCH/DELETE).
- EVERY protected route starts with a session + role check via lib/auth.js.
  Trust NOTHING from the client: never accept branch_id/role/profile_id from the
  request body - derive them from the session.
- Always scope queries by the session user's branch_id (multi-branch safety).
- Validate all inputs server-side (required fields, types, ranges) before any DB
  call. Reject with 400 + a clear message.
- Response shape, always JSON:
  - success: { ok: true, data: ... }
  - failure: { ok: false, error: 'human-readable message' } with correct status
    (400 invalid input, 401 not logged in, 403 wrong role, 404 missing, 500 server).
- Wrap handlers in try/catch. Log the real error server-side (console.error);
  return a SAFE generic message to the client - never raw SQL errors or stack traces.

## Auth & security rules

- Passwords and OTP codes: bcryptjs hashes only. Plaintext is never stored or logged.
- JWT via jose, stored in an httpOnly, sameSite=lax cookie - NEVER in localStorage.
- Parents can only ever see THEIR OWN children's data (enforce via parent_profile_id
  from session). Teachers cannot see fees. Role rules from feature 11's privacy
  matrix win over convenience.
- Uploads: validate mime type + size server-side; process through sharp to WebP;
  store under public/uploads/; save the PATH in the DB, never bytes.

## Component/page rules

- Server components by default; add 'use client' only when interactivity demands it.
- Fetch data on the server where possible (less JS to cheap phones).
- Reusable widgets live in components/<feature>/; pages compose them.
- Every list screen needs: loading state, empty state ('No records yet'), and
  error state. No blank screens.

## Verification habit

After every generated change: npm run dev must start clean, and
GET /api/health must still return {"ok":true,"students":400}.
