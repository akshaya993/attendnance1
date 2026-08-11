// The bus staff home screen. Deliberately EMPTY for now.
//
// DO NOT CREATE ANOTHER BUS HOME PAGE. This is it.
//
// WHAT GOES HERE, BY FEATURE (add your row when you build it):
//   02 Bus tracking - start/stop location sharing, route and student list
//
// NOTE for Feature 02: progress-tracker.md carries two open items that belong
// to this page - "bus role is not caged to the location-ping scope" and "bus
// login has no dedicated redirect target". The redirect target now exists: it
// is this file, reached via app/page.js. Update the tracker when you cage the
// role.
//
// The full editorial layout - sidebar on desktop, bottom tabs on mobile, per
// the UI context doc - is NOT built yet. It is scheduled as its own feature after
// Feature 09.

import { requireActiveSession } from "@/lib/guard";
import LogoutButton from "@/components/auth/LogoutButton";

export const metadata = { title: "Bus | Greenwood School" };

export default async function BusHomePage() {
  // Session validity and the session_epoch kill switch. The ROLE check is done
  // by proxy.js (ROLE_PREFIXES), which runs before this page is ever reached.
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="label-micro text-muted">PORTAL / BUS</p>

      <h1 className="mt-3 text-3xl">{profile.fullName}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="pill">Bus staff</span>
        <span className="text-muted text-sm">{profile.phoneNumber}</span>
      </div>

      <div className="card mt-8 p-6">
        <p className="label-micro text-muted">YOUR ROUTE</p>
        <p className="mt-3 text-sm">
          Nothing here yet. Bus tracking is built in Feature 02.
        </p>
      </div>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}