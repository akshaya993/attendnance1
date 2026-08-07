// lib/guard.js
// THE ONLY PLACE THE SESSION KILL-SWITCH IS CHECKED.
//
// WHY THIS FILE EXISTS
// proxy.js verifies the cookie's SIGNATURE, but it runs on the Edge runtime,
// which cannot reach PostgreSQL. So it can never know whether a session was
// revoked - profiles.session_epoch bumped by a password change or a forced
// "sign out everywhere". That comparison has to happen where pg is reachable.
//
// Before this file, that logic was written inline in app/page.js, copied again
// into app/api/auth/change-password/route.js, and MISSING ENTIRELY from
// /api/branches and /api/classes - which meant a revoked cookie could still
// read data from those two routes. This file is now the single source.
//
// STANDING RULE FOR EVERY FUTURE FEATURE (01, 02, 04, 05, 07, 10, 11, 12, 14):
//   server PAGE  -> first line is `await requireActiveSession()`
//   API ROUTE    -> first line is `await requireActiveApiSession(request)`
//   layout, or a page that also renders while signed out -> getActiveSession()
//
// NEVER call requireActiveSession() from /login, /first-login or
// /forgot-password. Those pages must render for someone with no valid session.
// Guarding them creates an infinite redirect loop.
//
// DB CONTRACT: no DDL and no SQL here. All reads go through lib/repos/authRepo.js.

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthError, getSession, isPasswordExpired } from "@/lib/auth";
import { findAuthProfileById } from "@/lib/repos/authRepo";

const NOT_SIGNED_IN = "Not signed in";
const SESSION_ENDED = "Your session has ended. Please sign in again.";

/**
 * SERVER COMPONENTS. Returns { session, profile }, or null when there is no
 * live session. Never throws and never redirects, so it is safe in
 * app/layout.js - which also renders on /login, where nobody is signed in.
 *
 * Wrapped in React cache(): app/layout.js, the page inside it and <BellMenu/>
 * can all call this during the SAME request and only ONE database round trip
 * happens. Without cache() the notification bell would triple the cost of
 * every single page load.
 */
export const getActiveSession = cache(async () => {
  // A server component has no `request`, but getSession() only needs
  // something with .cookies.get(name) - and the cookie store has that shape.
  const cookieStore = await cookies();

  // Step 1: cookie present, unexpired, correctly signed?
  const session = await getSession({ cookies: cookieStore });
  if (!session) return null;

  // Step 2: does the profile still exist? (deleted after the token was issued)
  const profile = await findAuthProfileById(session.profileId);
  if (!profile) return null;

  // Step 3: THE KILL SWITCH.
  // session_epoch is SMALLINT (db/migrations/002_auth_columns.sql), which
  // node-postgres returns as a real JavaScript number - so these two would
  // compare correctly even without Number(). It stays as a deliberate guard:
  // if the column is ever widened to BIGINT, pg starts returning it as a
  // STRING, and "3" !== 3 would silently sign out the entire school.
  if (Number(profile.sessionEpoch ?? 0) !== Number(session.epoch ?? 0)) {
    return null;
  }

  return { session, profile };
});

/**
 * SERVER PAGES. Same checks, but redirects instead of returning null, and also
 * enforces the forced password change.
 *
 * Call it as the FIRST line of every protected server page:
 *   const { session, profile } = await requireActiveSession();
 */
export async function requireActiveSession() {
  const active = await getActiveSession();
  // ?expired=1 tells proxy.js this is a legitimate arrival at /login and it
  // must NOT bounce us back to /. Without the marker, proxy.js sees a cookie
  // that is still validly SIGNED, assumes we are logged in, and sends us to /
  // - which lands here again. That is an infinite redirect loop, and it fires
  // on every password change on every other device. See proxy.js.
  //
  // The value must be exactly "1". A bare "?expired" does not match.
  if (!active) redirect("/login?expired=1");

  const { profile } = active;

  // FORCED PASSWORD CHANGE. The login route already sends people to
  // /first-login, but that alone is skippable by typing "/" in the address
  // bar. Enforcing it here is what actually makes the admin 30-day rotation
  // binding - and now it protects every page, not just the home page.
  if (
    Boolean(profile.mustChangePassword) ||
    isPasswordExpired(profile.role, profile.passwordChangedAt)
  ) {
    redirect("/first-login");
  }

  return active;
}

/**
 * API ROUTES. Throws AuthError(message, 401), which every route's existing
 * catch block already turns into { ok:false, error } with the right status.
 *
 * Deliberately does NOT enforce mustChangePassword: /api/auth/change-password
 * is the route people use to CLEAR that flag, so blocking it there would trap
 * them with no way out.
 *
 * Not wrapped in cache() - a route handler calls this once.
 *
 * Usage keeps the existing route shape intact:
 *   const { session: user } = await requireActiveApiSession(request);
 *   requireRole(user, ["admin"]);
 */
export async function requireActiveApiSession(request) {
  const session = await getSession(request);
  if (!session) throw new AuthError(NOT_SIGNED_IN, 401);

  const profile = await findAuthProfileById(session.profileId);
  if (!profile) throw new AuthError(NOT_SIGNED_IN, 401);

  if (Number(profile.sessionEpoch ?? 0) !== Number(session.epoch ?? 0)) {
    throw new AuthError(SESSION_ENDED, 401);
  }

  return { session, profile };
}