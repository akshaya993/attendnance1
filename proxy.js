// proxy.js
// Runs before EVERY request. The single front door to the app.
//
// FILENAME NOTE: in Next.js 16 the "middleware.js" file convention was
// deprecated and renamed to "proxy.js", and the exported function renamed
// from `middleware` to `proxy`. A file called middleware.js is now SILENTLY
// IGNORED - no error, no warning. Do not rename this file back.
//
// RUNTIME LIMIT: this executes on the Edge runtime, which cannot load `pg`.
// So it can only verify the JWT signature and expiry. It CANNOT check
// profiles.session_epoch. Every Node-side page or route that handles real
// data must ALSO compare session.epoch against the database value - call
// lib/guard.js rather than writing that check out again.
//
// POLICY: default-deny. Anything not listed below needs a valid session.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Pages a signed-out person must be able to reach.
const PUBLIC_PAGES = new Set(["/login", "/forgot-password"]);

// API routes a signed-out person must be able to call.
// /api/health stays open so uptime monitoring keeps working.
// The OTP and reset routes are open because a locked-out user has no session -
// that is the entire point of a password reset.
const PUBLIC_APIS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/otp/send",
  "/api/auth/otp/verify",
  "/api/auth/reset-password",
]);

// Which roles may enter which URL prefix. Later features build these pages;
// the rules are declared here now so nobody has to remember to add them.
const ROLE_PREFIXES = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/teacher", roles: ["teacher"] },
  { prefix: "/parent", roles: ["parent"] },
  { prefix: "/bus", roles: ["bus"] },
];

function jsonUnauthorized(message, status) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // ---------- public routes ----------
  if (PUBLIC_APIS.has(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.has(pathname)) {
    // Already signed in? Don't show the login form again.
    //
    // EXCEPT when ?expired=1 is present. lib/guard.js appends that marker when
    // it rejects a session whose epoch no longer matches the database. Without
    // this escape hatch the app deadlocks: the guard sends the user to /login
    // because the session is revoked, and this block sends them straight back
    // to / because the cookie is still validly SIGNED. proxy.js runs on the
    // Edge runtime and cannot read profiles.session_epoch to know any better.
    // Symptom: ERR_TOO_MANY_REDIRECTS after any password change, on every
    // other device the user owns.
    //
    // The value must be exactly "1". A bare "?expired" makes .get() return an
    // empty string, which fails this test and lets the bounce happen anyway.
    // Both lib/guard.js and app/first-login/page.js must send "?expired=1".
    //
    // The marker is not security-sensitive - the worst it can do is show the
    // login form, which is public anyway.
    const expired = request.nextUrl.searchParams.get("expired") === "1";
    const session = await getSession(request);

    if (session && pathname === "/login" && !expired) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // ---------- everything else needs a session ----------
  const session = await getSession(request);

  if (!session) {
    // An API caller wants JSON, not an HTML login page.
    if (isApi) {
      return jsonUnauthorized("Not signed in", 401);
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ---------- role gates ----------
  const gate = ROLE_PREFIXES.find(
    (entry) =>
      pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  );

  if (gate && !gate.roles.includes(session.role)) {
    if (isApi) {
      return jsonUnauthorized("You do not have access to this resource", 403);
    }
    // Send them home rather than showing a scary error. Home already knows
    // what to render for their role.
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// Which requests the proxy runs on. Static files, images and the Next.js
// internals are excluded - running auth checks on a CSS file wastes time on
// every single request.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|css|js)$).*)",
  ],
};