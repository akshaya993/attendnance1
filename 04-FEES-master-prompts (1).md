# ⚠️ DB CONTRACT (SCHEMA v1.1 FINAL) — READ BEFORE ANY PROMPT BELOW

The database schema is FINALIZED in `00-FINAL-DB-SCHEMA.md` (Part A =
`db/schema.sql`) and already exists before this feature is built. Rules for the
AI coding tool — repeat them in every generated file's header comment:

1. NEVER run CREATE TABLE / ALTER TABLE / DROP in this feature.
2. NEVER invent tables or columns. Use ONLY the exact names below.
3. If a column you need seems missing, STOP and report it — do not add it.
4. If any SQL inside the prompts below differs from this contract, THE
   CONTRACT WINS (some prompts predate schema v1.1 — e.g. fee_installments is new).
5. All indexes already exist in db/schema.sql — do not create or drop indexes.

## Database connection (identical in every feature)

`.env.local`: `DATABASE_URL=postgres://school_app:<password>@localhost:5432/school`

All queries go through the existing `lib/db.js` (pg Pool, max 15) — import
`query(text, params)` and `withTransaction(fn)`. No ORM, no `new Pool` anywhere
else, parameterized queries only ($1, $2). ALL money is NUMERIC(10,2) — never
float, never integer paise.

## Tables this feature OWNS (reads + writes)

```sql
CREATE TABLE fees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  category TEXT NOT NULL CHECK (category IN ('tuition','bus','books','dress')),
  academic_year TEXT NOT NULL,              -- format '2026-27'
  total_amount NUMERIC(10,2) NOT NULL,
  balance_due NUMERIC(10,2) NOT NULL,       -- PRECOMPUTED: updated in the SAME
                                            -- transaction as the receipt insert,
                                            -- with SELECT ... FOR UPDATE first
  UNIQUE (student_id, category, academic_year)
);

CREATE TABLE receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_number BIGINT NOT NULL UNIQUE,    -- human series starting 100001 (see db/schema.sql)
  fee_id BIGINT NOT NULL REFERENCES fees(id),
  amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash','card','upi')),
  received_by BIGINT NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v1.1: payment SCHEDULE (Term 1/2/3). Paid-status is DERIVED from receipts
-- (cumulative paid vs cumulative due) — NEVER stored per installment.
CREATE TABLE fee_installments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fee_id BIGINT NOT NULL REFERENCES fees(id),
  installment_number SMALLINT NOT NULL,
  label TEXT NOT NULL,                      -- 'Term 1', 'Term 2', ...
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  UNIQUE (fee_id, installment_number)
);
```

Invariants (enforce in repo code): a payment is ONE category; amount_paid must
not exceed that fee's balance_due (reject "entered amount exceeded"); "Today's
Collections" = IST calendar day (`AT TIME ZONE 'Asia/Kolkata'`), not last 24h.
Fee payments are audited via `lib/audit.js` ('fee.payment') in the SAME
transaction (see 14-PROMOTIONS-YEAR-END-master-prompts.md, Prompt 5).

## Tables this feature READS ONLY (exact signatures — do not modify them)

- `students(id, branch_id, class_id, parent_profile_id, full_name, roll_number, ..., is_active, created_at)`
- `classes(id, branch_id, class_number, section)`
- `profiles(id, branch_id, role[admin|teacher|parent|bus], full_name, phone_number, ...)`
- `audit_logs` — write ONLY through `lib/audit.js`, never direct SQL.

---

# FEATURE 04 — FEE MANAGEMENT (Master Prompt File)

**How to use:** Copy ONE prompt at a time, in order (0 → 6). Same stack: Next.js + PostgreSQL + raw `pg`. Reuses `lib/db.js`, `lib/auth.js`.

**Files this feature will create:**

```
school-app/
├── db/schema.sql                                (Prompt 0 — adds fee tables)
├── lib/repos/feeRepo.js                         (Prompts 2, 4, 5, 6)
├── components/fees/DueTable.js                  (Prompt 1 — REUSED everywhere)
├── components/fees/StatCard.js                  (Prompt 1)
├── app/fees/admin/page.js                       (Prompt 1  — dashboard)
├── app/fees/admin/due/[category]/page.js        (Prompt 1  — class-level dues)
├── app/fees/admin/due/[category]/[classId]/page.js (Prompt 1 — unpaid students)
├── app/fees/admin/pay/page.js                   (Prompt 3  — pay-fee kiosk)
├── app/fees/admin/today/page.js                 (Prompt 6  — today's collections)
├── app/fees/parent/page.js                      (Prompt 1  — parent dashboard)
└── app/api/fees/
    ├── summary/route.js                         (Prompt 2)
    ├── due/route.js                             (Prompt 2)
    ├── search/route.js                          (Prompt 4)
    ├── pay/route.js                             (Prompt 5)
    ├── today/route.js                           (Prompt 6)
    └── parent-summary/route.js                  (Prompt 2)
```

---

## PROMPT 0 — Fee Schema

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js + PostgreSQL school app (`lib/db.js`, `lib/auth.js`, `db/schema.sql` exist). Append to `db/schema.sql`:
>
> - `fees(id, student_id → students, branch_id → branches, category VARCHAR(20) CHECK (category IN ('tuition','bus','books','dress')), academic_year VARCHAR(9), total_amount NUMERIC(10,2), balance_due NUMERIC(10,2), UNIQUE(student_id, category, academic_year))`
> - `receipts(id, fee_id → fees, student_id → students, amount_paid NUMERIC(10,2), payment_mode VARCHAR(10) CHECK (payment_mode IN ('cash','card','upi')), received_by → profiles, receipt_number BIGSERIAL, created_at TIMESTAMPTZ DEFAULT now())`
>
> Indexes: **partial index** `ON fees(student_id) WHERE balance_due > 0` (the due-list queries only ever scan unpaid rows — tiny and fast), plus `receipts(created_at)` and `receipts(student_id)`.
>
> Money rule: NUMERIC(10,2) everywhere. NEVER use floating point for money.
>
> *Confirmation: One payment = one fee category (matching the kiosk flow), so receipts stay a simple flat table; the partial index keeps due lookups fast even with years of data.*

---

## PROMPT 1 — Admin Fee Dashboard + Due Drill-Down UI + Parent Dashboard

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. Build ONLY the UI (mock data).
>
> 1. **Create `components/fees/StatCard.js`:** a clickable analytics card (label, big amount, small sub-label) with a soft press animation (scale-down on click) — this soft motion must be reused on every clickable widget and the submit buttons in this module.
> 2. **Create `components/fees/DueTable.js`:** ONE reusable table component. Props: `columns`, `rows`, `onRowClick`. It renders every list in this module — class-level dues, unpaid students, today's transactions — because they are all just tabular data with different columns. DO NOT build separate table components per page.
> 3. **Create `app/fees/admin/page.js`** (fee management landing): three StatCards — "Total Fee Due", "Tuition Fee Due", "Bus Fee Due" — plus quick links to "Pay Fee" and "Today's Collections". Clicking Tuition/Bus due navigates to `/fees/admin/due/tuition` or `/fees/admin/due/bus`.
> 4. **Create `app/fees/admin/due/[category]/page.js`:** DueTable of class-level dues — columns: Class-Section, Students with dues, Total due. Row click → `/fees/admin/due/[category]/[classId]`.
> 5. **Create `app/fees/admin/due/[category]/[classId]/page.js`:** DueTable of unpaid students — Name, Roll Number, Due Amount — plus a "Copy Names" button that copies the unpaid students' names to the clipboard.
> 6. **Create `app/fees/parent/page.js`:** top StatCard "Total Outstanding Balance", a simple bar breakdown per category (Tuition, Bus, Books, Dress — show 0 distinctly), and a "Payment History & Receipts" list (Date, Amount, category, receipt number) limited to the last 12 months, each row opening a receipt view.
>
> Every page needs a back button. All amounts formatted as ₹ with thousands separators.
>
> *Confirmation: One reusable DueTable powers the entire school → class → student drill-down for BOTH tuition and bus, with soft-motion feedback on every click.*

---

## PROMPT 2 — Due & Summary Backend

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Exists:** fee UIs, `db/schema.sql` with `fees`/`receipts`. Wire the dashboards to real data.
>
> 1. **Create `lib/repos/feeRepo.js`** with: 
>    - `getBranchSummary(branchId)` — ONE grouped query on the partial index: total due + due per category.
>    - `getClassDues(branchId, category)` — per class-section: count of students with balance_due > 0 and SUM of dues, sorted by class.
>    - `getUnpaidStudents(classId, category)` — name, roll number, due amount.
>    - `getParentSummary(parentId, studentId)` — category-wise dues for the child + receipts from the last 12 months.
> 2. **Create `app/api/fees/summary/route.js`** (GET, admin — branch scoped), **`app/api/fees/due/route.js`** (GET `?category=&classId=`, admin), **`app/api/fees/parent-summary/route.js`** (GET `?studentId=`, parent only — MUST verify `students.parent_id` = logged-in parent, else 403).
>
> All queries parameterized; every admin query filtered by the admin's `branchId`.
>
> *Confirmation: The whole due drill-down runs on 3 small indexed queries.*

---

## PROMPT 3 — Pay Fee Kiosk UI

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. **Exists:** `components/fees/StatCard.js`, `components/fees/DueTable.js`. Build ONLY the UI (mock data).
>
> **Create `app/fees/admin/pay/page.js`** — a fast point-of-sale style kiosk:
> 1. Top search bar: "Enter Parent Registered Mobile Number". Input fields show an underline cursor line when focused and the same soft press motion as the dashboard widgets; the submit button too.
> 2. After a valid search: a "Student Profile Card" (photo, name, class, parent name). If the parent has multiple children, show a child selector.
> 3. "Pending Dues" list: each category as a selectable row (Tuition — ₹10,000, Bus — ₹5,000…). **Only ONE category selectable at a time** (radio behavior).
> 4. "Payment Entry": "Amount Received" number input + "Payment Mode" dropdown (Cash, Card, UPI).
> 5. Instant client-side validation: entered amount must be > 0 and ≤ the selected category's balance. If it exceeds: show "Entered amount exceeded the due (₹X)" and disable submit. (Partial payments ARE allowed.)
> 6. "Process Payment & Generate Receipt" button with a confirmation pop-up ("Are you sure you want to process ₹X for [category]?").
> 7. **The session stays on screen after success:** show the updated dues (due − paid) so the admin can immediately select another category (e.g., pay bus, then tuition) without re-searching. Only the back button exits the session.
> 8. Success response area: green card with receipt number, amount, category, new balance + "Print/Download Receipt" button.
>
> *Confirmation: A checkout-kiosk flow — one category per payment, exact validation, session persists for multiple payments.*

---

## PROMPT 4 — Search Backend

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Exists:** `lib/repos/feeRepo.js`, pay kiosk UI.
>
> **Add to `lib/repos/feeRepo.js`:** `searchByParentPhone(phone, branchId)` — find the parent profile by exact phone number, return all linked students with their pending fees (balance_due > 0) per category.
>
> **Create `app/api/fees/search/route.js`** — GET `?phone=`, admin only, branch scoped. Return `{parent, students:[{id, name, class, photo, pendingFees:[{feeId, category, totalAmount, balanceDue}]}]}` or 404 "No parent found with this number".
>
> *Confirmation: One exact-match indexed lookup on the unique phone number — instant kiosk search.*

---

## PROMPT 5 — Payment Processing Backend (the money transaction)

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Exists:** `lib/repos/feeRepo.js`, search API, kiosk UI. This is the most critical code in the app — money math must be perfect.
>
> **Add to `lib/repos/feeRepo.js`:** `processPayment({feeId, amount, paymentMode, adminId})` running in ONE SQL transaction with row locking:
> 1. `SELECT ... FROM fees WHERE id=$1 FOR UPDATE` — lock the fee row so two simultaneous payments can never double-deduct.
> 2. Validate server-side (NEVER trust the frontend): amount > 0, amount ≤ balance_due, fee belongs to the admin's branch. If invalid → rollback and return a 400 with "Entered amount exceeds the due" or "Enter a valid amount".
> 3. `UPDATE fees SET balance_due = balance_due - $amount`.
> 4. INSERT the `receipts` row (fee_id, student_id, amount, mode, received_by = adminId).
> 5. COMMIT and return `{receiptNumber, amountPaid, category, newBalance}`.
>
> **Create `app/api/fees/pay/route.js`** — POST, admin only, calls `processPayment`. Use NUMERIC-safe math (values as strings into pg; no JS floating point arithmetic on money).
>
> Also add `getReceipt(receiptId)` + a small receipt PDF using the existing `pdfkit` setup from the Complaints feature (school name, student, category, amount, mode, receipt number, date, received-by).
>
> *Confirmation: Row-level locking + one transaction = accurate balances even with concurrent admins; every rupee is traceable to a receipt row.*

---

## PROMPT 6 — Today's Collections

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Exists:** all fee files.
>
> 1. **Add to `lib/repos/feeRepo.js`:** `getTodaysCollections(branchId)` — receipts joined with students/classes/fees WHERE the receipt was created **today in the school's timezone (Asia/Kolkata)**: `created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`. This is CALENDAR-DAY logic — a Monday payment never appears on Tuesday. Do NOT use a rolling 24-hour window. Return the total collected + rows (time, student name, class-section, amount, category, mode).
> 2. **Create `app/api/fees/today/route.js`** — GET, admin only, branch scoped.
> 3. **Create `app/fees/admin/today/page.js`:** top StatCard "Collected Today: ₹X" + the reusable `DueTable` listing today's transactions (Time, Student, Class, Category, Mode, Amount), newest first.
>
> *Confirmation: The list resets at midnight IST automatically because it is derived from timestamps — no cron job, no cleanup, no extra table.*

---

## NOTES — decisions & corrections

1. **Conflict resolved:** your master req file wanted multi-category allocation in one payment; this fee file says ONE category per payment with the session staying open. I built the one-category flow — simpler, fewer money bugs, and the persistent session gives the same speed. The `receipts` table stays flat (no allocations table needed).
2. **Waste removed:** a separate "today's transactions table". Today's collections is a simple timestamp query on `receipts` — an extra table would need syncing and cleanup for zero benefit.
3. **Partial payments allowed** (due − paid becomes the new balance) — your "balance should update" requirement implies this.
4. **Critical additions:** `FOR UPDATE` row locking, server-side validation, `received_by` audit column, calendar-day (not 24h) logic in IST — exactly as you specified.
5. **Money = NUMERIC, never float.** Non-negotiable for production.
