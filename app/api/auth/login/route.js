// app/api/auth/login/route.js
// Password login. THE primary way into the app. OTP is only for resets.
//
// Order (see the code standards doc in context/): validate -> repo -> decide -> respond.
// No SQL here; every query lives in lib/repos/authRepo.js.
//
// ANTI-ENUMERATION: an unknown phone and a wrong password produce the same
// message, the same status code, AND roughly the same response time.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import {
  findAuthProfileByPhone,
  registerFailedLogin,
  registerSuccessfulLogin,
  MAX_FAILED_LOGINS,
  LOCKOUT_MINUTES,
} from "@/lib/repos/authRepo";
import {
  COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  isPasswordExpired,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// A real bcrypt hash of a value nobody will ever type. Compared against when
// the phone number does not exist, purely so the response takes the same
// ~85ms as a real check. Without it, response time leaks which phone numbers
// belong to real accounts.
const DUMMY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const GENERIC_ERROR = "Incorrect phone number or password";

export async function POST(request) {
  try {
    // ---------- validate ----------
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    const phoneNumber = String(body?.phoneNumber ?? "").trim();
    const password = String(body?.password ?? "");

    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid 10-digit phone number" },
        { status: 400 }
      );
    }
    if (password.length < 1) {
      return NextResponse.json(
        { ok: false, error: "Enter your password" },
        { status: 400 }
      );
    }

    // ---------- look up ----------
    const profile = await findAuthProfileByPhone(phoneNumber);

    if (!profile) {
      await bcrypt.compare(password, DUMMY_HASH); // timing equaliser
      return NextResponse.json(
        { ok: false, error: GENERIC_ERROR },
        { status: 401 }
      );
    }

    // ---------- locked? ----------
    if (profile.lockedUntil && new Date(profile.lockedUntil) > new Date()) {
      const minutesLeft = Math.max(
        1,
        Math.ceil((new Date(profile.lockedUntil) - new Date()) / 60000)
      );
      return NextResponse.json(
        {
          ok: false,
          error: `Too many failed attempts. Try again in ${minutesLeft} minute${
            minutesLeft === 1 ? "" : "s"
          }.`,
        },
        { status: 423 }
      );
    }

    // ---------- verify ----------
    const passwordOk = await bcrypt.compare(password, profile.passwordHash);

    if (!passwordOk) {
      const outcome = await registerFailedLogin(profile.id);

      if (outcome?.justLocked) {
        await logAudit({
          branchId: profile.branchId,
          actorId: profile.id,
          action: "auth.lockout",
          entityType: "profile",
          entityId: profile.id,
          details: {
            phoneNumber: profile.phoneNumber,
            role: profile.role,
            failedAttempts: MAX_FAILED_LOGINS,
            lockoutMinutes: LOCKOUT_MINUTES,
          },
        });

        return NextResponse.json(
          {
            ok: false,
            error: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        { ok: false, error: GENERIC_ERROR },
        { status: 401 }
      );
    }

    // ---------- success ----------
    await registerSuccessfulLogin(profile.id);

    // Only admin logins are audited. Auditing 400 parents daily would bury
    // the events that actually matter.
    if (profile.role === "admin") {
      await logAudit({
        branchId: profile.branchId,
        actorId: profile.id,
        action: "auth.admin_login",
        entityType: "profile",
        entityId: profile.id,
        details: { phoneNumber: profile.phoneNumber },
      });
    }

    // Forced password change: either an admin set the flag, or this is an
    // admin whose password is older than 30 days.
    const mustChangePassword =
      Boolean(profile.mustChangePassword) ||
      isPasswordExpired(profile.role, profile.passwordChangedAt);

    const token = await createSessionToken({
      profileId: Number(profile.id),
      role: profile.role,
      branchId: profile.branchId,
      epoch: profile.sessionEpoch,
    });

    // NOTE: passwordHash is never in this payload. Keep it that way.
    const response = NextResponse.json({
      ok: true,
      data: {
        profileId: Number(profile.id),
        role: profile.role,
        fullName: profile.fullName,
        mustChangePassword,
        redirectTo: mustChangePassword ? "/first-login" : "/",
      },
    });

    response.cookies.set(
      COOKIE_NAME,
      token,
      sessionCookieOptions(profile.role)
    );

    return response;
  } catch (err) {
    console.error("[auth/login] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}