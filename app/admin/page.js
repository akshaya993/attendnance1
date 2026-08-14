// The administrator's home screen. Deliberately EMPTY for now.
//
// DO NOT CREATE ANOTHER ADMIN HOME PAGE. This is it. Every feature that needs
// admin UI adds its section to THIS file, or links out to its own sub-route
// under /admin/... which proxy.js already restricts to admins.
//
// WHAT GOES HERE, BY FEATURE (add your row when you build it):
//   09 Notifications - NOTHING HERE. Its entry point is the "+" icon in the
//                      top bar (components/notifications/ComposeButton.js),
//                      reachable from every page, not just this one.
//   01 Attendance    - school-wide attendance summary
//   04 Fees          - collection totals and overdue count
//   07 Marks         - exam and result status
//   08 Admissions    - pending applications count
//   14 Promotions    - year-end run controls
//
// The full editorial layout - sidebar on desktop, bottom tabs on mobile, per
// the UI context doc - is NOT built yet. It is scheduled as its own feature after
// Feature 09. Until then this is a plain centred column.

import Link from "next/link";

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
          built. To send a notification, use the + in the top bar.
        </p>
      </div>

      {/* Feature 01 - Attendance entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">ATTENDANCE</p>
        <p className="mt-3 text-sm text-muted">
          Today&apos;s school-wide attendance, class by class, with corrections.
        </p>
        <div className="mt-4">
          <Link href="/attendance/admin" className="cta">
            Today&apos;s attendance
          </Link>
        </div>
      </div>

      {/* Feature 04 - Fees entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">FEES</p>
        <p className="mt-3 text-sm text-muted">
          Collect payments at the counter, chase dues, print receipts.
        </p>
        <div className="mt-4">
          <Link href="/fees/admin" className="cta">
            Open fee desk
          </Link>
        </div>
      </div>

      {/* Feature 03 - Complaints entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">COMPLAINTS</p>
        <p className="mt-3 text-sm text-muted">
          The parent complaint inbox - read, reply, resolve.
        </p>
        <div className="mt-4">
          <Link href="/complaints/admin" className="cta">
            Open inbox
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}