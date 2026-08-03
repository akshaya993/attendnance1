// app/api/auth/logout/route.js
// Signs out THIS device by deleting the session cookie.
//
// It deliberately does NOT bump profiles.session_epoch. That is the separate
// "log out everywhere" action - signing out of a school desktop should not
// kick you off your own phone. Password changes bump the epoch instead.
//
// POST only: a GET logout could be triggered by any <img> tag on any website.

import { NextResponse } from "next/server";
import { COOKIE_NAME, clearedSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({
    ok: true,
    data: { redirectTo: "/login" },
  });

  response.cookies.set(COOKIE_NAME, "", clearedSessionCookieOptions());
  return response;
}