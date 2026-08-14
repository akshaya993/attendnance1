// app/parent/complaints/page.js
// The parent's complaints screen: the submit form on top, "My Past
// Complaints" below - each with its status chip and the office's reply when
// one exists.
//
// Server-rendered list + one client island (the form). After a submit the
// form calls router.refresh(), so this page re-renders with the new entry.

import BackLink from "@/components/BackLink";
import ComplaintForm from "@/components/complaints/ComplaintForm";
import { requireActiveSession } from "@/lib/guard";
import { STATUS_LABELS } from "@/lib/complaintConstants";
import { formatDateIst } from "@/lib/format";
import { getParentComplaints } from "@/lib/repos/complaintRepo";

export const metadata = { title: "Complaints | Greenwood School" };

// Status chips follow the UI context's status colour language.
const STATUS_CHIP = {
	unread: "bg-warn-soft text-warn",
	read: "bg-raised text-muted",
	resolved: "bg-ok-soft text-ok",
};

export default async function ParentComplaintsPage() {
	const { session } = await requireActiveSession();

	const complaints = await getParentComplaints(session.profileId);

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<BackLink href="/parent" />
			<p className="label-micro mt-4 text-muted">PORTAL / PARENT / COMPLAINTS</p>
			<h1 className="mt-3 text-3xl">Complaints</h1>
			<p className="mt-2 text-sm text-muted">
				Raise a concern with the school office and track its answer here.
			</p>

			<ComplaintForm />

			<p className="label-micro mt-8 text-muted">MY PAST COMPLAINTS</p>
			{complaints.length === 0 ? (
				<div className="card mt-3 p-6">
					<p className="text-sm text-muted">
						No complaints yet. We hope it stays that way.
					</p>
				</div>
			) : (
				<div className="card mt-3 overflow-hidden p-0">
					{complaints.map((complaint) => (
						<div
							key={complaint.id}
							className="border-b border-soft px-4 py-4 last:border-b-0"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="min-w-0 flex-1 truncate text-sm font-medium">
									{complaint.subject}
								</span>
								<span className={`pill shrink-0 ${STATUS_CHIP[complaint.status] ?? ""}`}>
									{STATUS_LABELS[complaint.status] ?? complaint.status}
								</span>
							</div>
							<p className="label-micro mt-1 text-muted">
								{formatDateIst(complaint.createdAt)}
							</p>
							<p className="mt-2 text-sm text-muted">{complaint.description}</p>

							{complaint.adminReply ? (
								<div className="mt-3 rounded-lg border-l-[3px] border-l-ok bg-raised px-4 py-3">
									<p className="label-micro text-ok">
										SCHOOL&apos;S REPLY
										{complaint.repliedByName
											? ` - ${complaint.repliedByName}`
											: ""}
									</p>
									<p className="mt-1.5 text-sm">{complaint.adminReply}</p>
								</div>
							) : null}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
