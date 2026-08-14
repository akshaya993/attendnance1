// app/api/attendance/students/route.js
// GET /api/attendance/students?classId=49
//
// The marking sheet: a class's roster PLUS today's submission state in one
// response, so the teacher screen can decide between "mark" mode and
// "review / edit" mode without a second round trip.
//
// The class's branch is checked against the SIGNED SESSION - a teacher can
// mark any class (owner's decision), but never a class from another branch.
// A class id from another branch answers 404, not 403: it does not exist as
// far as this school is concerned.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import {
	getClassInfo,
	getClassRoster,
	getTodayClassState,
} from "@/lib/repos/attendanceRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["teacher", "admin"]);

		const classId = new URL(request.url).searchParams.get("classId");
		if (!classId || !/^\d+$/.test(classId)) {
			return Response.json(
				{ ok: false, error: "A valid classId is required" },
				{ status: 400 }
			);
		}

		const classInfo = await getClassInfo(Number(classId));
		if (!classInfo || classInfo.branchId !== user.branchId) {
			return Response.json(
				{ ok: false, error: "Class not found" },
				{ status: 404 }
			);
		}

		const [students, state] = await Promise.all([
			getClassRoster(classInfo.id),
			getTodayClassState(classInfo.id),
		]);

		return Response.json({
			ok: true,
			data: {
				classInfo,
				students,
				submitted: Boolean(state.submission),
				submission: state.submission,
				absentIds: state.absentIds,
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/attendance/students] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
