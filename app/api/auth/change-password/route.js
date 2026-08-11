import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { setPassword } from "@/lib/repos/authRepo";
import { deleteDeviceTokensForProfile } from "@/lib/repos/deviceTokenRepo";
import {
  COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  validatePassword,
} from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";

// Used only when a profile somehow has no password hash at all. The
// "not signed in" and epoch-mismatch messages now come from lib/guard.js.
const SESSION_ENDED = "Your session has ended. Please sign in again.";

export async function POST(request) {
  try {
    // Session, profile existence, and the session_epoch kill-switch, in one
    // call. This used to be ~25 lines copy-pasted from app/page.js; there is
    // now exactly one copy, in lib/guard.js.
    //
    // NOTE: requireActiveApiSession deliberately does NOT enforce
    // mustChangePassword. This is the route that CLEARS that flag, so
    // enforcing it here would trap the user with no way out.
    const { profile } = await requireActiveApiSession(request);

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

    // A valid session is NOT enough. An unlocked phone left on a table must
    // not be able to take the account over silently.
    const currentOk = await bcrypt.compare(
      currentPassword,
      profile.passwordHash
    );
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

    // Save. The epoch bump inside setPassword logs out every OTHER device.
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { sessionEpoch } = await setPassword(profile.id, passwordHash);

    // THE SIGN-OUT RULE: no login, no notifications.
    //
    // The epoch bump above signed every other device out, so every other device
    // must stop buzzing too. There is no way to release only the others - this
    // route never learns which browser is calling it - so ALL of this account's
    // push subscriptions go.
    //
    // THIS DEVICE HEALS ITSELF, IN UNDER A SECOND. On success the browser is
    // sent to "/", components/notifications/PushSetup.js re-subscribes on every
    // load where permission is already granted, and saveDeviceToken upserts. So
    // this browser gets its row straight back while every other device stays
    // silent until somebody signs in on it again. That is the whole point.
    //
    // THE FAILURE IS SWALLOWED ON PURPOSE. The password is already changed by
    // this line. Throwing here would show an error for something that actually
    // succeeded, and the user would try again using a password that is now the
    // old one. A stale push row is a far smaller problem than that.
    try {
      await deleteDeviceTokensForProfile(profile.id);
    } catch (err) {
      console.error(
        "[auth/change-password] could not release push subscriptions",
        err
      );
    }

    // Re-mint THIS device's cookie at the new epoch, so the person who just
    // changed their own password is not thrown back to the login screen.
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
    response.cookies.set(
      COOKIE_NAME,
      token,
      sessionCookieOptions(profile.role)
    );
    return response;
  } catch (err) {
    // requireActiveApiSession throws AuthError(401). Without this branch it
    // would fall through to the 500 below, and app/first-login/page.js checks
    // for a 401 to decide whether to send the user back to /login.
    if (err.name === "AuthError") {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[auth/change-password] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}