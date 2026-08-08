// app/admin/broadcast/page.js
// The admin's broadcast screen: Compose and Sent.
//
// This page enforces nothing beyond "you are signed in and your session is
// still valid". proxy.js already blocks non-admins from every /admin/* URL, and
// canUseAudience() on the server is what actually decides who may send to whom.
//
// The Sent tab shows an admin EVERY broadcast in the school, not just their
// own - that oversight view is decided by /api/notifications/sent from the
// session role, not from anything on this page.

import BroadcastTabs from "@/components/notifications/BroadcastTabs";
import { requireActiveSession } from "@/lib/guard";

export const metadata = { title: "Broadcast | Greenwood School" };

export default async function AdminBroadcastPage() {
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <p className="label-micro text-muted">PORTAL / ADMIN / BROADCAST</p>
      <h1 className="mt-3 text-3xl">Send a message</h1>
      <p className="mt-2 text-sm text-muted">
        Reaches people instantly inside the app. Choose the audience carefully.
      </p>

      <BroadcastTabs role={profile.role} />
    </div>
  );
}