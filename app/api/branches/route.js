import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { listAllBranches, listOwnBranch } from "@/lib/repos/coreRepo";

// This route reads a cookie, so it must never be cached or pre-rendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/branches
 *
 * admin  -> every branch
 * others -> only their own branch
 */
export async function GET(request) {
	try {
		//// 1. SESSION - who is calling, and is that session still alive?
        //    requireActiveApiSession re-checks profiles.session_epoch against
        //    the database. Without it, a revoked cookie still passed this gate.
        const { session: user } = await requireActiveApiSession(request);

		// 2. ROLE - are they allowed here at all?
		requireRole(user, ["admin", "teacher", "parent", "bus"]);

		// 3. VALIDATE - nothing to validate, this route takes no input.

		// 4. REPO - all SQL lives behind lib/repos.
		const data =
			user.role === "admin"
				? await listAllBranches()
				: await listOwnBranch(user.branchId);

		// 5. SHAPE - always { ok, data } or { ok, error }.
		return Response.json({ ok: true, data });
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}

		console.error("[api/branches] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}