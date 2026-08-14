# Feature 03 — Complaints: Locked Decisions

Status: **COMPLAINTS DONE — built and tested 2026-08-14.**
**FEEDBACK: deliberately NOT built** (owner's call) — a complete build-ready
spec lives in `03-2-feedback-future-spec.md` (same folder). Do not start it
without reading that file.

Owner feature: 03 (Complaints + Feedback). Built after 13, 09, 01, 04.
Read this before touching ANY complaint code.

---

## 1. Scope split (owner's decision)

The master file covers complaints AND feedback forms. The owner decided:
**build complaints only, now.** Feedback is fully specified but deferred.

Also in scope: the owner ordered **pdfkit installed** and the **fee-receipt
PDF retrofit** (`GET /api/fees/receipt/[receiptNumber]`) — the exact upgrade
path that feature 04's docs had pre-written for it. Done and tested.

## 2. The complaint lifecycle (owner's rules — these OVERRIDE the prompt file)

```
parent submits        -> status 'unread'  (admins alerted, bell + buzz)
admin opens ticket    -> status 'read'    (opening IS the acknowledgement)
admin sends a reply   -> status UNCHANGED ('read')   <-- reply != resolved
admin marks resolved  -> status 'resolved'  ONLY IF a reply exists
resolved              -> FINAL. No reopen in v1.
```

- **Reply does not resolve.** The office answers the parent, the conversation
  continues (usually offline/phone), and a human closes the ticket when the
  matter is actually settled.
- **Resolve without a reply is refused** (400: "Send a reply before
  resolving"). The parent's question must never be closed unanswered.
- **Re-resolve** answers 409.
- **One stored reply:** the table has a single `admin_reply` column; a new
  reply REPLACES the old one and re-stamps `replied_by`/`replied_at`. A
  threaded conversation needs a schema decision first - do not improvise one.

## 3. Notifications (owner's rules)

| Event | Who | Level | Tapping it opens |
|---|---|---|---|
| New complaint | EVERY admin of the branch | `important` (bell + phone buzz) | `/admin/complaints` |
| Admin replies | The parent who complained | `important` (bell + buzz) | `/parent/complaints` |

The bell row and the push notification both follow `linkUrl` - that behaviour
was built in feature 09 and needed no new code. Source is `'complaints'`
(already in the schema's CHECK list from migration 003), so these never appear
in the broadcast Sent list.

To reach "every admin", `lib/repos/authRepo.js` gained ONE additive function:
`listAdminIdsByBranch(branchId)` (profiles queries live in authRepo - added,
not forked).

## 4. Roles & permissions

| Action | parent | teacher | admin | bus |
|---|---|---|---|---|
| File a complaint | yes | **403** | **403** (admin inbox instead) | **403** |
| See own complaints | yes (own only) | - | - | - |
| See the branch queue | - | **403** | yes | **403** |
| read / flag / reply / resolve | **403** | **403** | yes | **403** |
| AI copilot draft | **403** | **403** | yes | **403** |

Enforced server-side on every route (`requireActiveApiSession` +
`requireRole`), never by hiding buttons.

## 5. Other locked choices

- **No anonymous complaints** (`parent_id` is NOT NULL in the schema), **no
  editing, no deleting** a complaint, **no attachments** (text only, per the
  prompt). A complaint is a permanent record.
- **Flagging** is a per-admin bookmark (`is_flagged` toggle) with a
  "flagged only" queue filter. Not shared per-user - one flag per ticket.
- **No audit_logs rows for complaints.** The table self-records
  (`replied_by`, `replied_at`); complaints are conversations, not money.
  Deliberate deviation from "audit everything" - documented here so nobody
  "fixes" it later.
- **No new audit action strings** were invented (AUDIT_ACTIONS untouched).
- **AI copilot is gracefully off** when unconfigured: `/api/complaints/copilot`
  answers **503 with a human reason** ("missing from .env.local: ...") instead
  of failing. The admin sets `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` whenever
  they want it live (Ollama at `http://localhost:11434/v1` costs nothing).
  The copilot NEVER sends - it fills the reply box; a human presses Send.
- **Role-first URLs** (`/parent/complaints`, `/admin/complaints`), per the
  convention locked in feature 01. proxy.js needed no change.
- **No schema changes. No new migrations.** The four complaints/feedback
  tables already existed.

## 6. The fees PDF retrofit (owner-ordered)

- `pdfkit ^0.19.1` installed (it was already on the approved package list).
- `app/api/fees/receipt/[receiptNumber]/route.js` streams a real
  `application/pdf` download. Access rules are copied from the receipt PAGES:
  admin of the branch, or the parent who owns the child; everyone else gets a
  plain 404 (receipt existence is never leaked).
- `components/fees/ReceiptCard.js` gained a "Download as PDF file" link next
  to Print. The print pages stay exactly as they were.
- **FONT GOTCHA:** pdfkit's built-in Helvetica cannot draw ₹. PDFs print
  "Rs 25,500.00"; screens keep "₹25,500.00". Embedding a TTF with the rupee
  glyph is the (optional) future fix.
- **BUILD GOTCHA HIT AND FIXED:** pdfkit reads its `.afm` font files from disk.
  Bundled by default, the path resolves to a phantom `C:\ROOT\...` and every
  PDF 500s. Fix (verified against Next 16's config types):
  `serverExternalPackages: ["pdfkit"]` in `next.config.mjs`. Do not remove it.

## 7. Bugs found during this build (and the lesson)

1. **pdfkit font ENOENT** → fixed with `serverExternalPackages` (above).
2. **React lint `set-state-in-effect`** in TicketQueue: calling the loading
   function synchronously inside `useEffect` is forbidden. Fixed by deferring
   with a zero-timeout. If this rule fires elsewhere, do the same.
3. **Environment surprise (not a code bug):** mid-session, port 3000 was
   serving a DIFFERENT copy of this project (the parallel Leaves agent's
   checkout). Symptom: `/api/attendance/*` 404'd while `/api/notifications`
   worked. Diagnosed from chunk paths + the listener's command line. If two
   project copies share a machine, only one can own port 3000 - coordinate.

## 8. Test evidence (live, 2026-08-14, real DB)

Logins: parent `9810000002`, admin `9000000001`, teacher `9000000101`
(`Pass@123`).

- Parent files complaint → `201`-class success, `id=4`; **admin bell 11 -> 12**,
  newest row `[important] New complaint received` linking `/admin/complaints`.
- Admin queue: the new ticket on top, unread, bold; seeded unread ticket next;
  read section below - the ordering works.
- GET ticket detail: parent name, phone, and the linked child all present.
- `read` -> 200. `flag` -> `isFlagged:true`. `flagged=1` filter shows only it.
- `resolve` with no reply -> **400** "Send a reply before resolving".
- `reply` -> 200, **status stays `read`** (the owner's rule), `notified:1`;
  parent's bell got `[important] The school replied to your complaint` ->
  `/parent/complaints`.
- `resolve` after reply -> 200 `resolved`. Second resolve -> **409**.
- Parent's list: ticket shows Resolved chip + the reply + "School
  Administrator" as replier.
- Copilot unconfigured -> **503** with the exact missing env vars named.
- Guards: parent PATCH -> 403 · teacher GET -> 403 · anonymous -> 401 ·
  unknown id -> 404 · empty subject -> 400.
- Fees PDF: admin 200 `%PDF-` bytes, `receipt-101015.pdf`; owning parent 200;
  another parent 404; anonymous 401.
- Regressions: attendance submit/state, fees summary/today, notifications,
  health `{"ok":true,"students":400}` - all intact.
- `npx eslint` clean on every touched file. `npm run build` passes.

**Test residue in dev DB (delete before launch):** complaint id 4 (the
playground swing test) and its two notifications.
