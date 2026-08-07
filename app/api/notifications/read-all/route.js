import { requireActiveApiSession } from "@/lib/guard";
import { markAllRead } from "@/lib/repos/notificationRepo";

export const dynamic = "force-dynamic";

/**
 * PUT /api/notifications/read-all
 *
 * The "mark all as read" icon in the bell panel. Scoped to the caller by
 * profile id from the signed session cookie - there is no parameter of any
 * kind on this route, so it cannot be pointed at another account.
 *
 * Returns how many rows changed so the UI can confirm honestly ("12 marked as
 * read") instead of guessing.
 *
 * This route does NOT collide with /api/notifications/[id]/read: that pattern
 * is two segments ({id} then read) and this one is a single static segment.
 * Next.js also resolves static segments ahead of dynamic ones.
 */
export async function PUT(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);

		const markedCount = await markAllRead(user.profileId);

		return Response.json({ ok: true, data: { markedCount } });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}

		console.error("[api/notifications/read-all] PUT failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}