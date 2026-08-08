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
//
// The back arrow is hard-wired to /admin rather than browser history, because
// this page is reachable from the "+" in the top bar on ANY page. See the note
// in components/BackLink.js.

import BackLink from "@/components/BackLink";
import BroadcastTabs from "@/components/notifications/BroadcastTabs";
import { requireActiveSession } from "@/lib/guard";

export const metadata = { title: "Broadcast | Greenwood School" };

export default async function AdminBroadcastPage() {
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
      <BackLink href="/admin" />

      <p className="label-micro mt-4 text-muted">PORTAL / ADMIN / BROADCAST</p>
      <h1 className="mt-3 text-3xl">Send a message</h1>
      <p className="mt-2 text-sm text-muted">
        Reaches people instantly inside the app. Choose the audience carefully.
      </p>

      <BroadcastTabs role={profile.role} />
    </div>
  );
}