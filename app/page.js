// The signed-in home page. Server component - it reads the session on the
// server, so an unauthenticated visitor never receives any of this HTML.
//
// Later features replace the placeholder below with a real role dashboard.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { findAuthProfileById } from "@/lib/repos/authRepo";
import LogoutButton from "@/components/auth/LogoutButton";

// Human-readable role names. The app's internal values stay lowercase.
const ROLE_LABEL = {
  admin: "Administrator",
  teacher: "Teacher",
  parent: "Parent",
  bus: "Bus staff",
};

export default async function HomePage() {
  // getSession() expects something with a .cookies.get(name) method. A server
  // component has no `request` object, so we hand it the cookie store, which
  // has exactly that shape.
  const cookieStore = await cookies();
  const session = await getSession({ cookies: cookieStore });

  if (!session) {
    redirect("/login");
  }

  const profile = await findAuthProfileById(session.profileId);

  // The account was deleted after the token was issued.
  if (!profile) {
    redirect("/login");
  }

  // THE KILL SWITCH. If profiles.session_epoch has moved past the epoch baked
  // into this token, the token is revoked - a password was changed, or an
  // admin forced a sign-out everywhere. Signature and expiry are checked in
  // lib/auth.js; this database comparison can only happen server-side.
  if (Number(profile.sessionEpoch ?? 0) !== Number(session.epoch ?? 0)) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="label-micro text-muted">SIGNED IN</p>

      <h1 className="mt-3 text-3xl">{profile.fullName}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="pill">{ROLE_LABEL[profile.role] ?? profile.role}</span>
        <span className="text-muted text-sm">{profile.phoneNumber}</span>
      </div>

      <div className="card mt-8 p-6">
        <p className="label-micro text-muted">YOUR DASHBOARD</p>
        <p className="mt-3 text-sm">
          Nothing here yet. The {ROLE_LABEL[profile.role] ?? profile.role} home
          screen is built in a later feature. Authentication, sessions and
          sign-out are working - that is what this page proves.
        </p>
      </div>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}