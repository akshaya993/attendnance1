// app/api/fees/summary/route.js
// GET /api/fees/summary
//
// The admin dashboard's numbers: total outstanding across the branch, plus a
// per-category breakdown (all four categories are always returned - a category
// with no dues reports "0", so the dashboard can show it distinctly instead of
// hiding it).

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { FEE_CATEGORIES } from "@/lib/format";
import { getBranchSummary } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const rows = await getBranchSummary(user.branchId);

		// ROLLUP gives one row per category plus a totals row with category null.
		const totalRow = rows.find((row) => row.category === null);
		const byCategory = FEE_CATEGORIES.map((category) => {
			const hit = rows.find((row) => row.category === category);
			return {
				category,
				totalDue: hit ? hit.totalDue : "0",
				studentsWithDues: hit ? hit.studentsWithDues : 0,
			};
		});

		return Response.json({
			ok: true,
			data: {
				totalDue: totalRow ? totalRow.totalDue : "0",
				categories: byCategory,
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/summary] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
