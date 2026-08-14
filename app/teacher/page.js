// The teacher's home screen. Deliberately EMPTY for now.
//
// DO NOT CREATE ANOTHER TEACHER HOME PAGE. This is it.
//
// WHAT GOES HERE, BY FEATURE (add your row when you build it):
//   09 Notifications - NOTHING HERE. Its entry point is the "+" icon in the
//                      top bar (components/notifications/ComposeButton.js).
//   01 Attendance    - today's classes, mark attendance entry point
//   07 Marks         - enter and review marks for assigned classes
//   10 Timetable     - this teacher's period schedule
//   05 Groups        - class group chats
//   06 Leaves        - approve or forward student leave requests
//
// The full editorial layout - sidebar on desktop, bottom tabs on mobile, per
// the UI context doc - is NOT built yet. It is scheduled as its own feature after
// Feature 09.

import Link from "next/link";

import { requireActiveSession } from "@/lib/guard";
import LogoutButton from "@/components/auth/LogoutButton";

export const metadata = { title: "Teacher | Greenwood School" };

export default async function TeacherHomePage() {
  // Session validity and the session_epoch kill switch. The ROLE check is done
  // by proxy.js (ROLE_PREFIXES), which runs before this page is ever reached.
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="label-micro text-muted">PORTAL / TEACHER</p>

      <h1 className="mt-3 text-3xl">{profile.fullName}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="pill">Teacher</span>
        <span className="text-muted text-sm">{profile.phoneNumber}</span>
      </div>

      <div className="card mt-8 p-6">
        <p className="label-micro text-muted">YOUR CLASSES</p>
        <p className="mt-3 text-sm">
          Nothing here yet. Each feature adds its section to this page as it is
          built. To send a notification, use the + in the top bar.
        </p>
      </div>

      {/* Feature 01 - Attendance entry point */}
      <div className="card mt-4 p-6">
        <p className="label-micro text-muted">ATTENDANCE</p>
        <p className="mt-3 text-sm text-muted">
          Mark today&apos;s attendance - everyone starts Present, one tap marks
          a student Absent.
        </p>
        <div className="mt-4">
          <Link href="/teacher/attendance" className="cta">
            Mark attendance
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}