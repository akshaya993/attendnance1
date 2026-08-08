// app/teacher/broadcast/page.js
// The teacher's broadcast screen: Compose and Sent.
//
// Same component as the admin page, one different prop. A teacher may send to
// any class but never to the whole school, and their Sent tab shows only their
// own messages. Both of those rules live on the server, not here.
//
// The back arrow is hard-wired to /teacher rather than browser history, because
// this page is reachable from the "+" in the top bar on ANY page. See the note
// in components/BackLink.js.

import BackLink from "@/components/BackLink";
import BroadcastTabs from "@/components/notifications/BroadcastTabs";
import { requireActiveSession } from "@/lib/guard";

export const metadata = { title: "Broadcast | Greenwood School" };

export default async function TeacherBroadcastPage() {
  const { profile } = await requireActiveSession();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
      <BackLink href="/teacher" />

      <p className="label-micro mt-4 text-muted">PORTAL / TEACHER / BROADCAST</p>
      <h1 className="mt-3 text-3xl">Send a message</h1>
      <p className="mt-2 text-sm text-muted">
        Reaches your classes instantly inside the app. Choose the audience
        carefully.
      </p>

      <BroadcastTabs role={profile.role} />
    </div>
  );
}