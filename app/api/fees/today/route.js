// app/api/fees/today/route.js
// GET /api/fees/today
//
// Today's collections: every receipt created today in IST (a CALENDAR day -
// a Monday payment never appears on Tuesday), newest first, plus the total.
// Admin only, branch-scoped from the session.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { getTodaysCollections } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const data = await getTodaysCollections(user.branchId);

		return Response.json({ ok: true, data });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/today] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
