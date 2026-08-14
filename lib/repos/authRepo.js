// lib/repos/authRepo.js
// THE ONLY FILE IN FEATURE 13 THAT CONTAINS SQL.
// API routes call these functions; they never write SQL themselves.
//
// DB CONTRACT (see the feature 13 decisions doc in context/features/):
//   - No CREATE / ALTER / DROP here, ever.
//   - Tables used: profiles (rw), otp_codes (rw), branches (r).
//   - profiles.session_epoch and profiles.password_changed_at come from
//     db/migrations/002_auth_columns.sql. Run it before using this file.
//   - Every query is parameterised. Never interpolate user input.
//   - Hashing is bcryptjs, cost 10, and happens in the ROUTE, not here.
//     This file only ever stores or reads an already-hashed value.

import { query } from "@/lib/db";

// ---------------------------------------------------------------- tuning
export const MAX_FAILED_LOGINS = 5;      // then the account locks
export const LOCKOUT_MINUTES = 15;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;       // wrong guesses per code
export const OTP_MAX_PER_YEAR = 30;      // per phone, rolling 365 days

// Everything the login flow needs, in one round trip.
// password_hash is included on purpose -- callers MUST NOT return it to the
// browser. Strip it before responding.
const PROFILE_AUTH_FIELDS = `
  id,
  branch_id            AS "branchId",
  role,
  full_name            AS "fullName",
  phone_number         AS "phoneNumber",
  email,
  password_hash        AS "passwordHash",
  must_change_password AS "mustChangePassword",
  failed_login_attempts AS "failedLoginAttempts",
  locked_until         AS "lockedUntil",
  session_epoch        AS "sessionEpoch",
  password_changed_at  AS "passwordChangedAt",
  last_login_at        AS "lastLoginAt"
`;

// =====================================================================
// PROFILE LOOKUPS
// =====================================================================

/** Login lookup. Returns null when the phone does not exist -- the caller
 *  must respond identically either way (anti-enumeration). */
export async function findAuthProfileByPhone(phoneNumber) {
  const { rows } = await query(
    `SELECT ${PROFILE_AUTH_FIELDS} FROM profiles WHERE phone_number = $1`,
    [phoneNumber]
  );
  return rows[0] ?? null;
}

export async function findAuthProfileById(profileId) {
  const { rows } = await query(
    `SELECT ${PROFILE_AUTH_FIELDS} FROM profiles WHERE id = $1`,
    [profileId]
  );
  return rows[0] ?? null;
}

/** Cheap check used on protected pages: is this token's epoch still current?
 *  One indexed primary-key read. */
export async function getSessionEpoch(profileId) {
  const { rows } = await query(
    `SELECT session_epoch AS "sessionEpoch" FROM profiles WHERE id = $1`,
    [profileId]
  );
  return rows[0] ? rows[0].sessionEpoch : null;
}

/**
 * Every admin's profile id in one branch. Added for Feature 03: a new
 * complaint must alert the office, and "the office" = every admin profile.
 * Returns an array of NUMBERS, ready for lib/notify.js recipient lists.
 */
export async function listAdminIdsByBranch(branchId) {
  const { rows } = await query(
    `SELECT id FROM profiles WHERE branch_id = $1 AND role = 'admin'`,
    [branchId]
  );
  return rows.map((row) => Number(row.id));
}

// =====================================================================
// LOGIN OUTCOMES
// =====================================================================

/**
 * Record a failed password attempt and lock the account on the 5th.
 * Done in ONE statement so two simultaneous wrong passwords cannot both
 * read "4 attempts" and both decide not to lock.
 * Returns { failedLoginAttempts, lockedUntil, justLocked }.
 */
export async function registerFailedLogin(profileId) {
  const { rows } = await query(
    `UPDATE profiles
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE
              WHEN failed_login_attempts + 1 >= $2
                THEN now() + ($3 || ' minutes')::interval
              ELSE locked_until
            END
      WHERE id = $1
      RETURNING failed_login_attempts AS "failedLoginAttempts",
                locked_until          AS "lockedUntil"`,
    [profileId, MAX_FAILED_LOGINS, String(LOCKOUT_MINUTES)]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    justLocked: row.failedLoginAttempts === MAX_FAILED_LOGINS,
  };
}

/** Successful login: clear the counter, clear any lock, stamp the time. */
export async function registerSuccessfulLogin(profileId) {
  const { rows } = await query(
    `UPDATE profiles
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = now()
      WHERE id = $1
      RETURNING last_login_at AS "lastLoginAt"`,
    [profileId]
  );
  return rows[0] ?? null;
}

// =====================================================================
// PASSWORD CHANGES
// =====================================================================

/**
 * Store a NEW bcryptjs hash and invalidate every existing session.
 * One statement, so hash / timestamp / epoch can never disagree:
 *   - password_changed_at = now()   -> feeds the admin 30-day rotation rule
 *   - session_epoch + 1             -> every cookie issued before this is dead
 *   - must_change_password = false  -> the forced-change prompt is satisfied
 *   - lockout cleared               -> a successful reset unlocks the account
 * Returns the NEW epoch so the caller can immediately mint a fresh cookie
 * and keep this device logged in.
 */
export async function setPassword(profileId, passwordHash) {
  const { rows } = await query(
    `UPDATE profiles
        SET password_hash = $2,
            password_changed_at = now(),
            must_change_password = false,
            session_epoch = session_epoch + 1,
            failed_login_attempts = 0,
            locked_until = NULL
      WHERE id = $1
      RETURNING session_epoch       AS "sessionEpoch",
                password_changed_at AS "passwordChangedAt"`,
    [profileId, passwordHash]
  );
  return rows[0] ?? null;
}

/** "Log out everywhere" without touching the password. */
export async function bumpSessionEpoch(profileId) {
  const { rows } = await query(
    `UPDATE profiles
        SET session_epoch = session_epoch + 1
      WHERE id = $1
      RETURNING session_epoch AS "sessionEpoch"`,
    [profileId]
  );
  return rows[0] ?? null;
}

/** Admin-only: force a password change on next login. */
export async function requirePasswordChange(profileId) {
  await query(
    `UPDATE profiles SET must_change_password = true WHERE id = $1`,
    [profileId]
  );
}

// =====================================================================
// OTP
// =====================================================================
// otp_codes is keyed by phone_number even when the code is DELIVERED by
// email. The phone number is the account identity; email is just transport.

/** The one and only OTP rate limit: 30 per phone per rolling 365 days.
 *  Counts real rows, so the history doubles as the audit trail.
 *  Served by the existing idx_otp_phone (phone_number, created_at DESC). */
export async function countOtpsInLastYear(phoneNumber) {
  const { rows } = await query(
    `SELECT count(*)::int AS used
       FROM otp_codes
      WHERE phone_number = $1
        AND created_at > now() - interval '365 days'`,
    [phoneNumber]
  );
  return rows[0].used;
}

/**
 * Store a new code. `codeHash` is a bcryptjs hash -- the 6 digits themselves
 * are NEVER stored, exactly like a password.
 * Any older unconsumed code for the same phone+purpose is retired first, so
 * only the newest code can ever be redeemed.
 */
export async function createOtp({ phoneNumber, codeHash, purpose }) {
  await query(
    `UPDATE otp_codes
        SET consumed_at = now()
      WHERE phone_number = $1
        AND purpose = $2
        AND consumed_at IS NULL`,
    [phoneNumber, purpose]
  );

  const { rows } = await query(
    `INSERT INTO otp_codes
       (phone_number, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
     RETURNING id, expires_at AS "expiresAt"`,
    [phoneNumber, codeHash, purpose, String(OTP_TTL_MINUTES)]
  );
  return rows[0];
}

/** The newest code that is still redeemable: not used, not expired,
 *  and not out of guesses. Returns null otherwise -- the caller must show
 *  the same generic error for all three cases. */
export async function findRedeemableOtp(phoneNumber, purpose) {
  const { rows } = await query(
    `SELECT id,
            code_hash AS "codeHash",
            attempts,
            expires_at AS "expiresAt"
       FROM otp_codes
      WHERE phone_number = $1
        AND purpose = $2
        AND consumed_at IS NULL
        AND expires_at > now()
        AND attempts < $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [phoneNumber, purpose, OTP_MAX_ATTEMPTS]
  );
  return rows[0] ?? null;
}

/** Wrong digits entered. Returns the new attempt count. */
export async function incrementOtpAttempts(otpId) {
  const { rows } = await query(
    `UPDATE otp_codes
        SET attempts = attempts + 1
      WHERE id = $1
      RETURNING attempts`,
    [otpId]
  );
  return rows[0] ? rows[0].attempts : null;
}

/** Correct code. Marking it consumed makes replay impossible.
 *  The WHERE guard means two racing requests cannot both win. */
export async function consumeOtp(otpId) {
  const { rows } = await query(
    `UPDATE otp_codes
        SET consumed_at = now()
      WHERE id = $1
        AND consumed_at IS NULL
      RETURNING id`,
    [otpId]
  );
  return Boolean(rows[0]);
}


// =====================================================================
// OTP RESEND COOLDOWN
// =====================================================================

/**
 * Minimum gap between two codes for the same phone + purpose.
 *
 * Deliberately SHORTER than the countdown the UI shows (60s). The server
 * refuses silently, so if the visible timer were the shorter of the two, a
 * click at zero could be thrown away with no code and no error message.
 */
export const OTP_COOLDOWN_SECONDS = 45;

/**
 * Seconds the caller must still wait before another code may be created.
 * Returns 0 when a code can be sent now, including when this phone number has
 * never been sent one.
 *
 * The elapsed time is worked out in SQL, not in JavaScript, so the comparison
 * uses the DATABASE clock -- created_at was written by the database, and the
 * app server's clock can drift a few seconds away from it.
 *
 * Served by the existing idx_otp_phone (phone_number, created_at DESC):
 * one index lookup, no table scan, no new index needed.
 */
export async function otpCooldownRemaining(phoneNumber, purpose) {
  const { rows } = await query(
    `SELECT GREATEST(
              0,
              $3::int - FLOOR(EXTRACT(EPOCH FROM (now() - created_at)))::int
            )::int AS "waitSeconds"
       FROM otp_codes
      WHERE phone_number = $1
        AND purpose = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [phoneNumber, purpose, OTP_COOLDOWN_SECONDS]
  );

  // No rows at all means no code was ever sent to this number -> no wait.
  return rows[0] ? rows[0].waitSeconds : 0;
}