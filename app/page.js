// The signed-in home page. Server component - it reads the session on the
// server, so an unauthenticated visitor never receives any of this HTML.
//
// Later features replace the placeholder below with a real role dashboard.

import { requireActiveSession } from "@/lib/guard";
import LogoutButton from "@/components/auth/LogoutButton";

// Human-readable role names. The app's internal values stay lowercase.
const ROLE_LABEL = {
  admin: "Administrator",
  teacher: "Teacher",
  parent: "Parent",
  bus: "Bus staff",
};

export default async function HomePage() {
  // One call replaces the four checks that used to be written out here:
  // valid cookie -> profile still exists -> session_epoch still current ->
  // forced password change. The logic moved to lib/guard.js so that every
  // page and API route reuses it instead of copy-pasting it.
  // Reasoning: context/features/09-notifications/09-0-decisions.md
  const { profile } = await requireActiveSession();

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