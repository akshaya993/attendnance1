-- db/migrations/002_auth_columns.sql
-- Feature 13 (Auth). The ONLY DDL in this feature.
-- Run once:
--   psql -U school_app -d school -f db/migrations/002_auth_columns.sql
-- Safe to re-run: IF NOT EXISTS guards every statement.
--
-- WHY:
--   session_epoch       -> invalidate every existing login token instantly
--                          (password change, reset, "log out everywhere")
--   password_changed_at -> admin password rotation every 30 days
--
-- This file does NOT modify db/schema.sql. schema.sql stays frozen.
-- No new tables. No new indexes. otp_codes already exists.

BEGIN;

-- Bumped on password change / reset / forced logout.
-- Every JWT carries the value that was current when it was issued;
-- a mismatch means the token is stale and is rejected.
-- SMALLINT (max 32767) is far more bumps than any human will ever do.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS session_epoch SMALLINT NOT NULL DEFAULT 0;

-- Timestamp of the last successful password change.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Backfill: treat the seeded password as "set when the account was created".
-- Without this every existing row is NULL, which the app reads as
-- "never changed" and would force an immediate reset on first login --
-- blocking your own testing on day one.
UPDATE profiles
   SET password_changed_at = created_at
 WHERE password_changed_at IS NULL;

COMMIT;