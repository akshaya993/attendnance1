// app/api/complaints/copilot/route.js
// POST /api/complaints/copilot  { notes, complaintId? }
//
// The "AI Draft Solution" button. Takes the admin's rough notes (plus,
// optionally, the complaint itself for context) and returns a polished draft.
// THE ADMIN ALWAYS REVIEWS BEFORE SENDING - this route only drafts, it never
// writes anything to the database.
//
// GRACEFULLY OFF: with no AI provider configured in .env.local, the answer is
// a clean 503 with a human reason - the admin UI shows it as a polite note,
// not a crash. Everything else about complaints works without AI.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { draftReply } from "@/lib/ai";
import { COPILOT_NOTES_MAX } from "@/lib/complaintConstants";
import { getComplaintForAdmin } from "@/lib/repos/complaintRepo";

export const dynamic = "force-dynamic";

export async function POST(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const notes = String(body?.notes ?? "").trim();
		if (!notes) {
			return Response.json(
				{ ok: false, error: "Write a few rough notes first" },
				{ status: 400 }
			);
		}
		if (notes.length > COPILOT_NOTES_MAX) {
			return Response.json(
				{ ok: false, error: `Notes must be ${COPILOT_NOTES_MAX} characters or fewer` },
				{ status: 400 }
			);
		}

		// Optional: the ticket the reply is for, so the draft addresses the
		// actual complaint. Branch-checked like everything else.
		let context = {};
		if (body?.complaintId !== undefined && body?.complaintId !== null) {
			const complaintId = Number(body.complaintId);
			if (Number.isInteger(complaintId) && complaintId > 0) {
				const complaint = await getComplaintForAdmin(complaintId, user.branchId);
				if (complaint) {
					context = {
						subject: complaint.subject,
						description: complaint.description,
					};
				}
			}
		}

		const result = await draftReply(notes, context);

		if (!result.ok) {
			// 503 = the AI service is unavailable/unconfigured. This is not a bug
			// in the app and never a stack trace - just the honest reason.
			return Response.json(
				{ ok: false, error: `AI drafting is unavailable: ${result.reason}` },
				{ status: 503 }
			);
		}

		return Response.json({ ok: true, data: { draft: result.draft } });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/complaints/copilot] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
