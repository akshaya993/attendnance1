# ⚠️ DB CONTRACT (SCHEMA v1.1 FINAL) — READ BEFORE ANY PROMPT BELOW

The database schema is FINALIZED in `00-FINAL-DB-SCHEMA.md` (Part A =
`db/schema.sql`) and already exists before this feature is built. Rules for the
AI coding tool — repeat them in every generated file's header comment:

1. NEVER run CREATE TABLE / ALTER TABLE / DROP in this feature.
2. NEVER invent tables or columns. Use ONLY the exact names below.
3. If a column you need seems missing, STOP and report it — do not add it.
4. If any SQL inside the prompts below differs from this contract, THE
   CONTRACT WINS (some prompts predate schema v1.1).
5. All indexes already exist in db/schema.sql — do not create or drop indexes.

## Database connection (identical in every feature)

`.env.local`: `DATABASE_URL=postgres://school_app:<password>@localhost:5432/school`

All queries go through the existing `lib/db.js` (pg Pool, max 15) — import
`query(text, params)` and `withTransaction(fn)`. No ORM, no `new Pool` anywhere
else, parameterized queries only ($1, $2).

## Tables this feature OWNS (reads + writes)

```sql
CREATE TABLE complaints (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  parent_id BIGINT NOT NULL REFERENCES profiles(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','resolved')),
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  admin_reply TEXT,
  replied_by BIGINT REFERENCES profiles(id),
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  fields JSONB NOT NULL,                    -- question definitions
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback_campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  template_id BIGINT NOT NULL REFERENCES feedback_templates(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback_responses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES feedback_campaigns(id),
  parent_id BIGINT NOT NULL REFERENCES profiles(id),
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, parent_id)           -- one response per parent per campaign
);
```

## Tables this feature READS ONLY (exact signatures — do not modify them)

- `profiles(id, branch_id, role[admin|teacher|parent|bus], full_name, phone_number, ...)`
- `branches(id, name, address, created_at)`
- Notifications are sent through `lib/notify.js` (Feature 09) — never insert
  into notification tables directly from this feature.
- AI helper env (complaint summaries): `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.

---

# FEATURE 03 — COMPLAINTS + FEEDBACK FORMS (Master Prompt File)

**How to use:** Copy ONE prompt at a time, in order (0 → 6). Same stack: Next.js + PostgreSQL + raw `pg`. Reuses `lib/db.js`, `lib/auth.js` from Feature 01.

**Files this feature will create:**

```
school-app/
├── db/schema.sql                                  (Prompt 0 — adds tables)
├── lib/repos/complaintRepo.js                     (Prompt 3)
├── lib/repos/feedbackRepo.js                      (Prompt 6)
├── lib/ai.js                                      (Prompt 3 — LLM helper)
├── components/complaints/TicketQueue.js           (Prompt 2)
├── components/feedback/FormBuilder.js             (Prompt 5)
├── app/complaints/parent/page.js                  (Prompt 1)
├── app/complaints/admin/page.js                   (Prompt 2)
├── app/feedback/admin/page.js                     (Prompt 5)
├── app/feedback/parent/[campaignId]/page.js       (Prompt 5)
└── app/api/
    ├── complaints/route.js                        (Prompt 3)
    ├── complaints/[id]/route.js                   (Prompt 3)
    ├── complaints/copilot/route.js                (Prompt 3)
    ├── feedback/templates/route.js                (Prompt 6)
    ├── feedback/campaigns/route.js                (Prompt 6)
    ├── feedback/respond/route.js                  (Prompt 6)
    └── feedback/report/[campaignId]/route.js      (Prompt 6)
```

---

## PROMPT 0 — Schema Additions

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js + PostgreSQL school app (`lib/db.js`, `lib/auth.js`, `db/schema.sql` exist). Append to `db/schema.sql`:
>
> - `complaints(id, branch_id → branches, parent_id → profiles, subject VARCHAR(150), description TEXT, status VARCHAR(10) CHECK (status IN ('unread','read','resolved')) DEFAULT 'unread', is_flagged BOOLEAN DEFAULT false, admin_reply TEXT, replied_by → profiles, replied_at, created_at)` + index on `(branch_id, status, created_at DESC)`.
> - `feedback_templates(id, branch_id, name VARCHAR(100), fields JSONB, created_by, created_at)` — `fields` is an ordered JSON array like `[{"id":1,"type":"text","question":"..."},{"id":2,"type":"single_choice","question":"...","options":["A","B"]},{"id":3,"type":"rating","question":"..."}]`.
> - `feedback_campaigns(id, template_id → feedback_templates, branch_id, pushed_by, status CHECK (status IN ('open','closed')) DEFAULT 'open', created_at)` — one row each time admin pushes a form to parents.
> - `feedback_responses(id, campaign_id → feedback_campaigns, parent_id → profiles, student_id → students, answers JSONB, submitted_at, UNIQUE(campaign_id, parent_id))` — the UNIQUE constraint is what makes the form disappear from a parent's account after submission.
>
> *Confirmation: JSONB gives fully flexible form fields with zero extra tables — single PostgreSQL, no MongoDB needed.*

---

## PROMPT 1 — Parent Complaint + Feedback UI

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. Build ONLY the UI (mock data).
>
> **Create `app/complaints/parent/page.js`** with two tabs in one page: "Complaints" and "Feedback".
>
> **Complaints tab (always open):**
> 1. A clean form: "Subject" text input + "Description" multiline textarea. Standard text only — no emoji picker, no file uploads, no rich text (keeps tone professional and DB light).
> 2. A prominent "Submit Complaint" button.
> 3. Below: "My Past Complaints" list — subject, date, status chip (Pending = grey, Read = blue, Resolved = green), and the admin's reply when present.
>
> **Feedback tab (only visible when admin has pushed a form):**
> 1. If there is an open feedback campaign the parent hasn't answered: render the form dynamically from its JSON fields — text questions as textareas, single-choice as radio-button groups (only one selectable), ratings as 1–5 stars.
> 2. After submission the form disappears and the tab shows "No pending feedback — thank you!".
>
> *Confirmation: A sterile, text-only complaint form and a dynamic feedback form that vanishes once submitted.*

---

## PROMPT 2 — Admin Complaints Inbox + AI Copilot UI

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. **Exists:** `app/complaints/parent/page.js`. Build ONLY the UI (mock data).
>
> **Create `components/complaints/TicketQueue.js` and `app/complaints/admin/page.js`:**
> 1. **Split-screen** like Gmail/Outlook: left = Ticket Queue, right = Active Ticket View.
> 2. **Queue mechanics:** Unread complaints pinned on top in bold (newest first). When admin opens one, it moves into the "Read/Seen" section below (latest read on top).
> 3. **Flagging:** flag icon on each ticket + a "Show Flagged Only" filter at the top of the queue.
> 4. **Active Ticket View:** complaint subject + text; next to the parent's name a "View Profile" button opening a pop-over with their linked student, class, and contact info.
> 5. **AI Copilot reply box:** reply textarea at the bottom with two buttons — "Send Reply" and "✨ AI Draft Solution". Clicking AI Draft sends the admin's rough notes (e.g., "tell them bus is fixed tomorrow") to the copilot API and fills the textarea with the polished reply, which the admin can edit before sending. Add a "Mark Resolved" button.
>
> *Confirmation: A modern email-client inbox with AI-assisted replies the admin always reviews before sending.*

---

## PROMPT 3 — Complaints Backend + AI Copilot API

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Exists:** `lib/db.js`, `lib/auth.js`, complaint UIs. Wire complaints to real data.
>
> 1. **Create `lib/repos/complaintRepo.js`:** `createComplaint`, `getParentComplaints(parentId)`, `getQueue(branchId, flaggedOnly)`, `markRead(id)`, `toggleFlag(id)`, `reply(id, adminId, text)`.
> 2. **Create `app/api/complaints/route.js`:** POST (parent only) saves subject+description with status 'unread'; GET returns the caller's own complaints (parent) or the full branch queue sorted status='unread' first then created_at DESC (admin).
> 3. **Create `app/api/complaints/[id]/route.js`:** PATCH (admin only) for actions: `read`, `flag`, `reply` (stores admin_reply + replied_by + replied_at, sets status 'resolved').
> 4. **Create `lib/ai.js`:** one helper `draftReply(roughNotes)` that calls an OpenAI-compatible chat-completions endpoint. Read `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` from env vars so I can point it at ANY provider — a free-tier cloud model or a fully self-hosted open-source model via Ollama (`http://localhost:11434/v1`) for zero cost. System prompt: "Rephrase the admin's rough notes into a highly polite, professional school administrator response. Return only the reply text."
> 5. **Create `app/api/complaints/copilot/route.js`:** POST (admin only) `{notes}` → returns `{draft}` from `lib/ai.js`. Never auto-send — the admin reviews first.
>
> *Confirmation: Ticket states handled server-side; the LLM endpoint is swappable via env vars so the app never depends on one paid vendor.*

---

## PROMPT 4 — (merged into Prompt 3 — skip)

Intentionally left empty so numbering stays aligned with my planning notes. Continue to Prompt 5.

---

## PROMPT 5 — Feedback Form Builder UI (Admin) + Parent Fill Page

Copy and paste this into your AI:

> Act as an expert frontend developer and UI/UX designer. Continue my Next.js school app. **Exists:** complaints module. Build ONLY the UI (mock data).
>
> 1. **Create `components/feedback/FormBuilder.js`:** a drag-and-drop form builder (use the free `@dnd-kit` npm package):
>    - "Add Field" buttons: **Text Question** (asks: "What question do you want to ask?"), **Single-Choice** (question + add as many options as needed; parents can pick only ONE), **Rating 1–5**.
>    - Fields can be reordered by dragging and deleted.
>    - Live preview pane on the right.
> 2. **Create `app/feedback/admin/page.js`:**
>    - Two starting options: "Use Previous Template" (list of saved templates → preview → "Push to Parents" button) or "Create New Template" (opens FormBuilder → save with a name → push).
>    - A "Campaigns" section listing pushed forms with: responses received count, **"Pending Responses" button** (list of parents who haven't submitted + a "Send Reminder" button), a "Close Campaign" button, and a "Generate PDF Report" button.
> 3. **Create `app/feedback/parent/[campaignId]/page.js`:** renders the pushed form from its JSON fields (shared rendering logic with the parent Feedback tab from Prompt 1).
>
> *Confirmation: Admin builds reusable drag-and-drop templates, pushes them, chases pending parents, and pulls a report — all from one page.*

---

## PROMPT 6 — Feedback Backend + PDF Report Engine

Copy and paste this into your AI:

> Act as an expert backend developer. Continue my Next.js school app. **Exists:** feedback UIs, `db/schema.sql` with feedback tables. Wire feedback to real data.
>
> 1. **Create `lib/repos/feedbackRepo.js`:** `saveTemplate`, `listTemplates(branchId)`, `createCampaign(templateId, adminId)`, `getOpenCampaignForParent(parentId)`, `submitResponse(campaignId, parentId, studentId, answers)` (relies on the UNIQUE(campaign_id, parent_id) constraint — return 409 on duplicate), `getPendingParents(campaignId)`, `getCampaignResults(campaignId)`.
> 2. **API routes:** `app/api/feedback/templates/route.js` (GET/POST, admin), `app/api/feedback/campaigns/route.js` (GET/POST/PATCH close, admin + GET open-campaign for parent), `app/api/feedback/respond/route.js` (POST, parent — verify the campaign belongs to the parent's branch).
> 3. **Create `app/api/feedback/report/[campaignId]/route.js`** (GET, admin): generate a PDF with the free `pdfkit` npm package (no paid service):
>    - Question by question, in template order.
>    - Text questions: every response listed with the parent's name + student name + class beside it.
>    - Rating questions: the average of all responses (e.g., "Average: 4.2 / 5").
>    - Single-choice questions: percentage per option across all responses (e.g., "Yes — 78%, No — 22%").
>    - Footer: "Submitted: X/Y parents". Stream the PDF as a download (works even if some parents never submitted).
>
> *Confirmation: One JSONB answers column powers per-question aggregation, and the report downloads locally as a PDF with zero external services.*

---

## NOTES — decisions & corrections

1. **Feedback form appears only when pushed; complaints always open** — enforced by `feedback_campaigns.status='open'` + the UNIQUE response constraint.
2. **AI copilot cost warning:** LLM APIs are normally PAID. I made the endpoint configurable so you can use a free tier now and switch to self-hosted open-source (Ollama) later with zero code change — this matches your open-source-only rule.
3. **Waste removed:** "only one checkbox selectable" = a radio group. Built as Single-Choice — simpler and standard.
4. **Added:** ratings field type — your report requirements mention averages, which need a rating question type to exist.
5. **PDF via `pdfkit` (free, open source)** — also reused later for fee receipts and report cards.
