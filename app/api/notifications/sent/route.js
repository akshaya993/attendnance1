// app/api/notifications/sent/route.js
// -----------------------------------------------------------------------------
// GET /api/notifications/sent
//
// The outbox. Returns the broadcasts this person sent, newest first, each with
// a delivered count and a read count.
//
// WHO SEES WHAT is decided here from the session role, and nowhere else:
//   admin   -> every broadcast in the branch, each stamped with the sender name
//   teacher -> only their own
//   parent / bus -> 403, they cannot broadcast so they have no outbox
//
// The "can they broadcast at all" test REUSES canUseAudience() from
// lib/notificationConstants.js rather than restating the role list. One rule,
// one definition - the composer, the send endpoint and this endpoint can never
// disagree about who is allowed to broadcast.
// -----------------------------------------------------------------------------

import { requireActiveApiSession } from "@/lib/guard";
import { canUseAudience } from "@/lib/notificationConstants";
import { listSentBroadcasts } from "@/lib/repos/notificationRepo";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export async function GET(request) {
	try {
		const { session } = await requireActiveApiSession(request);

		// "classes" is the narrowest audience anybody is allowed to use, so if a
		// role cannot even do that, it can never have sent anything.
		if (!canUseAudience(session.role, "classes")) {
			return Response.json(
				{ ok: false, error: "You do not have access to this resource" },
				{ status: 403 }
			);
		}

		const searchParams = new URL(request.url).searchParams;

		const rawLimit = searchParams.get("limit");
		let limit = DEFAULT_LIMIT;
		if (rawLimit) {
			if (!/^\d+$/.test(rawLimit)) {
				return Response.json({ ok: false, error: "Invalid limit" }, { status: 400 });
			}
			limit = Math.min(Number(rawLimit), MAX_LIMIT);
			if (limit < 1) {
				return Response.json({ ok: false, error: "Invalid limit" }, { status: 400 });
			}
		}

		const rawBefore = searchParams.get("before");
		if (rawBefore && !/^\d+$/.test(rawBefore)) {
			return Response.json({ ok: false, error: "Invalid cursor" }, { status: 400 });
		}
		const before = rawBefore ? Number(rawBefore) : null;

		// ROLE decides scope. Never read this from the query string - that would
		// let a teacher ask for everybody's messages.
		const scope = session.role === "admin" ? "all" : "own";

		const items = await listSentBroadcasts({
			branchId: session.branchId,
			profileId: session.profileId,
			scope,
			limit,
			before,
		});

		// Same keyset rule as the bell: a full page means there may be more.
		const nextCursor = items.length === limit ? items[items.length - 1].id : null;

		// scope is echoed back so the UI can label the tab without repeating the
		// role rule in the browser.
		return Response.json({ ok: true, data: { items, nextCursor, scope } });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json({ ok: false, error: err.message }, { status: err.status });
		}
		console.error("[api/notifications/sent] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}