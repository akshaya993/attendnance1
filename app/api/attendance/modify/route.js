// app/api/attendance/modify/route.js
// POST /api/attendance/modify
// Body: { classId, absentStudentIds: number[] }
//
// The teacher's ONE allowed correction to today's submission. The limit lives
// in attendance_submissions.modified_count and is enforced inside the
// transaction (row lock), so two simultaneous edits cannot both slip through.
//
//   no submission today  -> 404
//   already edited once  -> 403 "Modification limit reached - contact admin."
//
// A successful edit is AUDIT-LOGGED (action 'attendance.override') with the
// before/after absent lists - the owner's rule: whoever updated the record
// last is logged. Parents are notified only about NEWLY absent children;
// re-alerting a family that already knows would be noise.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { notifyAbsences, todayIst } from "@/lib/attendance";
import { getClassInfo, modifyAttendance } from "@/lib/repos/attendanceRepo";

export const dynamic = "force-dynamic";

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

		const outcome = await modifyAttendance({
			classId,
			teacherId: user.profileId,
			absentStudentIds,
		});

		if (!outcome.ok && outcome.reason === "no_submission") {
			return Response.json(
				{
					ok: false,
					error: "No submission exists for this class today to edit.",
				},
				{ status: 404 }
			);
		}
		if (!outcome.ok && outcome.reason === "limit_reached") {
			return Response.json(
				{ ok: false, error: "Modification limit reached - contact admin." },
				{ status: 403 }
			);
		}

		// Audit FIRST among the side effects: the record of the change matters
		// more than the notifications about it.
		const { iso } = todayIst();
		await logAudit({
			branchId: user.branchId,
			actorId: user.profileId,
			action: "attendance.override",
			entityType: "class",
			entityId: classId,
			details: {
				date: iso,
				by: "teacher",
				previousAbsentIds: outcome.previousAbsentIds,
				newAbsentIds: outcome.newAbsentIds,
			},
		});

		// Only children who were NOT absent before this edit get an alert.
		const previous = new Set(outcome.previousAbsentIds);
		const newlyAbsent = outcome.newAbsentIds.filter((id) => !previous.has(id));
		const classLabel = `Class ${classInfo.classNumber} ${classInfo.section}`;
		const { notified } = await notifyAbsences({
			branchId: user.branchId,
			actorId: user.profileId,
			classLabel,
			studentIds: newlyAbsent,
		});

		return Response.json({
			ok: true,
			data: {
				absentCount: outcome.newAbsentIds.length,
				notified,
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/attendance/modify] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
