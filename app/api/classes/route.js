import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { listClassesByBranch } from "@/lib/repos/coreRepo";

export const dynamic = "force-dynamic";

/**
 * GET /api/classes
 *
 * Lists the classes of the CALLER'S branch. The branch is taken from the
 * signed session cookie and never from the URL, so nobody can read another
 * branch's classes by editing the query string.
 */
export async function GET(request) {
	try {
		// Session AND kill-switch. getSession() alone only proves the cookie
        // was signed by us - it cannot tell that the session was revoked,
        // because proxy.js runs on Edge and cannot reach pg. See lib/guard.js.
        const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin", "teacher"]);

		const data = await listClassesByBranch(user.branchId);

		return Response.json({ ok: true, data });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}

		console.error("[api/classes] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}