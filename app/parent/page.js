// The parent's home screen. Deliberately EMPTY for now.
//
// DO NOT CREATE ANOTHER PARENT HOME PAGE. This is it.
//
// WHAT GOES HERE, BY FEATURE (add your row when you build it):
//   01 Attendance - the child's attendance record
//   04 Fees       - amount due, pay now, payment history
//   07 Marks      - report cards and exam results
//   02 Bus        - live bus location on a map
//   06 Leaves     - apply for leave
//   03 Complaints - raise and track a complaint
//
// NOTE for whoever builds the child switcher: rule 9 of the UI context doc requires a
// child switcher at the top of this page when a family has more than one
// child. students.parent_profile_id is the link. Do not assume one child.
//
// The full editorial layout - sidebar on desktop, bottom tabs on mobile, per
// the UI context doc - is NOT built yet. It is scheduled as its own feature after
// Feature 09.

import Link from "next/link";

import { requireActiveSession } from "@/lib/guard";
import LogoutButton from "@/components/auth/LogoutButton";

export const metadata = { title: "Parent | Greenwood School" };

export default async function ParentHomePage() {
  // Session validity and the session_epoch kill switch. The ROLE check is done
  // by proxy.js (ROLE_PREFIXES), which runs before this page is ever reached.
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="label-micro text-muted">PORTAL / PARENT</p>

      <h1 className="mt-3 text-3xl">{profile.fullName}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="pill">Parent</span>
        <span className="text-muted text-sm">{profile.phoneNumber}</span>
      </div>

      <div className="card mt-8 p-6">
        <p className="label-micro text-muted">YOUR CHILD</p>
        <p className="mt-3 text-sm">
          Nothing here yet. Each feature adds its section to this page as it is
          built.
        </p>
      </div>

      {/* Feature 01 - Attendance entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">ATTENDANCE</p>
        <p className="mt-3 text-sm text-muted">
          Your child&apos;s attendance percentage and day-by-day history.
        </p>
        <div className="mt-4">
          <Link href="/attendance/parent" className="cta">
            View attendance
          </Link>
        </div>
      </div>

      {/* Feature 04 - Fees entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">FEES</p>
        <p className="mt-3 text-sm text-muted">
          Outstanding balance, category-wise dues, and payment receipts.
        </p>
        <div className="mt-4">
          <Link href="/fees/parent" className="cta">
            View fees
          </Link>
        </div>
      </div>

      {/* Feature 03 - Complaints entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">COMPLAINTS</p>
        <p className="mt-3 text-sm text-muted">
          Raise a concern with the school office and track its answer.
        </p>
        <div className="mt-4">
          <Link href="/complaints/parent" className="cta">
            Complaints
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}