// app/api/complaints/[id]/route.js
// GET   /api/complaints/<id>  - admin: one ticket with parent contact info
// PATCH /api/complaints/<id>  - admin actions: read | flag | reply | resolve
//
// EVERYTHING here is admin-only and branch-scoped: a ticket from another
// branch is a 404, not a hint. Parents have no per-ticket API - they get
// their whole list from GET /api/complaints (which filters by their own id).
//
// LIFECYCLE RULES (owner's, locked): reply never resolves; resolve needs a
// reply first; there is no reopen.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { createNotification } from "@/lib/notify";
import { REPLY_MAX } from "@/lib/complaintConstants";
import { getChildrenOfParent } from "@/lib/repos/attendanceRepo";
import {
	getComplaintForAdmin,
	markRead,
	replyToComplaint,
	resolveComplaint,
	toggleFlag,
} from "@/lib/repos/complaintRepo";

export const dynamic = "force-dynamic";

function errorResponse(err, where) {
	if (err.name === "AuthError") {
		return Response.json(
			{ ok: false, error: err.message },
			{ status: err.status }
		);
	}
	console.error(`[api/complaints/[id]] ${where} failed:`, err);
	return Response.json(
		{ ok: false, error: "Something went wrong. Please try again." },
		{ status: 500 }
	);
}

export async function GET(request, { params }) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const { id } = await params;
		if (!/^\d+$/.test(id ?? "")) {
			return Response.json(
				{ ok: false, error: "Invalid complaint id" },
				{ status: 400 }
			);
		}

		const complaint = await getComplaintForAdmin(Number(id), user.branchId);
		if (!complaint) {
			return Response.json(
				{ ok: false, error: "Complaint not found" },
				{ status: 404 }
			);
		}

		// The profile popover data: this parent's children with their classes.
		const children = await getChildrenOfParent(complaint.parentId);

		return Response.json({ ok: true, data: { complaint, children } });
	} catch (err) {
		return errorResponse(err, "GET");
	}
}

export async function PATCH(request, { params }) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const { id } = await params;
		if (!/^\d+$/.test(id ?? "")) {
			return Response.json(
				{ ok: false, error: "Invalid complaint id" },
				{ status: 400 }
			);
		}
		const complaintId = Number(id);

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const action = String(body?.action ?? "");

		if (action === "read") {
			await markRead(complaintId, user.branchId);
			return Response.json({ ok: true, data: { id: complaintId } });
		}

		if (action === "flag") {
			const result = await toggleFlag(complaintId, user.branchId);
			if (!result) {
				return Response.json(
					{ ok: false, error: "Complaint not found" },
					{ status: 404 }
				);
			}
			return Response.json({
				ok: true,
				data: { id: complaintId, isFlagged: result.isFlagged },
			});
		}

		if (action === "reply") {
			const text = String(body?.text ?? "").trim();
			if (!text) {
				return Response.json(
					{ ok: false, error: "Write a reply first" },
					{ status: 400 }
				);
			}
			if (text.length > REPLY_MAX) {
				return Response.json(
					{ ok: false, error: `Reply must be ${REPLY_MAX} characters or fewer` },
					{ status: 400 }
				);
			}

			const result = await replyToComplaint(
				complaintId,
				user.branchId,
				user.profileId,
				text
			);
			if (!result) {
				return Response.json(
					{ ok: false, error: "Complaint not found" },
					{ status: 404 }
				);
			}

			// The parent is waiting for this answer - bell + phone buzz, tapping
			// it opens their complaints screen directly. After commit, never
			// blocking.
			let notified = 0;
			try {
				await createNotification({
					branchId: user.branchId,
					title: "The school replied to your complaint",
					body: text.length > 200 ? `${text.slice(0, 197)}...` : text,
					priority: "important",
					kind: "notice",
					source: "complaints",
					linkUrl: "/parent/complaints",
					createdBy: user.profileId,
					recipientProfileIds: [result.parentId],
				});
				notified = 1;
			} catch (err) {
				console.error("[api/complaints/[id]] reply saved but parent alert failed:", err);
			}

			return Response.json({
				ok: true,
				data: { id: complaintId, status: result.status, notified },
			});
		}

		if (action === "resolve") {
			const outcome = await resolveComplaint(
				complaintId,
				user.branchId,
				user.profileId
			);
			if (!outcome.ok && outcome.reason === "needs_reply") {
				return Response.json(
					{ ok: false, error: "Send a reply before resolving - the parent deserves an answer first." },
					{ status: 400 }
				);
			}
			if (!outcome.ok && outcome.reason === "already_resolved") {
				return Response.json(
					{ ok: false, error: "This complaint is already resolved" },
					{ status: 409 }
				);
			}
			if (!outcome.ok) {
				return Response.json(
					{ ok: false, error: "Complaint not found" },
					{ status: 404 }
				);
			}
			return Response.json({ ok: true, data: { id: complaintId, status: "resolved" } });
		}

		return Response.json(
			{ ok: false, error: "Unknown action" },
			{ status: 400 }
		);
	} catch (err) {
		return errorResponse(err, "PATCH");
	}
}
