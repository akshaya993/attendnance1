// app/api/attendance/submit/route.js
// POST /api/attendance/submit
// Body: { classId, absentStudentIds: number[] }
//
// The FIRST submission of the day for a class. The payload carries ONLY the
// absentees - present students are never sent and never stored.
//
// Inserting the attendance_submissions row is what marks today as a working
// day for this class (the owner's working-day rule: class + date + a
// submission, nothing else - no calendar is consulted, so Sundays and
// holidays count if a teacher submits).
//
// A second submission for the same class + day is impossible: the database
// raises 23505 (UNIQUE violation) and this route answers 409.
//
// After saving, every absent child's parent gets a bell + phone notification
// (priority "important", source "attendance") via lib/attendance.js.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { notifyAbsences } from "@/lib/attendance";
import { getClassInfo, submitAttendance } from "@/lib/repos/attendanceRepo";

export const dynamic = "force-dynamic";

/** Normalises the client's absent list to unique positive integers. */
function parseAbsentIds(raw) {
	if (!Array.isArray(raw)) return [];
	return [
		...new Set(
			raw.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)
		),
	];
}

export async function POST(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["teacher"]);

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const classId = Number(body?.classId);
		if (!Number.isInteger(classId) || classId <= 0) {
			return Response.json(
				{ ok: false, error: "A valid classId is required" },
				{ status: 400 }
			);
		}
		const absentStudentIds = parseAbsentIds(body?.absentStudentIds);

		const classInfo = await getClassInfo(classId);
		if (!classInfo || classInfo.branchId !== user.branchId) {
			return Response.json(
				{ ok: false, error: "Class not found" },
				{ status: 404 }
			);
		}

		const result = await submitAttendance({
			classId,
			teacherId: user.profileId,
			absentStudentIds,
		});

		// Attendance is committed - now tell the parents. This never fails the
		// request: it catches its own errors by design.
		const classLabel = `Class ${classInfo.classNumber} ${classInfo.section}`;
		const { notified } = await notifyAbsences({
			branchId: user.branchId,
			actorId: user.profileId,
			classLabel,
			studentIds: result.absentIds,
		});

		return Response.json({
			ok: true,
			data: {
				submissionId: result.submissionId,
				absentCount: result.absentIds.length,
				notified,
			},
		});
	} catch (err) {
		// The one expected database error: a submission already exists for this
		// class today (UNIQUE(class_id, date)). Everything rolled back cleanly.
		if (err?.code === "23505") {
			return Response.json(
				{
					ok: false,
					error: "Attendance was already submitted for this class today.",
				},
				{ status: 409 }
			);
		}
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/attendance/submit] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
