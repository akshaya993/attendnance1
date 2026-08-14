# Feature 03 (second half) â€” FEEDBACK FORMS: Build-Ready Specification

**Status: NOT BUILT (deliberately deferred by the owner, 2026-08-14).**
Complaints (the first half) is done â€” see `03-0-decisions.md` and
`03-1-files-explained.md`.

**Purpose of this file:** when the owner decides to build feedback forms, the
next session should need ZERO re-analysis. Everything is decided or flagged
below. Read this whole file, then confirm the open questions (section 8) with
the owner, then build.

---

## 1. What the feature is (plain English)

The office builds a questionnaire ("form template") once â€” e.g. a Parent
Satisfaction Survey â€” then **pushes** it to parents as a **campaign**. Parents
open the app, see a pending form, fill it in (text answers, single-choice
questions, 1â€“5 star ratings), and submit â€” once each; the form then disappears
for them. The office watches responses come in, chases the parents who haven't
answered ("Send Reminder"), closes the campaign, and generates a report.

## 2. The database (already exists â€” no migrations needed or allowed)

Frozen in `db/schema.sql`; seeded in `db/seed.sql`:

- `feedback_templates(id, branch_id, name, fields JSONB, created_at)` â€” a
  reusable form definition. `fields` = the question list.
- `feedback_campaigns(id, branch_id, template_id, title,
  status 'open'|'closed', created_at)` â€” one row per push.
- `feedback_responses(id, campaign_id, parent_id, answers JSONB, created_at,
  UNIQUE(campaign_id, parent_id))` â€” the UNIQUE constraint is what makes a
  submitted form vanish for that parent and gives 409 on a double-submit.

**No `student_id` on responses** (the contract wins over the prompt sketch):
answers belong to the PARENT account. A parent with two children answers once.
Reports show the parent's name (+ their children's names via
`students.parent_profile_id` when needed â€” reuse
`attendanceRepo.getChildrenOfParent`).

### 2.1 THE FIELD JSON SHAPE â€” CRITICAL, READ TWICE

The prompt file describes fields as `{"id":1,"question":"...","type":...}`.
**The seeded data (the real contract) uses a different shape.** The builder,
renderer and report MUST use the seed's shape or the seeded survey breaks:

```json
[
  {"id":"q1","type":"rating","label":"Teaching quality","max":5},
  {"id":"q2","type":"rating","label":"School communication","max":5},
  {"id":"q3","type":"text","label":"Suggestions for improvement"}
]
```

- keys are `id` (string like "q1"), `label` (NOT "question"), `type`.
- `type` âˆˆ `text` | `single_choice` | `rating` (`single_choice` adds
  `options: ["A","B",...]`; `rating` adds `max: 5`).
- `answers` in responses is `{ "q1": 4, "q2": 2, "q3": "Overall good." }` â€”
  keyed by field `id`.

### 2.2 Seed data you can test against TODAY

- 1 template ("Parent Satisfaction Survey", 3 fields above).
- 1 OPEN campaign: "Term 1 Parent Survey - July 2026".
- 40 seeded responses (parents where n % 10 = 0). **Test parent
  `9810000002` has NOT answered** â€” perfect for the fill-flow test.

## 3. Roles & permissions (mirror complaints)

| Action | parent | teacher | admin | bus |
|---|---|---|---|---|
| Fill an open campaign | yes (own branch) | 403 | - | 403 |
| Build templates / push / remind / close / report | 403 | 403 | yes | 403 |

Enforce server-side: `requireActiveApiSession(request)` then `requireRole`,
branch always from the session (every table here has `branch_id` except
responses â€” those join through `feedback_campaigns`).

## 4. The lifecycle

- Template: created once, reused forever. (Prompt defines no edit/delete â€”
  keep it that way in v1.)
- Campaign: `open` the moment it's pushed â†’ admin closes it manually
  (`status='closed'`). Closed campaigns stop accepting answers (409 on submit)
  but their report still works.
- Response: one per parent per campaign (the UNIQUE constraint). No edits
  after submit in v1 (the prompt never offers it).

## 5. Files to create (follow the established patterns)

Repos (ALL SQL lives here):
- `lib/repos/feedbackRepo.js`:
  - `saveTemplate({branchId, name, fields})`
  - `listTemplates(branchId)`
  - `createCampaign({branchId, templateId, title})`
  - `listCampaigns(branchId)` â€” each with response count
  - `getOpenCampaignsForParent(parentId, branchId)` â€” a LIST (a parent could
    have more than one pending; the prompt said "the open campaign" but a list
    is safer)
  - `getCampaignForFill(campaignId, branchId)` â€” campaign + template fields
  - `submitResponse({campaignId, parentId, answers})` â€” rely on the UNIQUE
    constraint; return a 409-shaped outcome on duplicate; also refuse when the
    campaign is closed or another branch's
  - `getPendingParents(campaignId, branchId)` â€” branch parents (role='parent',
    via their children's branch... decide: all `profiles` with role 'parent'
    in the branch) minus responders
  - `getCampaignResults(campaignId, branchId)` â€” all responses + template

API routes (`app/api/feedback/`):
- `templates/route.js` â€” GET list, POST create (admin)
- `campaigns/route.js` â€” GET list (admin) | GET `?open=1` pending-for-me
  (parent) | POST push (admin) | PATCH close (admin)
- `respond/route.js` â€” POST (parent; branch + open + not-already-answered)
- `report/[campaignId]/route.js` â€” GET (admin): the PDF report
- `campaigns/[campaignId]/remind/route.js` â€” POST (admin): notify pending
  parents

Components:
- `components/feedback/FormBuilder.js` (client) â€” add text / single-choice /
  rating questions; **reorder with UP/DOWN BUTTONS (owner's locked choice â€”
  do NOT install @dnd-kit)**; delete; live preview beside it.
- `components/feedback/FormRenderer.js` (client) â€” renders a fields array for
  filling (textareas, radio groups, 1â€“5 stars). Shared by the parent tab/page
  and the builder's preview.

Pages (role-first URLs, as always):
- `app/admin/feedback/page.js` â€” templates (use previous / create new) +
  campaigns list (response counts, pending list + Send Reminder, Close,
  Report buttons)
- `app/parent/feedback/[campaignId]/page.js` â€” the fill screen
- The parent complaints page pattern (`/complaints/parent`) shows how to add a
  "pending forms" entry point; alternatively a card on `/parent` when a form
  is waiting.
- Optional: `app/admin/feedback/report/[campaignId]/page.js` â€” an on-screen
  version of the report before/alongside the PDF.

Home-page cards: add a FEEDBACK link card to `app/admin/page.js` and (when a
pending-form indicator exists) `app/parent/page.js` â€” one `.card` each, same
as the attendance/fees/complaints cards.

## 6. The report (pdfkit is now INSTALLED â€” reuse the working example)

- `app/api/fees/receipt/[receiptNumber]/route.js` is a WORKING pdfkit route in
  this repo â€” copy its structure (stream to Buffer, `Content-Type:
  application/pdf`, `Content-Disposition: attachment`).
- `next.config.mjs` already has `serverExternalPackages: ["pdfkit"]` â€” WITHOUT
  it pdfkit 500s looking for its font files. Never remove that line.
- Font gotcha: built-in Helvetica can't draw â‚¹ (write "Rs " in PDFs). Ratings
  and percentages are plain digits, so this hardly matters here.
- Aggregation rules (from the prompt, sane): per question, in template order â€”
  - `text`: every answer listed with the parent's name.
  - `rating`: the average ("Average: 4.2 / 5") + count.
  - `single_choice`: percentage per option ("Yes â€” 78%, No â€” 22%").
  - Footer: "Submitted: X/Y parents". Unanswered parents simply don't appear.

## 7. Notifications (open question â€” see below)

When built, use `lib/notify.js` (`createNotification`) only, source `'fees'`â€¦
NO â€” source must be a schema-legal value; use `'system'`? NO â€” the right value
is in migration 003's CHECK list: there is no 'feedback' either. The legal
values are: broadcast, attendance, bus, **complaints**, fees, groups, leaves,
exams, admissions, timetable, profile, auth, promotion, system. Feedback has
no dedicated value â€” **use `'complaints'`? No. Use `'system'` is the
documented catch-all for cron/system, and this isn't that either. DECISION
NEEDED when building: either reuse `'complaints'` (it's the "03 feature"
bucket) or ask the owner to approve a one-line migration adding `'feedback'`
to the CHECK list (the 09 docs describe exactly how).**

## 8. Open questions for the owner (ask when building)

1. **Notification source value** (above) â€” reuse `'complaints'` or approve the
   tiny migration adding `'feedback'` to `notifications_source_check`.
2. **Buzz levels:** my recommendation â€” campaign push = bell only; "Send
   Reminder" = bell + phone buzz (kind `'reminder'`, priority `important`,
   only to parents who haven't answered). Confirm or adjust.
3. **Reminder cadence limits:** should "Send Reminder" be rate-limited (e.g.
   once per day per campaign) so an admin can't buzz 400 parents repeatedly?
4. **Report audience:** admin-only PDF, or also a parent-visible "my answer
   receipt"? (Prompt says admin-only.)
