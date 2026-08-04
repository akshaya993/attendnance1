// app/api/auth/otp/verify/route.js
// Check a one-time code. On success, issue a short-lived `reset` cookie that
// authorises exactly ONE thing: setting a new password.
//
// PUBLIC ROUTE (listed in proxy.js).
//
// WHY A SEPARATE COOKIE AND NOT A SESSION: a verified code proves the person
// can read the account's email or texts. That is enough to let them choose a
// new password, and NOTHING else. Handing out a real session here would mean
// anyone who intercepted one email got full access to a child's records
// without ever knowing the password.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import {
  findAuthProfileByPhone,
  findRedeemableOtp,
  incrementOtpAttempts,
  consumeOtp,
} from "@/lib/repos/authRepo";
import {
  RESET_COOKIE,
  createResetToken,
  resetCookieOptions,
} from "@/lib/auth";

const VALID_PURPOSES = new Set(["reset", "first_login"]);

// One message for every failure: wrong code, expired code, already-used code,
// out of guesses, and no such account. Telling them which would help an
// attacker narrow things down.
const GENERIC_ERROR = "That code is not valid or has expired. Request a new one.";

// Burned when there is no account, so the timing matches a real comparison.
const DUMMY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function POST(request) {
  try {
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
    const code = String(body?.code ?? "").trim();
    const purpose = String(body?.purpose ?? "reset").trim();

    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid 10-digit phone number" },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { ok: false, error: "Enter the 6-digit code" },
        { status: 400 }
      );
    }

    if (!VALID_PURPOSES.has(purpose)) {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    const genericFailure = NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 400 }
    );

    const profile = await findAuthProfileByPhone(phoneNumber);
    if (!profile) {
      await bcrypt.compare(code, DUMMY_HASH);
      return genericFailure;
    }

    // Null covers three cases at once: no code, expired code, out of guesses.
    const otp = await findRedeemableOtp(phoneNumber, purpose);
    if (!otp) {
      await bcrypt.compare(code, DUMMY_HASH);
      return genericFailure;
    }

    const matches = await bcrypt.compare(code, otp.codeHash);

    if (!matches) {
      // Burn one of the 5 guesses. After the 5th, findRedeemableOtp stops
      // returning this row at all and the code is dead.
      await incrementOtpAttempts(otp.id);
      return genericFailure;
    }

    // Mark it used BEFORE issuing the token. consumeOtp only succeeds if the
    // row was still unconsumed, so two simultaneous correct submissions
    // cannot both be granted a reset token.
    const consumed = await consumeOtp(otp.id);
    if (!consumed) {
      return genericFailure;
    }

    const token = await createResetToken(profile.id);

    const response = NextResponse.json({
      ok: true,
      data: { verified: true },
    });

    response.cookies.set(RESET_COOKIE, token, resetCookieOptions());

    return response;
  } catch (err) {
    console.error("[auth/otp/verify] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}