# Feature 09 — Notifications & Reminders — Decisions

Status: **code complete**. Built after Feature 13 (Auth), before Feature 01.
Branch at completion: `09-after-broadcast-ui`.

This file records WHY Feature 09 is shaped the way it is. It is the file to read
before touching notifications, push, or `lib/notify.js` from any other feature.

It is NOT a tutorial and NOT a copy of the code. Where the reason lives better
next to the code, the reason is in a comment there and this file only points at
it.

**DB CONTRACT REMINDER:** `db/schema.sql` is frozen. Feature 09 added exactly one
migration, `db/migrations/003_notification_kind.sql`, and nothing else.

---

## 1. Database

### 1.1 Why a `kind` column and not a second table

Notices and reminders differ only in how they LOOK. Same audience logic, same
fan-out, same read tracking, same bell. A second table would have duplicated
five queries to change one label and one colour, and the bell would have needed
a UNION to merge two streams back together for sorting.

### 1.2 Why the column is named `kind`

`kind` names the QUESTION, not one of the answers.

- `type` was rejected: it collides with `type` in JS and with `input type` in React.
- `is_reminder` was rejected: a boolean cannot grow. A third value (alert,
  circular) would have meant a migration and a rewrite of every branch.

Values are `'notice'` and `'reminder'`. **The UI labels them "NOTIFICATION" and
"REMINDER"** — the database word and the user-facing word are deliberately
allowed to differ, because `'notification'` inside a table called
`notifications` reads as nonsense.

### 1.3 Why `source` got a CHECK constraint with 14 values

`source` already existed with `DEFAULT 'broadcast'` and no constraint, so any
typo became permanent data. The 14 values are one per feature that will ever
create a notification:



broadcast attendance bus complaints fees groups leaves
exams admissions timetable profile auth promotion system



**If you are building a feature and your source is not in this list, add it to
the constraint in a new migration. Do not reuse `'system'` as a dumping ground.**

### 1.4 Why `idx_notif_recipient_profile` was needed

The bell pages backwards through history with keyset pagination:
`WHERE profile_id = $1 AND notification_id < $2 ORDER BY notification_id DESC`.

The pre-existing `idx_notif_unread` is a PARTIAL index (`WHERE is_read = false`),
so it cannot serve the history tab at all — history is by definition the read
rows. Without the new index, opening the bell was a sequential scan of every
recipient row in the school. At 423 people × every notification ever, that grows
without limit.

### 1.5 `device_tokens` needed no migration

It already existed in `db/schema.sql`, in the BUS section, because Feature 02
(live bus tracking) will push from the same table. Verified live against the
frozen schema, column for column. **Feature 09 added no DDL for push.**

### 1.6 Fan-out on write, not on read

A broadcast inserts one `notifications` row plus one `notification_recipients`
row per person — 423 rows for a school-wide send, in a single
`INSERT ... SELECT unnest(...)` inside one transaction.

The alternative (compute each person's list when they open the bell) was
rejected: unread counts are polled constantly and would each become a
multi-table audience calculation. Writing 423 small rows once is far cheaper
than recalculating for every poll, forever.

---

## 2. Architecture and file layout

### 2.1 SQL only in `lib/repos/`, orchestration in `lib/notify.js`

The pasted prompt file put SQL directly in `lib/notify.js`. That violates the
repo's iron rule. Resolution:

- `lib/repos/notificationRepo.js` — every notification SQL statement (7 functions)
- `lib/repos/deviceTokenRepo.js` — every push-subscription SQL statement (5 functions)
- `lib/notify.js` — validate → resolve audience → write → push → audit. **No SQL.**

### 2.2 Why `deviceTokenRepo.js` is separate from `notificationRepo.js`

1. Opposite lifetimes. A notification is written once and kept forever. A device
   token is deleted the moment a browser abandons it.
2. **Shared with Feature 02.** Bus tracking imports this one small file and
   nothing else.
3. `notificationRepo.js` was already 7 functions long.

There is no overlap of a single query between them. This is not duplication.

### 2.3 `lib/notificationConstants.js` — the client/server bridge

A `"use client"` component may never import a module that reaches `lib/db.js`.
But the compose form and `lib/notify.js` must agree on the list of priorities,
kinds and audiences, and on who is allowed to use each.

So the shared vocabulary lives in a file with **zero imports**, safe on both
sides. It exports `canUseAudience(role, audience)`, called twice on purpose:

- by the form, to decide which options to DRAW
- by `lib/notify.js`, to decide whether to ACCEPT

**Hiding a radio button stops nobody.** Both checks are required.

### 2.4 Every feature sends through `lib/notify.js`

No feature writes to `notifications` directly. That single entry point is what
guarantees audience rules, the audit row and the push attempt happen every time.

### 2.5 One composer component with a `role` prop

Rejected: two copies of `BroadcastComposer.js`, one per role. A copy means every
future change gets made once and forgotten once. The audience list is filtered
by `canUseAudience(role, ...)`, and the server re-checks the same function, so
the shared component cannot become a security hole.

### 2.6 Entry point is a header icon, not a home-page card

`components/notifications/ComposeButton.js` renders a `+` in the top bar,
reachable from every page. Two earlier attempts at a card on `/admin` failed:
the first was invisible against the surrounding surfaces, and a card is only
reachable from one page anyway.

`ComposeButton` is a **server** component. It needs no interactivity — it is a
link — and it reuses `canUseAudience(role, "classes")` so a parent never sees it.

Header icon order, left to right: **push prompt, compose, bell, theme,
profile (Feature 11)**.

### 2.7 `components/BackLink.js` lives at the components root

It is not notification-specific; every future feature page needs a back arrow.
It uses `<Link href>` and never `router.back()`, because `back()` depends on
browser history and lands people wherever they happened to come from.

---

## 3. Audience and permissions

### 3.1 The final permission matrix

| Audience | Admin | Teacher | Typical size |
| --- | --- | --- | --- |
| All Users | yes | **403** | 423 |
| All Parents | yes | **403** | 400 |
| All Teachers | yes | **403** | 20 |
| Specific class(es), any class | yes | yes | ~25–31 |
| Within class: parents only | yes | yes | ~25 |
| Within class: teachers only | yes | yes | ~3–6 |
| Within class: both | yes | yes | ~31 |
| Priority standard / important / urgent | all three | all three | — |

A teacher may reach **any** class, not only the classes they teach. Verified
live: a teacher sending school-wide receives
`403 You can only send to specific classes, not to the whole school`.

### 3.2 Teachers can hold unlimited classes

`teacher_class_assignments` is unique on the TRIPLE
`(teacher_id, class_id, subject_id)`, so nothing limits a teacher to one class.
Measured: teacher `9000000101` holds 10A, 9A, 8A, 5A, 2A.

### 3.3 'All Users' includes bus staff — deliberate reversal

The prompt file said `'all'` should mean every non-bus profile. Reversed: a
driver is a member of staff and "school closed tomorrow" concerns them more than
most. `'all'` = every profile in the branch = **423**.

**This is the one audience decision that deserves a second look before launch.**

### 3.4 Branch scoping is a JOIN, not a filter

Class-targeted sends resolve through
`JOIN classes c ON ... WHERE c.branch_id = $1`, so a class id from another branch
returns zero people rather than leaking. Branch id always comes from the session
cookie, never from the request body.

### 3.5 `DISTINCT` on parent ids stays even though it is currently a no-op

Two children in the same targeted class means one parent matched twice. Measured
today: zero such families. It stays because the day a sibling pair enrols, the
parent would otherwise get every message twice.

---

## 4. The bell

### 4.1 Polling every 30 seconds, not WebSockets or SSE

At 10,000 users one poll per 30s is roughly 333 requests/second of a single
indexed count. A persistent socket per user costs far more, and the payoff —
sub-second delivery of a school notice — is worth nothing. Mitigations already
in place: polling pauses when the tab is hidden, `idx_notif_unread` serves the
count, and the interval can be relaxed to 2–5 minutes now that push exists.

### 4.2 Two colour axes that must never merge

An early version used amber for BOTH "reminder" and "important", so a standard
reminder and an important notice looked identical.

- **Priority** drives the left stripe and the pill: `bg-line` / `bg-warn` / `bg-danger`
- **Kind** drives the label and its chip: notice is `text-muted`, reminder is `text-ok`

Priority answers *how much should I care*. Kind answers *what sort of thing is
this*. They are independent, so they get independent visual channels.

### 4.3 Gmail model, not an unread/history tab pair

The user's first request was two tabs, with read items moving to history. It was
changed to one greyed-out list, like Gmail and Slack: read items stay in place
and go quiet. Cheaper (no second query), and nothing ever "disappears" on
someone mid-read.

### 4.4 `markRead` is deliberately idempotent

`markRead` omits `AND is_read = false` and uses
`read_at = COALESCE(read_at, now())`, so pressing it twice is harmless and the
FIRST read time is preserved. `markAllRead` keeps the filter, because there its
`rowCount` is the number reported back to the user.

### 4.5 Relative time in the bell, absolute time in the Outbox

"3m ago" is what you want for something that just arrived. "7 Aug, 4:32 PM" is
what you want when proving to a parent when a notice went out.

---

## 5. Push notifications (PWA)

### 5.1 What we built

A Progressive Web App: `public/manifest.json`, `public/sw.js`, and
`components/notifications/PushSetup.js`, plus `lib/push.js` and
`app/api/notifications/subscribe/route.js`. Installable on Android, addable to
the home screen on iOS 16.4+, and wrappable for the Play Store later via
Trusted Web Activity with no code change.

### 5.2 The bell is the truth; push is the doorbell

Rows are committed BEFORE any push is attempted. The push call has no `await`
and its own `.catch`. If every push in the school fails, not one message is
lost — they are all in the bell with an unread badge.

`sendPushToProfiles` therefore **never throws**. An unhandled rejection in Node
can kill the process, and a notification delivery problem must never be able to
take down the school's portal.

### 5.3 `PUSH_PRIORITIES = ["urgent", "important"]`

`standard` is excluded on purpose. Cost is not the reason — push is free. The
scarce resource is **permission**: a pointless pop-up teaches a parent to press
Block, and once blocked the app can never ask again. `important` is included
because a missed "fees due in 3 days" costs a parent money.

One line to change if this ever needs revisiting.

### 5.4 Permission is requested from a button, never on page load

Safari and iOS require a user gesture. Chrome penalises sites that prompt on
load. The button is a bell-with-slash in `text-warn`, leftmost in the header,
and it **renders `null` forever once permission is settled** — so it never
returning is the success signal, not a bug.

It is also session-gated: a subscription is stored against a profile id, so
asking before sign-in would produce a subscription belonging to nobody.

### 5.5 `public/sw.js` has an intentionally empty `fetch` handler

Chrome requires a `fetch` listener to consider the app installable. It must stay
empty. **Every real page in this app is behind a login**, so a device-level
cache would serve one family member's data to whoever signs in next.

### 5.6 Subscriptions are normalised to three fields

`device_tokens` is UNIQUE on the whole JSONB value. Chrome sometimes attaches
`expirationTime: null` and sometimes does not, so the raw object would let one
phone occupy two rows and receive everything twice. Only
`{endpoint, keys:{p256dh, auth}}` is stored.

### 5.7 One browser, one owner

A browser holds exactly ONE push subscription per site, regardless of who is
signed in. Our own data proved the consequence — one WNS endpoint registered to
both profile 1266 (admin) and 1267 (teacher). On a shared family phone that is a
privacy leak. Two fixes:

- **On sign out**, `LogoutButton.js` calls `unsubscribe()` then
  `DELETE /api/notifications/subscribe`.
- **On subscribe**, `releaseEndpointFromOtherProfiles()` takes the endpoint away
  from anyone else still claiming it — for people who close the tab instead of
  signing out.

Three ordering rules in `LogoutButton.js`, all easy to get wrong: read the
endpoint before `unsubscribe()`; send the DELETE before `/api/auth/logout` while
the cookie is still valid; use `getRegistration()` and never
`serviceWorker.ready`, which never resolves when no worker exists and would hang
Sign out forever.

### 5.8 A subscription is permanently bound to the key that created it

Rotating the VAPID pair silently invalidates **every** existing subscription and
forces every user to allow notifications again. `PushSetup.js` therefore
byte-compares `subscription.options.applicationServerKey` against the current
key and re-subscribes on mismatch, because a mismatch otherwise produces
notifications that never arrive and no error anywhere.

**Settle the production key pair before launch.** Generate it ON THE PRODUCTION
SERVER at deploy time; it must never exist on a developer laptop.

### 5.9 A bad push config must never change an HTTP status code

`/api/notifications/subscribe` answers **200** with `pushReady: false` and a
human-readable `pushReason` when the server's own keys are wrong. Storing an
address and being able to deliver to it are separate concerns; the operator
should fix it, not the user retry.

`configure()` in `lib/push.js` caches FAILURES as well as successes, so a
corrected `.env.local` needs a **dev-server restart** to take effect.

### 5.10 Only 404 and 410 prune a token

Those two mean the subscription is permanently gone. Everything else — a
timeout, a 500 from the push service, a rejected signature — is transient or the
server's own fault, and deleting the row would silently unsubscribe an innocent
user. Sends go out in waves of 100 with `Promise.allSettled`, TTL 6 hours.

### 5.11 There are two off switches, and one is undetectable

| Where it is turned off | What the app sees | Can the app react? |
| --- | --- | --- |
| Browser site permission (padlock → Block) | `Notification.permission === "denied"` | Detect yes, re-prompt **never** |
| OS / app notification settings (Android Settings → Apps) | still `"granted"`; push succeeds; worker runs | **No. Undetectable on every platform.** |

The second case cannot be fixed by any web app, on any platform. The defence is
structural: **every push is also a bell row with an unread badge**, so silence
costs visibility, never the message.

### 5.12 Environment variables

Three lines in `.env.local`, which is gitignored and needs a dev-server restart
after editing:



NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=



The public key uses the `NEXT_PUBLIC_` prefix because both the browser and the
server read the same value, which is why there are three lines and not four.

**`VAPID_SUBJECT` must include the `mailto:` scheme.** A bare email address
produces `Vapid subject is not a valid URL` and cost a debugging session.

### 5.13 `proxy.js` excludes `manifest.json` by name

Not by a blanket `.json` extension — that would have exposed every future API
route ending in `.json` to unauthenticated access. `/sw.js` is already covered by
the existing `.js$` alternative. Both files must be reachable while signed out,
or the app is not installable.

### 5.14 The manifest hex values are the one hardcode exception

`app/globals.css` forbids hex in components. `manifest.json` and
`viewport.themeColor` are read before any CSS exists, so they must carry literal
values. **They must stay identical to `--bg-page`, `#0a0a0b`.**

---

## 6. The Outbox (Sent log)

### 6.1 No new table

Everything needed was already recorded: `created_by` says who sent it,
`notification_recipients` gives delivered and read counts by aggregation.

The filter is `source = 'broadcast' AND created_by IS NOT NULL` — that excludes
both system-generated notifications and the seeded rows that have no author.

### 6.2 Read counts are free

`count(r.profile_id) FILTER (WHERE r.is_read)` runs over rows already being
grouped. No extra query, no extra column, no counter to keep in sync.

### 6.3 Scope comes from the session, never the query string

`scope = role === "admin" ? "all" : "own"`, computed server-side.
Admins see every broadcast in the school with the sender's name; teachers see
only their own, without a name column.

### 6.4 Your own send does not appear in your own bell

Like Gmail: it is in Sent, not Inbox. The audience resolver returns the people
the message is FOR. This was reported as a bug and is correct behaviour.

### 6.5 `SentList.js` does not re-declare the bell's colour maps

It shows plain text labels. Duplicating `PRIORITY_STRIPE` and `KIND_STYLE` would
have created a second place to update on every palette change.

---

## 7. Security fixes made to already-shipped Feature 13 code

### 7.1 The missing epoch check — a real hole, found and closed

`app/api/branches/route.js` and `app/api/classes/route.js` verified the JWT but
**never compared `session_epoch`**. A stolen or old cookie kept working after a
password change, forever. Found while auditing which files Feature 09 would
touch, before writing any new code.

Both now call `requireActiveApiSession()`. Verified: `200` before the epoch bump,
`401` after.

**Every new API route must call `requireActiveApiSession()`, and every new server
page must call `requireActiveSession()`, as the first line.**

### 7.2 The loose check became a function

`lib/guard.js` now owns `getActiveSession()`, `requireActiveSession()` and
`requireActiveApiSession()`. `getActiveSession` is wrapped in React `cache()` so
layout and page collapse to one database query per request, and it returns null
without touching PostgreSQL when there is no cookie at all.

### 7.3 Role pages exist

`/admin`, `/teacher`, `/parent`, `/bus` were 404 while every feature assumed
they existed. `app/page.js` is now a role redirector. Each role has its own
page file so features can be added per role independently. Cross-role access
bounces to your own home page; cross-role API access returns 403. All six
combinations verified.

---

## 8. Bugs we hit, and the lesson from each

| Symptom | Real cause | Lesson |
| --- | --- | --- |
| `ERR_TOO_MANY_REDIRECTS` on `/login` | redirect target missing `?expired=1` | the escape hatch must be on every redirect to `/login` |
| `500` on change-password, then `404` on `/login` | stale `.next` cache | **wipe `.next` after adding any new file or route folder** |
| `Module not found: BroadcastComposer` / `BackLink` | a file in a multi-file batch was never created | **create new files with `New-Item -ItemType File -Force <path>` first** |
| `Export listForProfile doesn't exist` | a code fragment was pasted instead of a whole file | **complete files only, always** |
| Audit row leaked `classIds` on a school-wide send | audit detail built before knowing the send type | gate audit detail on `isClassSend` |
| Subscribe returned 500 with the row already saved | push config read inline in the response object | side concerns get their own try/catch AFTER the write |
| Push saved but never delivered | `VAPID_SUBJECT` had no `mailto:` | surface config errors as readable text, not as a 500 |
| No pop-up on the first end-to-end test | the broadcast was never actually sent | check the data before theorising |

Two more worth remembering:

- **A single build error paints the dev overlay on EVERY route**, so "the whole
  app is broken" usually means one missing import.
- **`db/seed.sql` surprised us four times.** It seeds notifications, and two
  `example.invalid` device_tokens rows. Grep it before assuming a table is empty:
  `Select-String -Path db\seed.sql -Pattern "<table>" -Context 0,6`

---

## 9. What Feature 09 owns

**Migration**
- `db/migrations/003_notification_kind.sql`

**Server logic**
- `lib/notify.js` — the only entry point for creating a notification
- `lib/push.js` — the only thing that talks to a push service (**shared with Feature 02**)
- `lib/notificationConstants.js` — shared vocabulary, zero imports
- `lib/repos/notificationRepo.js` — 7 functions
- `lib/repos/deviceTokenRepo.js` — 5 functions (**shared with Feature 02**)

**API**
- `app/api/notifications/route.js` — list, and `?count_only=true`
- `app/api/notifications/[id]/read/route.js`
- `app/api/notifications/read-all/route.js`
- `app/api/notifications/broadcast/route.js` — POST send, GET audience preview
- `app/api/notifications/sent/route.js`
- `app/api/notifications/subscribe/route.js` — POST and DELETE

**Pages**
- `app/admin/broadcast/page.js`, `app/teacher/broadcast/page.js`

**Components**
- `components/notifications/BellMenu.js`, `NotificationItem.js`
- `components/notifications/BroadcastComposer.js`, `BroadcastTabs.js`, `SentList.js`
- `components/notifications/ComposeButton.js`, `PushSetup.js`
- `components/BackLink.js` (shared, components root)

**PWA**
- `public/manifest.json`, `public/sw.js`, `public/icon-512.png`

**Modified outside Feature 09**
- `proxy.js` — matcher excludes `manifest.json`
- `app/layout.js` — header icons and PWA metadata
- `app/page.js`, `app/admin|teacher|parent|bus/page.js` — role pages
- `app/api/branches/route.js`, `app/api/classes/route.js` — epoch fix
- `components/auth/LogoutButton.js` — releases the push subscription
- `lib/guard.js` — created during the Feature 13 hardening

---

## 10. Open items for later features

1. **`'all'` includes bus staff.** Confirm before launch.
2. **Real VAPID keys, generated on the production server**, never on a laptop.
   Rotating them after real users subscribe forces everyone to re-allow.
3. **iPhone onboarding copy** — push requires Share → Add to Home Screen on iOS
   16.4+ and never works in a Safari tab.
4. **Real-device install and closed-app push are untested**, because service
   workers need HTTPS or `localhost` and the LAN IP is neither. Cheapest route
   is Chrome USB port forwarding.
5. **`public/icon-512.png` is actually 1024×1024.** The manifest declares
   `1024x1024` and is correct; a mismatched size makes Chrome silently discard
   the icon and kill installability. Consider a genuine 192 + 512 pair.
6. **The Android `badge` uses the full logo.** A badge wants a small monochrome
   silhouette. Cosmetic.
7. **`PushSetup.js` renders nothing when permission is `denied`.** A one-line
   hint pointing at the padlock menu would help.
8. **Relax bell polling to 2–5 minutes** now that push covers urgent messages.
9. **`lib/repos/coreRepo.js` returns raw `snake_case`** while every other repo
   returns `camelCase`. `BroadcastComposer.js` reads `cls.class_number` because
   of it. Fix both together or neither.
10. **A successful push logs nothing.** `sendPushToProfiles` returns
    `{sent, failed, removed}` and the fire-and-forget call discards it, so
    terminal silence cannot distinguish success from never-called.
11. **Test data to delete before launch:** notifications 9, 11, 12, and the two
    `example.invalid` device_tokens rows that `db/seed.sql` recreates on every run.
12. **`lib/db.js` pool max is 15.** PgBouncer needed past a few thousand
    concurrent users.

---

## 11. Measured facts (do not guess these)

- The branch has **one row, `id = 4`**. Never hardcode 1; use
  `(SELECT id FROM branches LIMIT 1)`.
- Audience sizes: **all 423, parents 400, teachers 20.**
- **Class 1 A is `id = 49`**: 25 parents + 6 teachers = 31 people.
- `pg` returns BIGINT as a JavaScript **string** and SMALLINT as a **number**.
  Notification ids arrive as `'11'`, not `11`. Counts are cast `::int`.
- Next.js 16 hands route-handler `params` over as a Promise — always
  `await params`.
- `session_epoch` is **SMALLINT**, not BIGINT.
- Edge on Windows subscribes through Microsoft WNS, so endpoints look like
  `https://wns2-pn1p.notify.windows.com/w/?token=...`.

---

## 12. Test evidence

Every gate below was run against live data and passed.

- Migration 003 applied, re-ran cleanly, and rejected an invalid `kind`.
- Bell: list, unread count, mark one read (idempotent), mark all read.
- Audience resolution: 423 / 400 / 20, class 1A = 31, zero duplicate parents.
- Broadcast end to end as admin, and class-scoped as a teacher.
- Teacher sending school-wide → **403**.
- Parent reading `/api/notifications/sent` → **403**.
- Role isolation: all six cross-role combinations bounce correctly.
- Outbox: admin sees 4 broadcasts with sender names, teacher sees only their 1.
- Audit: exactly one `notification.broadcast` row per send, with no leaked
  `classIds` on school-wide sends.
- Push: subscription saved, malformed subscription rejected with 400, and a
  **real Windows notification delivered** from an urgent broadcast.
- Sign out releases the subscription; a second person signing in on the same
  browser gets their own row and does not inherit the first person's.

  