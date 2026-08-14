# Feature 04 — Fees: Every File Explained in Plain English

**Built:** 2026-08-13/14 · **Status:** tested and working
**Read this** to understand what each fees file does, what it talks to, and
what would break if you changed it. Technical words are explained (in
brackets) the first time they appear.

---

## 1. The big picture in one minute

Fees is the school's cash register and dues tracker:

- Every student owes the school money in up to four **categories**: Tuition,
  Bus, Books, Dress. Each category has a total and a **balance due** (what's
  left to pay).
- The office (admin) collects money at a **pay kiosk**: type the parent's
  phone number → pick the child → pick ONE category → enter the amount and
  how they paid (cash/card/UPI) → confirm → a **receipt** appears, ready to
  print. The kiosk stays open so the office can collect the next category
  straight away.
- Every payment shrinks the balance instantly, writes a receipt, and records
  itself in the tamper-proof activity log — **all three happen together or
  not at all** (a "transaction" — the database guarantees it). Two people
  collecting at the same moment cannot double-count.
- The parent opens **Fees** and sees what's left to pay (per category) and
  every receipt from the last 12 months. Their phone also buzzes with a
  "Payment received" notification the moment the office collects.
- The admin dashboard shows the whole school's outstanding money, drillable
  category → class → student, plus **Today's Collections** (resets at
  midnight automatically — no cleanup job needed).

### The screens and who sees them

| Screen address | Who | What it shows |
|---|---|---|
| `/admin/fees` | admin | Total due + 4 category cards + links to Pay and Today |
| `/admin/fees/due/tuition` | admin | Class-by-class dues for that category |
| `/admin/fees/due/books/49` | admin | The unpaid students of one class (+ Copy Names button) |
| `/admin/fees/pay` | admin | The pay kiosk |
| `/admin/fees/today` | admin | Today's collections, newest first |
| `/admin/fees/receipt/101015` | admin | Printable receipt |
| `/parent/fees` | parent | Child's total outstanding + per-category dues + receipt history |
| `/parent/fees/receipt/101015` | parent (own child only) | Printable receipt |

Teachers see **nothing** here (privacy rule: teachers never see fees) — every
fee route refuses them with 403.

---

## 2. The new files, one by one

### A. `lib/repos/feeRepo.js` — the money vault door

Every database question and every money change lives in this one file (project
rule: all SQL — the database language — stays inside `lib/repos/`).

| Function | Plain-English job |
|---|---|
| `getBranchSummary(branchId)` | The dashboard numbers: total outstanding + per-category dues, counting only unpaid rows (a special small index makes this instant). |
| `getClassDues(branchId, category)` | Per class: how many students owe in this category and how much. |
| `getUnpaidStudents(classId, category)` | The roll-ordered list of who hasn't paid, with amounts. |
| `getParentSummary(studentId)` | One child's fee rows + their receipts from the last 12 months. |
| `searchByParentPhone(phone, branchId)` | The kiosk search: exact phone → the parent + all their children + pending dues. |
| `processPayment(...)` | **THE money move.** Locks the fee row (so simultaneous payments queue up), lets the database refuse overpayment, updates the balance, writes the receipt, writes the audit record — one indivisible unit. |
| `getTodaysCollections(branchId)` | Every receipt from today's date in Indian time + the total. |
| `getReceipt(receiptNumber)` | One receipt with everything on it: student, class, amount, mode, date, who collected, school name. |

### B. `lib/format.js` — how numbers look (shared, browser-safe)

`formatMoney("25500.00")` → **₹25,500.00** (Indian digit grouping, always 2
decimals). Plus date formatters ("13 Aug 2026", "13 Aug 2026, 4:32 PM") pinned
to Indian time, and the category list + labels. **It imports nothing**, so any
screen or component — server or browser — can use it. Money is only ever
*displayed* here; it is never *calculated* in JavaScript.

### C. The six API routes (`app/api/fees/`)

An "API route" is a URL the app calls to read or change data. All follow the
same order: **who are you → are you allowed → is the input sane → do the work
→ answer** `{ ok, data }` / `{ ok, error }`.

| Route | Role | Job |
|---|---|---|
| `summary` (GET) | admin | Dashboard numbers. All four categories always present (0 shown distinctly). |
| `due` (GET) | admin | `?category=` → per-class dues; `&classId=` → that class's unpaid students. |
| `search` (GET) | admin | `?phone=` → the family and their dues, or 404 "No parent found". |
| `pay` (POST) | admin | The payment. Re-validates everything, runs the transaction, then pings the parent's bell + phone. |
| `today` (GET) | admin | Today's receipts + total. |
| `parent-summary` (GET) | parent | The child's dues + receipts. Hard-403 if the child isn't yours. |

### D. The five components (`components/fees/`)

- **`StatCard.js`** — a big money card (₹ amount, label, caption, coloured
  left edge). Clickable when given a link, with a gentle "press down" feel
  (pure CSS, no animation libraries).
- **`DueTable.js`** — THE table of the whole module. Every list (class dues,
  unpaid students, today's receipts) is this one file with different columns.
  Clickable rows need no browser code at all (each cell is a plain link).
- **`PayKiosk.js`** — the cash counter (the one big interactive piece).
  Search → child picker (auto for single child) → pick ONE due category →
  amount + mode → confirm dialog → receipt. After saving, the dues refresh in
  place and the session stays open for the next payment.
- **`ReceiptCard.js`** — the printable receipt (school name, receipt number,
  student, category, amount, mode, date, who collected) with a Print /
  Save-as-PDF button that hides itself when printing.
- **`CopyNamesButton.js`** — copies the unpaid students' names to the
  clipboard, one per line, for the office's follow-up messages.

### E. The eight pages (`app/admin/fees/...`, `app/parent/fees/...`)

Thin server-rendered screens (they load data on the server — fast on cheap
phones): the dashboard, the two due drill-downs, the kiosk shell, today's
collections, the two receipt views (admin + parent), and the parent fees
screen with the same stand-in child picker attendance uses.

### F. Edits to existing files

One "FEES" link card added to `app/admin/page.js` and `app/parent/page.js`
(their placeholder text invites exactly this). **Nothing else existing was
modified** — no changes to proxy.js, auth, guard, notifications, or the
schema. Zero new packages. Zero migrations.

---

## 3. How a payment actually flows (follow the rupee)

1. Admin opens `/admin/fees/pay`, types the parent's 10-digit number → the
   browser asks `/api/fees/search` → the family card and dues appear.
2. Admin picks the child, taps **Tuition — ₹25,500.00**, types `500`, picks
   **Cash**, taps Process → a confirmation appears: "Process ₹500.00 for
   Tuition fees of Vihaan Varma?"
3. On Yes, the browser POSTs `{feeId, amount: "500", paymentMode: "cash"}` to
   `/api/fees/pay`.
4. The route checks session + admin role + input shape, then runs
   `processPayment`: lock the fee row → the database itself checks the amount
   fits the balance → deduct → write receipt (number from the database:
   101015…) → write the audit record — **all committed together**.
5. Only after that, the parent's phone buzzes: "Fee payment received — Receipt
   #101015", and their bell shows it too.
6. The kiosk shows the green success card (receipt number, new balance
   ₹25,000.00) with a Print button, and the dues list quietly refreshes so the
   office can collect the next category.

---

## 4. Handoff notes

- **Feature 11 (Profiles):** `/parent/fees` uses the same temporary
  `?student=` child picker as attendance. The real ChildSwitcher only needs to
  drive that parameter; ownership is enforced regardless.
- **Feature 14 (Promotions/year-end):** owns everything about
  `fee_installments` schedules and the fee-reminder worker. We deliberately
  left installments untouched.
- **Refunds/reversals:** do not exist on purpose. If ever requested, they need
  an owner decision and a new audit action — never a DELETE on receipts.

---

## 5. Receipts: the on-screen page AND the real PDF

**UPDATE 2026-08-14:** the PDF upgrade described below was BUILT during
feature 03 (the owner ordered it). This section is kept as the record of the
design.

**On screen:** the receipt is a normal app page
(`/admin/fees/receipt/<number>`, `/parent/fees/receipt/<number>`) rendered by
`components/fees/ReceiptCard.js`, with a Print button (any phone/computer can
also Save-as-PDF from there) and a "Download as PDF file" link.

**As a file:** `app/api/fees/receipt/[receiptNumber]/route.js` generates a
real PDF on the server with pdfkit and sends it as a download. It reuses
`getReceipt()` for data and copies the access rules from the receipt pages
(admin of the branch, or the child's own parent - anyone else gets a 404).
Two gotchas, both handled and documented in the feature 03 decisions file:
pdfkit's built-in font has no ₹ glyph (PDFs write "Rs 25,500.00"), and pdfkit
must stay listed in `serverExternalPackages` in `next.config.mjs` or its font
files fail to load and every PDF answers 500.
