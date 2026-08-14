# Feature 03 â€” Complaints: Every File Explained in Plain English

**Built:** 2026-08-14 Â· **Status:** tested and working
(Feedback forms were deliberately postponed â€” see `03-2-feedback-future-spec.md`.)

Read this to understand what each complaints file does, what it talks to, and
what breaks if you change it. Technical words are explained (in brackets) the
first time they appear.

---

## 1. The big picture in one minute

Complaints is a two-sided help desk (note: since 2026-08-14 the pages live at
feature-first URLs â€” `/complaints/parent` and `/complaints/admin`):

- A **parent** opens `/complaints/parent`, writes a subject and a description
  (text only â€” no photos, no emoji picker), and submits. Their past
  complaints are listed underneath with status chips: **Pending** (the office
  hasn't opened it yet), **Read**, **Resolved** â€” plus the school's reply
  when there is one.
- The **admins** (the office) immediately get a bell notification AND a phone
  buzz: "New complaint received". Tapping it opens `/complaints/admin`.
- The admin inbox looks like an email client: a ticket queue on the left
  (unread in bold on top, flagged tickets filterable), the open ticket on the
  right. Opening a ticket marks it **read** automatically. The admin can flag
  it (a personal "needs attention" marker), view the parent's profile (name,
  phone, their children with classes), write a reply â€” optionally polishing
  rough notes with the **AI Draft** button â€” and finally **Mark Resolved**.
- The owner's golden rules: **replying does NOT close a ticket** (only the
  admin closing it does), **a ticket cannot be closed without a reply**, and
  **closed is final** (no reopening). When the office replies, the parent's
  phone buzzes and the answer appears under their complaint.

---

## 2. The new files, one by one

### A. `lib/repos/complaintRepo.js` â€” the database layer

Every database question about complaints lives here (the project rule: SQL â€”
the database language â€” exists only inside `lib/repos/`).

| Function | Plain-English job |
|---|---|
| `createComplaint(...)` | Files a new complaint, always born "unread". |
| `getParentComplaints(parentId)` | One parent's own complaints, newest first, with the reply and replier's name attached. |
| `getQueue(branchId, {flaggedOnly})` | The admin inbox: unread first (newest on top), then read, then resolved at the bottom. Optional "flagged only". |
| `getComplaintForAdmin(id, branchId)` | One ticket for the detail pane, including the parent's contact info. Another branch's ticket returns nothing (becomes a 404). |
| `markRead(id, branchId)` | Opening a ticket flips unread â†’ read. Already-read/resolved: no-op. |
| `toggleFlag(id, branchId)` | Flips the flag on/off and returns the new value. |
| `replyToComplaint(...)` | Stores the reply + who + when. **Never resolves.** An unread ticket being answered becomes "read". Note: there is ONE reply column â€” the latest reply replaces the previous one. |
| `resolveComplaint(...)` | Closes the ticket ONLY if a reply exists; otherwise reports `needs_reply`. Already-resolved reports `already_resolved`. Unknown id reports `not_found`. The route turns these into honest 400/409/404 answers. |

### B. `lib/complaintConstants.js` â€” the shared limits

`SUBJECT_MAX` (150), `DESCRIPTION_MAX` (5000), `REPLY_MAX` (5000),
`COPILOT_NOTES_MAX` (2000), the three legal statuses and their friendly labels.
**It imports nothing**, so the browser form and the server route share the
exact same rules (the same trick as the notifications constants file).

### C. `lib/ai.js` â€” the AI helper (server-only)

`draftReply(roughNotes, {subject, description})` â€” sends the admin's notes to
an AI provider and returns a polished reply text. The provider is chosen
entirely through environment variables (secret settings in `.env.local`, a
file only the owner edits): `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Any
OpenAI-compatible service works â€” including a free self-hosted one (Ollama).
**Not configured? Nothing breaks:** the function calmly returns "not
configured" and the admin sees a polite note. It never throws an error into
the app, and it NEVER sends anything by itself â€” it only fills the reply box.

### D. The three API routes (`app/api/complaints/`)

An "API route" is a URL the app calls to read or change data. All follow the
same order: **who are you â†’ are you allowed â†’ is the input sane â†’ do the work
â†’ answer** `{ ok, data }` / `{ ok, error }`.

| Route | Who | Job |
|---|---|---|
| `route.js` GET | parent = own list Â· admin = the queue | One URL, split by the role in the signed login cookie. |
| `route.js` POST | parent | File a complaint â†’ then alert every admin (bell + buzz). The complaint is saved FIRST; an alert failure can never lose it. |
| `[id]/route.js` GET | admin | One ticket + the parent's children (for the profile popover). |
| `[id]/route.js` PATCH | admin | `action`: `read` / `flag` / `reply` / `resolve` â€” with the owner's lifecycle rules enforced on the server. Reply pings the parent (bell + buzz). |
| `copilot/route.js` POST | admin | `{notes, complaintId?}` â†’ a draft reply, or a polite 503 when AI isn't configured. Writes nothing. |

### E. The components and pages

- **`components/complaints/ComplaintForm.js`** (browser) â€” the parent's form.
  Clears itself on success and refreshes the page's list so the new complaint
  appears on top instantly.
- **`app/complaints/parent/page.js`** (server) â€” the form + "My Past
  Complaints" with status chips and the school's reply in a green-edged box.
- **`components/complaints/TicketQueue.js`** (browser) â€” the admin inbox: the
  queue with flags and filter, the detail pane with the profile popover, the
  reply box with Send / AI Draft / Mark Resolved (which stays disabled â€” and
  says why â€” until a reply exists). On phones it shows list OR ticket with a
  back button; on desktop they're side by side.
- **`app/complaints/admin/page.js`** (server) â€” a thin shell: guard + title +
  the inbox component.

### F. Changes to EXISTING files (small, additive)

- `lib/repos/authRepo.js` â€” ONE new function, `listAdminIdsByBranch()`
  (the office's address book for the new-complaint alert).
- `app/admin/page.js`, `app/parent/page.js` â€” one COMPLAINTS link card each.
- `components/fees/ReceiptCard.js` â€” a "Download as PDF file" link (fees
  retrofit, below).
- `next.config.mjs` â€” `serverExternalPackages: ["pdfkit"]` so the PDF library
  can find its font files (removing this line breaks PDF downloads with a
  500; the reason is written in a comment there).
- `package.json` â€” `pdfkit` added (owner-approved).

---

## 3. The fees receipt PDF retrofit (also part of this session)

The owner ordered a REAL pdf file for fee receipts (the print-friendly page
from feature 04 stays as the on-screen view â€” nothing about it changed):

- **New route:** `app/api/fees/receipt/[receiptNumber]/route.js` â€” builds the
  receipt as a genuine PDF on the server and sends it as a download
  (`receipt-101015.pdf`). It reuses the existing `getReceipt()` data function
  and copies the access rules from the receipt pages: the branch's admin or
  the child's own parent; anyone else gets a plain 404.
- **Known limitation (documented in code):** the PDF writes "Rs 25,500.00"
  because pdfkit's built-in font cannot draw the â‚¹ symbol. Screens keep â‚¹.
- The step-by-step pdfkit note that feature 04's docs pre-wrote ("section 5")
  was followed almost exactly â€” the one surprise (bundled font files 500ing)
  is now documented in `03-0-decisions.md` section 6.

---

## 4. If something looks broken, check these first

1. **PDF download answers 500 with a font path error** â†’ somebody removed
   `serverExternalPackages: ["pdfkit"]` from `next.config.mjs`, or the server
   wasn't restarted after a config change.
2. **AI Draft says "unavailable: missing from .env.local"** â†’ that is the
   feature working as designed. Add `AI_BASE_URL` + `AI_MODEL` (and
   `AI_API_KEY` for hosted providers) to `.env.local` and restart the server.
3. **A brand-new page 404s** â†’ the dev server cached its page list before the
   file existed: stop it, delete the `.next` cache folder, restart.
4. **A parent reports they didn't get the reply alert** â†’ the reply itself is
   never lost (it's stored on the ticket); the bell entry is the bonus. Check
   the server log for `[api/complaints/[id]] reply saved but parent alert
   failed`.
5. **Two people developing on this one machine:** only ONE dev server can own
   port 3000. If routes suddenly 404 that worked a minute ago, check WHICH
   project copy is serving the port before suspecting the code.
