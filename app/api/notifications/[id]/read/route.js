import { requireActiveApiSession } from "@/lib/guard";
import { markRead } from "@/lib/repos/notificationRepo";

export const dynamic = "force-dynamic";

/**
 * PUT /api/notifications/{id}/read
 *
 * Marks one notification read for the CALLER. Returns 404 if that
 * notification is not addressed to them - see markRead() for why 404 and not
 * 403: answering 403 would confirm the notification exists for someone else.
 *
 * PUT, not POST, because the operation is idempotent - clicking twice leaves
 * the system in exactly the same state, including the original read_at.
 */
export async function PUT(request, { params }) {
	try {
		const { session: user } = await requireActiveApiSession(request);

		// Next.js 16 hands `params` over as a PROMISE. Reading params.id
		// directly returns undefined and silently 404s every request.
		const { id } = await params;

		if (!/^\d+$/.test(id)) {
			return Response.json(
				{ ok: false, error: "Invalid notification id" },
				{ status: 400 }
			);
		}

		// profileId comes from the signed cookie. This is the entire ownership
		// check - there is no way for a caller to nominate a different person.
		const changed = await markRead(id, user.profileId);

		if (!changed) {
			return Response.json(
				{ ok: false, error: "Notification not found" },
				{ status: 404 }
			);
		}

		return Response.json({ ok: true, data: { id } });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}

		console.error("[api/notifications/[id]/read] PUT failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}