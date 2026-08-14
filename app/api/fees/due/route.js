// app/api/fees/due/route.js
// GET /api/fees/due?category=tuition            -> class-level dues
// GET /api/fees/due?category=tuition&classId=49 -> unpaid students of the class
//
// Both shapes are admin-only and branch-scoped from the session. The category
// is validated against the four legal values before it can reach SQL.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { FEE_CATEGORIES } from "@/lib/format";
import { getClassInfo } from "@/lib/repos/attendanceRepo";
import { getClassDues, getUnpaidStudents } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const params = new URL(request.url).searchParams;
		const category = params.get("category");
		if (!category || !FEE_CATEGORIES.includes(category)) {
			return Response.json(
				{ ok: false, error: "A valid category is required" },
				{ status: 400 }
			);
		}

		const rawClassId = params.get("classId");

		// Shape 1: class-level dues for the whole branch.
		if (rawClassId === null) {
			const classes = await getClassDues(user.branchId, category);
			return Response.json({ ok: true, data: { category, classes } });
		}

		// Shape 2: unpaid students of one class. The class must belong to the
		// admin's branch - a class id from another branch is a 404, not a hint.
		if (!/^\d+$/.test(rawClassId)) {
			return Response.json(
				{ ok: false, error: "A valid classId is required" },
				{ status: 400 }
			);
		}
		const classInfo = await getClassInfo(Number(rawClassId));
		if (!classInfo || classInfo.branchId !== user.branchId) {
			return Response.json(
				{ ok: false, error: "Class not found" },
				{ status: 404 }
			);
		}

		const students = await getUnpaidStudents(classInfo.id, category);
		return Response.json({
			ok: true,
			data: { category, classInfo, students },
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/due] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
