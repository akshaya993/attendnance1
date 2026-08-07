-- db/migrations/003_notification_kind.sql
-- Feature 09 (Notifications & Reminders). The ONLY DDL in this feature.
-- Run once:
--   psql -U school_app -d school -f db/migrations/003_notification_kind.sql
-- Safe to re-run: every statement is guarded.
--
-- WHY THIS FILE EXISTS AT ALL
--   db/schema.sql already ships notifications, notification_recipients and
--   device_tokens. Feature 09 creates NO tables. It adds exactly three things
--   the frozen v1.1 schema cannot express:
--     1. kind                        -> the notice / reminder split
--     2. notifications_source_check  -> source was never constrained
--     3. idx_notif_recipient_profile -> the bell's paging query has no index
--
-- db/schema.sql is the frozen v1.1 baseline and is NOT touched by this file.
-- `git diff db/schema.sql` must come back empty at the end of feature 09.
--
-- BACKFILL: none needed, but NOT because the table is empty - db/seed.sql
-- already creates 2 sample notifications (one to all roles, one to parents
-- only). They are handled correctly without any UPDATE:
--   kind   -> picks up DEFAULT 'notice', which is right for both of them
--   source -> already 'broadcast', inside the CHECK list below
-- PostgreSQL validates every existing row when ADD CONSTRAINT runs, so the
-- successful run of this file is itself proof that the seed data conforms.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kind  ('notice' | 'reminder')
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
--   Splits every notification into one of two families the product treats
--   differently:
--     'notice'   -> something that HAPPENED.  "Fees received for Aarav."
--     'reminder' -> something you must DO.    "Fees due in 3 days."
--
--   The admin composer offers both. The bell renders them with a different
--   colour accent and a different popup style so a parent can tell at a glance
--   whether a row needs action. NOTHING else differs: same table, same
--   recipient fan-out, same read tracking, same web push.
--
-- WHY THE EXISTING SCHEMA CANNOT ACCOMMODATE IT
--   The closest existing column is `source`. But `source` answers "which part
--   of the system produced this row", and BOTH families come out of the SAME
--   source: the fees module emits fees+notice on payment received, and
--   fees+reminder on payment due. Folding the split into `source` would mean
--   values like 'fees_reminder', doubling the value list forever and breaking
--   every existing `WHERE source = 'fees'` filter.
--   `priority` cannot carry it either. An urgent notice and an urgent reminder
--   are both urgent. The two axes are genuinely independent.
--
-- WHY THE NAME IS `kind`
--   `kind` names the QUESTION, not one of the answers. A column called
--   `reminder` would describe only half of its own values. `type` was rejected
--   because it collides with JS/React conventions used throughout this repo.
--   A boolean `is_reminder` was rejected because it locks the column to exactly
--   two values forever; TEXT + CHECK lets a later feature add 'alert' or
--   'announcement' in a one-line migration.
--
-- WHY THE VALUE IS 'notice' AND NOT 'notification'
--   Every row in a table named `notifications` is already a notification, so
--   kind = 'notification' would read as a tautology. The admin UI still shows
--   the words "Notification" and "Reminder" to humans. 'notice' is an internal
--   storage value, never a label.
--
-- DEFAULT 'notice' is deliberate: any caller that does not care about the
-- split keeps working untouched, and modules opt in to reminders explicitly.
--
-- The inline CHECK is auto-named notifications_kind_check by Postgres. On a
-- second run ADD COLUMN IF NOT EXISTS skips the column and the CHECK together.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'notice'
  CHECK (kind IN ('notice','reminder'));

-- ---------------------------------------------------------------------------
-- 2. CHECK constraint on source
-- ---------------------------------------------------------------------------
-- schema.sql declares `source TEXT NOT NULL DEFAULT 'broadcast'` with no
-- constraint. The feature-09 DB contract assumes a CHECK exists; it never did.
-- Without it a typo ('Fees' instead of 'fees') silently creates a second
-- bucket that no filter will ever match, and nothing errors.
--
-- One value per feature, so no future feature needs its own migration:
--   broadcast  09 admin-composed      attendance 01     bus        02
--   complaints 03                     fees       04     groups     05
--   leaves     06                     exams      07     admissions 08
--   timetable  10                     profile    11     auth       13
--   promotion  14                     system     catch-all / cron jobs
--
-- To add a value later: DROP CONSTRAINT then ADD CONSTRAINT in a new migration.
-- Never edit this file after it has been run in production.
--
-- Wrapped in DO because bare ADD CONSTRAINT has no IF NOT EXISTS form, and
-- this migration must stay re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_source_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_source_check
      CHECK (source IN (
        'broadcast','attendance','bus','complaints','fees','groups',
        'leaves','exams','admissions','timetable','profile','auth',
        'promotion','system'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. idx_notif_recipient_profile
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
--   Serves the bell panel's list query, which pages through one person's
--   notifications newest-first, read and unread together (Gmail style):
--
--     SELECT ... FROM notification_recipients
--      WHERE profile_id = $1 AND notification_id < $2
--      ORDER BY notification_id DESC
--      LIMIT 20;
--
-- WHY THE EXISTING INDEXES CANNOT SERVE IT
--   idx_notif_unread is PARTIAL: ON notification_recipients(profile_id)
--   WHERE is_read = false. Read rows are physically not in that index, so it
--   can answer the unread BADGE COUNT perfectly but can never answer a list
--   that includes read rows.
--   The primary key is (notification_id, profile_id) - profile_id is the
--   SECOND column, so Postgres cannot seek into it by person.
--   With neither index usable this becomes a sequential scan over a table that
--   reaches roughly 1.5M rows in year one (423 profiles x ~10 notifications a
--   day x 365). At that size the bell would take seconds to open.
--
--   notification_id DESC matches the ORDER BY exactly, so the planner reads
--   the index in order and stops after 20 rows instead of sorting the set.
--   Paging on notification_id (not created_at) means the cursor rides the
--   primary key: always unique, never ambiguous when two rows share a second.
CREATE INDEX IF NOT EXISTS idx_notif_recipient_profile
  ON notification_recipients(profile_id, notification_id DESC);

COMMIT;