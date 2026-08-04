import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { findAuthProfileById, setPassword } from "@/lib/repos/authRepo";
import {
  COOKIE_NAME,
  createSessionToken,
  getSession,
  sessionCookieOptions,
  validatePassword,
} from "@/lib/auth";

const NOT_SIGNED_IN = "Not signed in";
const SESSION_ENDED = "Your session has ended. Please sign in again.";

export async function POST(request) {
  try {
    // 1. Signature check on the cookie.
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: NOT_SIGNED_IN },
        { status: 401 }
      );
    }

    const profile = await findAuthProfileById(session.profileId);
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: NOT_SIGNED_IN },
        { status: 401 }
      );
    }

    // 2. Kill-switch check. proxy.js cannot do this (Edge has no pg), so every
    //    route that matters repeats it against the live database value.
    if (Number(profile.sessionEpoch) !== Number(session.epoch)) {
      return NextResponse.json(
        { ok: false, error: SESSION_ENDED },
        { status: 401 }
      );
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

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword) {
      return NextResponse.json(
        { ok: false, error: "Enter your current password" },
        { status: 400 }
      );
    }

    if (!profile.passwordHash) {
      return NextResponse.json(
        { ok: false, error: SESSION_ENDED },
        { status: 401 }
      );
    }

    // 3. A valid session is NOT enough. An unlocked phone left on a table must
    //    not be able to take the account over silently.
    const currentOk = await bcrypt.compare(currentPassword, profile.passwordHash);
    if (!currentOk) {
      return NextResponse.json(
        { ok: false, error: "Your current password is incorrect" },
        { status: 401 }
      );
    }

    const problem = validatePassword(newPassword, {
      phoneNumber: profile.phoneNumber,
    });
    if (problem) {
      return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Both passwords must match" },
        { status: 400 }
      );
    }

    // Plain string compare is enough - we already proved currentPassword is
    // the real one, so no second bcrypt call is needed here.
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { ok: false, error: "Choose a password you have not used before" },
        { status: 400 }
      );
    }

    // 4. Save. The epoch bump inside setPassword logs out every OTHER device.
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { sessionEpoch } = await setPassword(profile.id, passwordHash);

    // 5. Re-mint THIS device's cookie at the new epoch, so the person who just
    //    changed their own password is not thrown back to the login screen.
    const token = await createSessionToken({
      profileId: profile.id,
      role: profile.role,
      branchId: profile.branchId,
      epoch: sessionEpoch,
    });

    const response = NextResponse.json({
      ok: true,
      data: { redirectTo: "/" },
    });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions(profile.role));
    return response;
  } catch (err) {
    console.error("[auth/change-password] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}