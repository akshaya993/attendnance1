# Feature 04 â€” Fees: Locked Decisions

> **URL RESTRUCTURE NOTE (2026-08-14):** the pages moved to FEATURE-FIRST URLs:
> `/fees/admin/...` â†’ `/fees/admin/...` and `/fees/parent` â†’ `/fees/parent`
> (supersedes the role-first mention in section 2's inherited line). Logic,
> APIs (`/api/fees/*` unchanged), components and repo identical; only page
> locations and their links/gates moved. All tests re-run and pass on the new
> URLs.

Status: **DONE â€” built and tested 2026-08-13/14.**
Owner feature: 04 (Fee Management). Built after 13 (Auth), 09 (Notifications),
01 (Attendance).
Read this before touching ANY fee/payment/receipt code in any future chat.

Companion file: `04-1-files-explained.md` (plain-English file-by-file guide).

---

## 1. The money rules (non-negotiable, enforced in code)

1. **Money is NUMERIC(10,2).** pg returns it as a string; it STAYS a string
   until display. JavaScript never adds/subtracts money - all money maths
   happens in SQL.
2. **One payment = one fee category** (owner-confirmed prompt decision).
   `receipts` stays a flat table - no allocations table.
3. **Partial payments are allowed**; overpayment is impossible: the UPDATE is
   `SET balance_due = balance_due - $amount WHERE id = $1 AND balance_due >= $amount`
   - the database itself refuses an overpay (route answers 400 "Entered amount
   exceeded the due (â‚¹X)").
4. **Every payment runs in ONE transaction with `SELECT ... FOR UPDATE`** on
   the fee row. Two admins collecting from the same student at the same second
   cannot double-deduct - the second waits for the lock, then sees the new
   balance.
5. **The audit row commits in the SAME transaction** (`logAudit(entry, client)`,
   action `fee.payment`). Money without a record must never exist. This is the
   DB contract's requirement and it overrides feature 01's standalone-audit
   pattern (attendance is not money).
6. **Receipts are never edited or deleted.** There is no refund/cancel flow in
   v1. A wrong payment stays as a permanent, audited record; reversing entries
   is a future, owner-approved feature.
7. **Receipt numbers come from the database identity column** (starting
   100001). The app never invents one.
8. **"Today's collections" = the IST calendar day** (a midnight-to-midnight
   range on `receipts.created_at`, riding `idx_receipts_day`). Never a rolling
   24 hours. Verified live: the list reset to zero across the midnight
   boundary during testing.

---

## 2. Decisions locked by the owner (Q&A before the build)

| # | Question | Locked answer |
|---|---|---|
| 1 | Receipt format | **Print-friendly page** (`window.print()` / Save-as-PDF), NO pdfkit yet. Owner's condition: document BOTH approaches so a future feature can rebuild - see `04-1-files-explained.md` section 5. |
| 2 | Payment alert to parent | **Bell + phone buzz.** Priority `important`, source `fees`, kind `notice`, links to `/fees/parent`. Sent AFTER the commit; a notification failure can never undo saved money. |
| 3 | Installments (Term 1/2/3) | **Skipped.** `fee_installments` exists and is seeded, but the schedule/due-date logic belongs to Feature 14 per the project plan. Nothing half-built. |
| 4 | Due categories | **All four drillable** (tuition, bus, books, dress). The prompt's tuition/bus-only dashboard would have hidden ~200 students' book dues. |
| 5 | Currency format | **`â‚¹12,500.00`** (rupee symbol, Indian digit grouping, 2 decimals) via `lib/format.js`. Overrides the older "Rs 12,500.00" doc convention for these screens. |

Inherited standing decisions (from 01/09, still binding): role-first URLs
(`/fees/admin/...`, `/fees/parent`), `requireActiveApiSession()` /
`requireActiveSession()` first line everywhere, ids from the SESSION (numbers),
never raw pg BIGINTs, no new npm packages, no schema changes, no proxy.js
changes (the role prefixes already gate everything).

---

## 3. Design decisions (implementation-level)

### 3.1 Branch scoping goes through students

`fees` has **no `branch_id` column** (the contract is deliberate). Every
branch filter is `fees -> students -> students.branch_id = $1`, with the
branch id read from the signed session. Receipts reach the branch the same
way (`receipts -> fees -> students`).

### 3.2 What was reused (imported, never rebuilt)

- `lib/guard.js`, `lib/auth.js` - session + kill-switch + role gates.
- `lib/audit.js` - `logAudit(entry, client)` with the transaction client.
- `lib/notify.js` - `createNotification()` for the payment alert.
- `lib/repos/attendanceRepo.js` - `getClassInfo()` (branch guard for the due
  drill-down), `getOwnedStudent()` (parent ownership check),
  `getChildrenOfParent()` (the parent page's child list),
  `getParentInfoForStudents()` (who to notify after a payment). **No fee
  feature re-implements ownership or class lookups.**
- `lib/db.js` - `query` / `withTransaction`.
- `components/BackLink.js`, the design tokens, `.card`/`.pill`/`.cta`/
  `.label-micro`, the icon-button pattern.
- The attendance page's child-picker pattern (Feature 11 replaces both).

### 3.3 New shared file: `lib/format.js`

`formatMoney()` (â‚¹ + Indian grouping + 2 decimals), `formatDateIst()`,
`formatDateTimeIst()`, `FEE_CATEGORIES`, `feeCategoryLabel()`. **Zero imports,
client-safe** - same reason `lib/notificationConstants.js` exists. Future
features (marks, receipts anywhere) should import these instead of inventing
their own formatting.

### 3.4 The one reusable table

`components/fees/DueTable.js` renders every list in the module (class dues,
unpaid students, today's transactions) from `columns` + `rows` + an optional
`rowHref`. Clickable rows are plain `<Link>`s inside block cells - **no client
JavaScript**, valid HTML (an `<a>` is never a direct child of `<tr>`).

### 3.5 The kiosk keeps its session open

`components/fees/PayKiosk.js`: after a successful payment it refreshes the
family's dues in place (a silent re-search) and keeps the success card on
screen, so the office can collect bus, then tuition, then books without
re-typing the phone number. Money actions get an explicit serif-styled
confirm step (UI context rule 6).

### 3.6 Seed-data note that explains the numbers

Tuition = â‚¹24,000 + â‚¹1,500 x class number; books = â‚¹3,500 for everyone;
bus = â‚¹12,000 for every 5th student. Seed receipts cover a deterministic mix
(roughly: a third paid in full, a third 40%, a third unpaid for tuition).
So the branch dashboard shows crores in dues BY DESIGN - it is test data.

---

## 4. Bugs found DURING this build (and the lesson)

None in the money path. One import slip (a route imported a helper from a
non-existent module name) was caught and fixed before any test ran. The two
attendance-era traps (raw BIGINT comparisons, `.next` route caching) were
avoided by following the feature-01 decisions file from the start.

---

## 5. Test evidence (live, against the real dev DB)

Logins: admin `9000000001`, parent `9810000002`, teacher `9000000101`,
password `Pass@123`.

- Search `9810000002` â†’ parent Venkat Varma, child Vihaan Varma (id 417),
  tuition due â‚¹25,500.00, books absent from the list (already paid - correct).
- Overpay â‚¹99,999 â†’ `400 "Entered amount exceeded the due (â‚¹25,500.00)"`.
- Amounts `0`, `-5`, `abc` â†’ `400 "Enter a valid amount"`.
- Pay â‚¹500 cash â†’ `200`, receipt **#101015**, new balance **â‚¹25,000.00**,
  parent notified.
- Pay â‚¹25,000 UPI â†’ `200`, receipt **#101016**, new balance **â‚¹0.00**.
- Pay again on the settled fee â†’ `400 "exceeded the due (â‚¹0.00)"`.
- Parent summary: tuition due â‚¹0.00; receipts #101016 then #101015 (newest
  first) with correct modes.
- Parent bell: two `important` "Fee payment received - Receipt #..." alerts.
- Today's collections: both receipts listed, total â‚¹25,000.00... then after
  the midnight IST boundary the same endpoint answered 0 - the calendar-day
  reset proven live.
- Branch summary: total â‚¹86,77,900.00; tuition/bus/books with dues; **dress
  shown as â‚¹0 with 0 dues (visible, not hidden)** - the owner's Q4 answer.
- Books drill-down for class 1A: 13 unpaid students at â‚¹3,500.00 each.
- Receipt pages: admin 200, owner parent 200, **another parent 404** (receipt
  existence is not even leaked).
- Guards: parent POST pay â†’ 403 Â· teacher GET summary â†’ 403 Â· anonymous â†’
  401 Â· bad category â†’ 400 Â· another family's child summary â†’ 403.
- All 8 pages render HTTP 200. `npx eslint` clean. `npm run build` passes.
  `/api/health` still `{"ok":true,"students":400}` after everything.

### Edge-case battery (2026-08-14, second pass)

- **Paise precision:** â‚¹3,500.00 books fee â†’ pay â‚¹0.01 â†’ balance exactly
  â‚¹3,499.99 â†’ pay â‚¹3,499.99 â†’ balance exactly â‚¹0.00. No floating-point dust
  anywhere (all money maths is SQL NUMERIC).
- **Concurrency race:** two SIMULTANEOUS â‚¹3,000 payments fired at one â‚¹3,500
  books fee â†’ exactly one succeeded (receipt #101019, balance â‚¹500.00), the
  other was refused `400 "exceeded the due (â‚¹500.00)"` - and the refusal saw
  the POST-LOCK balance, proving `FOR UPDATE` serialised them. No
  double-deduction is possible.
- **Zero-dues state:** after settling tuition, the family search returns
  `pendingFees: []` (kiosk shows "No pending dues for this child").
- **3-decimal amount** `100.005` â†’ `400 "Enter a valid amount"`.
- **Audit:** zero `[audit] failed` lines in the dev log; because fee payments
  audit inside the transaction, a 200 response itself proves the audit row
  committed.

**Test residue in the dev DB (delete before launch):** receipts #101015 and
#101016 on fee 897, #101017/#101018 on fee 1313, #101019 on fee 1298, the
payment notifications, and the `fee.payment` audit rows.

---

## 6. What this feature owes later features

1. **Feature 14** completes installment logic (`fee_installments` due dates,
   reminders worker `workers/feeReminders.js`). This feature deliberately did
   not touch installment display.
2. **Receipt as real PDF:** DONE 2026-08-14 during feature 03 (owner ordered
   pdfkit installed). `GET /api/fees/receipt/[receiptNumber]` serves a real
   `application/pdf` download; the printable pages and `ReceiptCard.js` remain
   in place (a "Download as PDF file" link was added). Two gotchas, both
   documented in the 03 decisions file: pdfkit's font can't draw â‚¹ (PDFs say
   "Rs"), and pdfkit MUST stay in `serverExternalPackages` in
   `next.config.mjs` or its font files 500.
3. **Feature 11** replaces the child picker stand-in on `/fees/parent` (same
   handoff as attendance - one `?student=` param to drive).
4. **Refunds / payment reversal:** not built, by design. If the school asks,
   it needs an owner decision, a new audit action (e.g. `fee.reversal`), and
   careful money rules.
