// app/complaints/admin/page.js
// The admin's complaints inbox. A thin server shell: the guard + metadata
// live here; the whole interactive inbox lives in
// components/complaints/TicketQueue.js.

import BackLink from "@/components/BackLink";
import TicketQueue from "@/components/complaints/TicketQueue";
import { requireActiveSession } from "@/lib/guard";

export const metadata = { title: "Complaints | Greenwood School" };

export default async function AdminComplaintsPage() {
	await requireActiveSession();

	return (
		<div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12">
			<BackLink href="/admin" />
			<p className="label-micro mt-4 text-muted">PORTAL / ADMIN / COMPLAINTS</p>
			<h1 className="mt-3 text-3xl">Complaints inbox</h1>
			<p className="mt-2 text-sm text-muted">
				Unread complaints stay on top in bold. Open one to read it, reply to
				the parent, and resolve it when the matter is settled.
			</p>

			<TicketQueue />
		</div>
	);
}
