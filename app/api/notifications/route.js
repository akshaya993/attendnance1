import { requireActiveApiSession } from "@/lib/guard";
import { listForProfile, unreadCount } from "@/lib/repos/notificationRepo";

export const dynamic = "force-dynamic";

// Hard ceiling on page size. Without it, ?limit=100000 is a free denial of
// service against the database from any signed-in account.
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * GET /api/notifications
 *   ?count_only=true   -> { unreadCount }        (the 30s bell badge poll)
 *   ?limit=20&before=X -> { items, nextCursor }  (the bell panel list)
 *
 * DELIBERATELY NO requireRole() CALL. Admin, teacher, parent and bus all read
 * their own notifications; there is no role that is excluded. The security
 * boundary here is not the role, it is the profile id - and that comes from
 * the signed session cookie, never from the query string. There is no
 * ?profile_id= parameter anywhere in this feature, by design.
 */
export async function GET(request) {
	try {
		// Session AND kill-switch. getSession() alone only proves the cookie was
		// signed by us - it cannot tell that the session was revoked, because
		// proxy.js runs on Edge and cannot reach pg. See lib/guard.js.
		const { session: user } = await requireActiveApiSession(request);

		const { searchParams } = new URL(request.url);

		// Cheap path for the badge poll: one indexed count, no join, no rows.
		if (searchParams.get("count_only") === "true") {
			const count = await unreadCount(user.profileId);
			return Response.json({ ok: true, data: { unreadCount: count } });
		}

		// limit: clamp rather than reject, so a bad value degrades instead of
		// breaking the bell.
		const rawLimit = Number(searchParams.get("limit"));
		const limit =
			Number.isInteger(rawLimit) && rawLimit > 0
				? Math.min(rawLimit, MAX_LIMIT)
				: DEFAULT_LIMIT;

		// before: a BIGINT id. Validate as digits-only before it reaches SQL.
		// It is already parameterized, so this is not injection defence - it is
		// to turn a typo into a clean 400 instead of a PostgreSQL type error
		// surfacing as a 500.
		const rawBefore = searchParams.get("before");
		if (rawBefore !== null && !/^\d+$/.test(rawBefore)) {
			return Response.json(
				{ ok: false, error: "Invalid pagination cursor" },
				{ status: 400 }
			);
		}

		const items = await listForProfile(user.profileId, {
			limit,
			before: rawBefore,
		});

		// A full page means there is probably more. A short page means the end.
		// The cursor is the last id we returned, so the next call resumes just
		// past it with no gap and no repeat.
		const nextCursor =
			items.length === limit ? items[items.length - 1].id : null;

		return Response.json({ ok: true, data: { items, nextCursor } });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}

		console.error("[api/notifications] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}