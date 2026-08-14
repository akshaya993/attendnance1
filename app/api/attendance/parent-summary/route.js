// app/api/attendance/parent-summary/route.js
// GET /api/attendance/parent-summary?studentId=123
//
// One child's attendance: percentage, day counts, and the full day-by-day
// history (one row per day the CHILD'S CLASS took attendance - the owner's
// working-day rule; no calendar is involved).
//
// THE OWNERSHIP CHECK IS THE WHOLE POINT OF THIS ROUTE: the child must belong
// to the signed-in parent (students.parent_profile_id). Anything else is a
// 403 - a parent can never read another family's child by guessing an id.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import {
	getOwnedStudent,
	getStudentAttendanceSummary,
} from "@/lib/repos/attendanceRepo";

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
				{ ok: false, error: "You can only view your own child's attendance" },
				{ status: 403 }
			);
		}

		const summary = await getStudentAttendanceSummary(
			student.id,
			student.classId
		);

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
		console.error("[api/attendance/parent-summary] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
