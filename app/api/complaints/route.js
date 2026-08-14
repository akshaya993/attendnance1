// app/api/complaints/route.js
// GET  /api/complaints           - parent: my complaints | admin: the branch queue
// GET  /api/complaints?flagged=1 - admin: flagged only
// POST /api/complaints           - parent files a complaint { subject, description }
//
// The SAME URL serves both roles, split by the signed session's role - a
// parent can only ever receive their own rows (parent_id from the cookie,
// never from the client), and only admins see the branch queue.
//
// A new complaint alerts EVERY admin of the branch (bell + phone buzz,
// priority "important") with a link straight to the admin inbox. The office
// should never discover an angry message hours late.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { createNotification } from "@/lib/notify";
import { DESCRIPTION_MAX, SUBJECT_MAX } from "@/lib/complaintConstants";
import { listAdminIdsByBranch } from "@/lib/repos/authRepo";
import {
	createComplaint,
	getParentComplaints,
	getQueue,
} from "@/lib/repos/complaintRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["parent", "admin"]);

		if (user.role === "parent") {
			const complaints = await getParentComplaints(user.profileId);
			return Response.json({ ok: true, data: { complaints } });
		}

		// Admin queue. ?flagged=1 narrows to flagged tickets only.
		const flaggedOnly =
			new URL(request.url).searchParams.get("flagged") === "1";
		const complaints = await getQueue(user.branchId, { flaggedOnly });
		return Response.json({ ok: true, data: { complaints } });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/complaints] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}

export async function POST(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["parent"]);

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const subject = String(body?.subject ?? "").trim();
		const description = String(body?.description ?? "").trim();

		if (!subject) {
			return Response.json(
				{ ok: false, error: "A subject is required" },
				{ status: 400 }
			);
		}
		if (subject.length > SUBJECT_MAX) {
			return Response.json(
				{ ok: false, error: `Subject must be ${SUBJECT_MAX} characters or fewer` },
				{ status: 400 }
			);
		}
		if (!description) {
			return Response.json(
				{ ok: false, error: "Please describe the issue" },
				{ status: 400 }
			);
		}
		if (description.length > DESCRIPTION_MAX) {
			return Response.json(
				{ ok: false, error: `Description must be ${DESCRIPTION_MAX} characters or fewer` },
				{ status: 400 }
			);
		}

		const complaint = await createComplaint({
			branchId: user.branchId,
			parentId: user.profileId,
			subject,
			description,
		});

		// Alert the office AFTER the row is safely committed. A notification
		// failure must never make a saved complaint look lost.
		let notified = 0;
		try {
			const adminIds = await listAdminIdsByBranch(user.branchId);
			if (adminIds.length > 0) {
				await createNotification({
					branchId: user.branchId,
					title: "New complaint received",
					body: subject,
					priority: "important",
					kind: "notice",
					source: "complaints",
					linkUrl: "/complaints/admin",
					createdBy: user.profileId,
					recipientProfileIds: adminIds,
				});
				notified = adminIds.length;
			}
		} catch (err) {
			console.error("[api/complaints] complaint saved but admin alert failed:", err);
		}

		return Response.json({
			ok: true,
			data: { id: complaint.id, createdAt: complaint.createdAt, notified },
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/complaints] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
