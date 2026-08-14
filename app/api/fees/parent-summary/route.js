// app/api/fees/parent-summary/route.js
// GET /api/fees/parent-summary?studentId=417
//
// One child's fee position: every category with its balance, plus the last 12
// months of receipts. THE OWNERSHIP CHECK IS THE POINT: the child must belong
// to the signed-in parent (students.parent_profile_id), verified with the
// same repo function the attendance feature uses. Anything else is a 403.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { getOwnedStudent } from "@/lib/repos/attendanceRepo";
import { getParentSummary } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["parent"]);

		const studentId = new URL(request.url).searchParams.get("studentId");
		if (!studentId || !/^\d+$/.test(studentId)) {
			return Response.json(
				{ ok: false, error: "A valid studentId is required" },
				{ status: 400 }
			);
		}

		const student = await getOwnedStudent(Number(studentId), user.profileId);
		if (!student) {
			return Response.json(
				{ ok: false, error: "You can only view your own child's fees" },
				{ status: 403 }
			);
		}

		const summary = await getParentSummary(student.id);

		return Response.json({
			ok: true,
			data: { student, ...summary },
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/parent-summary] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
