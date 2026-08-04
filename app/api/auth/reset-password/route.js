import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { findAuthProfileById, setPassword } from "@/lib/repos/authRepo";
import {
  COOKIE_NAME,
  RESET_COOKIE,
  clearedSessionCookieOptions,
  getCookieValue,
  validatePassword,
  verifyResetToken,
} from "@/lib/auth";

// Same wording for "no cookie", "expired cookie" and "profile vanished".
// The caller learns only that they must start over, never why.
const EXPIRED = "Your verification has expired. Please request a new code.";

export async function POST(request) {
  try {
    // 1. The ONLY proof accepted here is the short-lived reset cookie that
    //    /api/auth/otp/verify sets. No phone number is read from the body,
    //    so a caller cannot aim this route at somebody else's account.
    const claim = await verifyResetToken(getCookieValue(request, RESET_COOKIE));
    if (!claim) {
      return NextResponse.json({ ok: false, error: EXPIRED }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    const profile = await findAuthProfileById(claim.profileId);
    if (!profile) {
      return NextResponse.json({ ok: false, error: EXPIRED }, { status: 401 });
    }

    // 2. Shape rules first - cheap checks before any bcrypt work.
    const problem = validatePassword(password, {
      phoneNumber: profile.phoneNumber,
    });
    if (problem) {
      return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Both passwords must match" },
        { status: 400 }
      );
    }

    // 3. Block re-using the password they just failed to remember. Someone who
    //    reset because of a suspected compromise gains nothing by setting the
    //    same string back.
    if (
      profile.passwordHash &&
      (await bcrypt.compare(password, profile.passwordHash))
    ) {
      return NextResponse.json(
        { ok: false, error: "Choose a password you have not used before" },
        { status: 400 }
      );
    }

    // 4. setPassword also stamps password_changed_at, clears
    //    must_change_password, clears any lockout, and bumps session_epoch -
    //    which instantly invalidates every existing session on every device.
    const passwordHash = await bcrypt.hash(password, 10);
    await setPassword(profile.id, passwordHash);

    // 5. Burn the reset cookie so it cannot set a second password, and clear
    //    any session cookie on this device - the epoch bump already killed it.
    const response = NextResponse.json({
      ok: true,
      data: { redirectTo: "/login" },
    });
    response.cookies.set(RESET_COOKIE, "", clearedSessionCookieOptions());
    response.cookies.set(COOKIE_NAME, "", clearedSessionCookieOptions());
    return response;
  } catch (err) {
    console.error("[auth/reset-password] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}