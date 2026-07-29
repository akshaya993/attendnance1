import { jwtVerify } from "jose";

// Feature 13 MUST reuse this cookie name when it writes the real login.
const COOKIE_NAME = "session";

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
 * Returns { profileId, role, branchId } or null. NEVER throws for a bad
 * cookie - a missing/expired/forged token is simply "not logged in".
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

    return { profileId, role, branchId };
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