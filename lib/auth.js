import { jwtVerify, SignJWT } from "jose";

// Feature 13 MUST reuse this cookie name when it writes the real login.
// Exported so app/api/auth/* routes set and clear the exact same cookie.
export const COOKIE_NAME = "session";

// Mirrors the CHECK constraint on profiles.role in db/schema.sql.
const VALID_ROLES = ["admin", "teacher", "parent", "bus"];

/**
 * Error that carries an HTTP status, so API routes can respond with the
 * correct code instead of a blanket 500.
 */
export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function getSecretKey() {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET missing from .env.local - sessions cannot be verified"
    );
  }
  return new TextEncoder().encode(secret);
}

function readCookie(request, name) {
  // NextRequest gives us a parsed cookie jar.
  if (request?.cookies?.get) {
    const hit = request.cookies.get(name);
    if (!hit) return null;
    return typeof hit === "string" ? hit : hit.value;
  }

  // Plain Request fallback: parse the raw header ourselves.
  const header = request?.headers?.get?.("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Read + verify the session cookie.
 * Returns { profileId, role, branchId, epoch, issuedAt } or null. NEVER throws
 * for a bad cookie - a missing/expired/forged token is simply "not logged in".
 *
 * This is async (jose verification is async), so callers MUST await it:
 *   const user = await getSession(request);
 */
export async function getSession(request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());

    const profileId = Number(payload.profileId ?? payload.sub);
    const branchId = Number(payload.branchId);
    const role = payload.role;

    // A token missing any of these is unusable - treat it as no session.
    if (!profileId || !branchId || !VALID_ROLES.includes(role)) return null;

    // epoch  = kill-switch counter. If profiles.session_epoch is bumped in the
    //          DB, every token minted before the bump is stale.
    // issuedAt = unix seconds, used to decide when to slide the session.
    const epoch = Number(payload.epoch ?? 0);
    const issuedAt = Number(payload.iat ?? 0);

    return { profileId, role, branchId, epoch, issuedAt };
  } catch (err) {
    // Expired, tampered, or signed with a different secret.
    console.warn("[auth] rejected session cookie:", err.message);
    return null;
  }
}

// Alias kept for the Task 2 prompt's naming. Feature 13 must keep this line.
export const getSessionUser = getSession;

/**
 * Gate a route to specific roles. Throws AuthError - the route's catch block
 * turns it into { ok:false, error } with err.status.
 *   const user = await getSession(request);
 *   requireRole(user, ["admin", "teacher"]);
 */
export function requireRole(user, roles) {
  if (!user) throw new AuthError("Not signed in", 401);

  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) {
    throw new AuthError("You do not have access to this resource", 403);
  }
  return user;
}

/* ==========================================================================
 * FEATURE 13 ADDITIONS - session minting, sliding renewal, reset tokens
 * ========================================================================== */

/**
 * How long a session lasts, per role.
 * Parents/teachers/bus staff use the app from phones and hate re-logging in,
 * so they get 100 days. Admins can move money and edit marks, so 30 days.
 */
export const SESSION_DAYS = {
  admin: 30,
  teacher: 100,
  parent: 100,
  bus: 100,
};

// A session is re-issued only after this many days have been used up. Without
// this we would mint a fresh JWT on every single request, which is wasteful.
export const REFRESH_AFTER_DAYS = 10;

// Admin passwords must be rotated this often. Other roles never expire.
export const ADMIN_PASSWORD_MAX_AGE_DAYS = 30;

// Short-lived cookie proving "you just passed an OTP check".
export const RESET_COOKIE = "reset";
export const RESET_TOKEN_MINUTES = 10;

export function sessionDaysForRole(role) {
  return SESSION_DAYS[role] ?? 30;
}

/**
 * Mint a signed session JWT. Called by /api/auth/login and by the sliding
 * renewal path. `epoch` must be the CURRENT profiles.session_epoch value.
 */
export async function createSessionToken({ profileId, role, branchId, epoch }) {
  const days = sessionDaysForRole(role);

  return await new SignJWT({
    profileId: Number(profileId),
    role,
    branchId: Number(branchId),
    epoch: Number(epoch ?? 0),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(profileId))
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(getSecretKey());
}

/**
 * Cookie options for the session cookie.
 * httpOnly  - JavaScript cannot read it, so an XSS bug cannot steal the token.
 * sameSite  - "lax" blocks cross-site POSTs while keeping normal links working.
 * secure    - HTTPS only in production. Off in dev so localhost works.
 */
export function sessionCookieOptions(role) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDaysForRole(role) * 24 * 60 * 60,
  };
}

// Same options with maxAge 0, which tells the browser to delete the cookie.
export function clearedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

/**
 * True when the session is old enough to be worth re-issuing (sliding window).
 */
export function shouldRefreshSession(session) {
  if (!session?.issuedAt) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - session.issuedAt;
  return ageSeconds > REFRESH_AFTER_DAYS * 24 * 60 * 60;
}

/**
 * Admin-only 30 day password rotation.
 * A NULL passwordChangedAt counts as expired - we cannot prove it is fresh.
 */
export function isPasswordExpired(role, passwordChangedAt) {
  if (role !== "admin") return false;
  if (!passwordChangedAt) return true;

  const changed = new Date(passwordChangedAt).getTime();
  if (Number.isNaN(changed)) return true;

  const ageDays = (Date.now() - changed) / (24 * 60 * 60 * 1000);
  return ageDays > ADMIN_PASSWORD_MAX_AGE_DAYS;
}

/**
 * Proof-of-OTP token. Stored in its own short-lived cookie so the browser
 * never has to hold the OTP code itself. purpose:"reset" stops anyone from
 * replaying a session token here, or a reset token as a session.
 */
export async function createResetToken(profileId) {
  return await new SignJWT({ profileId: Number(profileId), purpose: "reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(profileId))
    .setIssuedAt()
    .setExpirationTime(`${RESET_TOKEN_MINUTES}m`)
    .sign(getSecretKey());
}

export async function verifyResetToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== "reset") return null;

    const profileId = Number(payload.profileId ?? payload.sub);
    if (!profileId) return null;

    return { profileId };
  } catch {
    return null;
  }
}

export function resetCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RESET_TOKEN_MINUTES * 60,
  };
}

// Public wrapper so routes and middleware can read any cookie by name.
export function getCookieValue(request, name) {
  return readCookie(request, name);
}


/* ==========================================================================
 * PASSWORD POLICY - shared by reset-password and change-password
 * ========================================================================== */

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt only hashes the first 72 BYTES of input and silently discards the
// rest. Rejecting longer input is honest; accepting it would mean characters
// the user typed were never part of their password.
export const PASSWORD_MAX_BYTES = 72;

/**
 * Returns an error message string, or null when the password is acceptable.
 * Kept here (not in a route) so both password routes enforce identical rules.
 * Uses TextEncoder rather than Buffer, because lib/auth.js is also imported by
 * proxy.js which runs on the Edge runtime where Buffer does not exist.
 */
export function validatePassword(password, { phoneNumber } = {}) {
  if (typeof password !== "string" || password.length === 0) {
    return "Enter a new password";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "Password is too long";
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must include at least one letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number";
  }
  if (phoneNumber && password === phoneNumber) {
    return "Password cannot be your phone number";
  }
  return null;
}