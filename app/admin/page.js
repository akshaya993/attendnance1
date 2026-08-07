// The administrator's home screen. Deliberately EMPTY for now.
//
// DO NOT CREATE ANOTHER ADMIN HOME PAGE. This is it. Every feature that needs
// admin UI adds its section to THIS file, or links out to its own sub-route
// under /admin/... which proxy.js already restricts to admins.
//
// WHAT GOES HERE, BY FEATURE (add your row when you build it):
//   09 Notifications - link to the Broadcast Center at /admin/broadcast
//   01 Attendance    - school-wide attendance summary
//   04 Fees          - collection totals and overdue count
//   07 Marks         - exam and result status
//   08 Admissions    - pending applications count
//   14 Promotions    - year-end run controls
//
// The full editorial layout - sidebar on desktop, bottom tabs on mobile, per
// ui-context.md - is NOT built yet. It is scheduled as its own feature after
// Feature 09. Until then this is a plain centred column.

import { requireActiveSession } from "@/lib/guard";
import LogoutButton from "@/components/auth/LogoutButton";

export const metadata = { title: "Admin | Greenwood School" };

export default async function AdminHomePage() {
  // Session validity and the session_epoch kill switch. The ROLE check is done
  // by proxy.js (ROLE_PREFIXES), which runs before this page is ever reached.
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="label-micro text-muted">PORTAL / ADMIN</p>

      <h1 className="mt-3 text-3xl">{profile.fullName}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="pill">Administrator</span>
        <span className="text-muted text-sm">{profile.phoneNumber}</span>
      </div>

      <div className="card mt-8 p-6">
        <p className="label-micro text-muted">ADMIN TOOLS</p>
        <p className="mt-3 text-sm">
          Nothing here yet. Each feature adds its section to this page as it is
          built. Notifications is first.
        </p>
      </div>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}