// app/api/attendance/admin-summary/route.js
// GET  /api/attendance/admin-summary  - the Students-tab dashboard
// POST /api/attendance/admin-summary  - the admin override { action: "override", ... }
//
// GET: every class with today's submission state. The school-wide percentage
// covers ONLY classes that have submitted (per the prompt: the number is live
// and never waits for late teachers). Weighted maths: absent = 0,
// half_day = 0.5, late = full presence.
//
// POST (override): the admin correction. Bypasses the teacher's one-edit
// limit; creates today's submission if the teacher never made one. Always
// audit-logged ('attendance.override', by: "admin") and parents of NEWLY
// absent children are notified - same rules as the teacher edit.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { notifyAbsences, todayIst } from "@/lib/attendance";
import {
	adminOverrideAttendance,
	getClassInfo,
	getSchoolToday,
} from "@/lib/repos/attendanceRepo";

export const dynamic = "force-dynamic";

function round1(value) {
	return Math.round(value * 10) / 10;
}

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const rows = await getSchoolToday(user.branchId);

		// Per-class percentage follows the contract weights. Unsubmitted
		// classes get null - the UI shows "Not submitted yet" instead of a
		// made-up number.
		const classes = rows.map((row) => {
			let percentage = null;
			if (row.submitted && row.totalStudents > 0) {
				const attended =
					row.totalStudents - row.absentCount - row.halfCount * 0.5;
				percentage = round1((attended / row.totalStudents) * 100);
			}
			return { ...row, percentage };
		});

		// School-wide pulse across SUBMITTED classes only.
		const submittedClasses = classes.filter((row) => row.submitted);
		let schoolPercentage = null;
		if (submittedClasses.length > 0) {
			const totalStudents = submittedClasses.reduce(
				(sum, row) => sum + row.totalStudents,
				0
			);
			const attended = submittedClasses.reduce(
				(sum, row) => sum + (row.totalStudents - row.absentCount - row.halfCount * 0.5),
				0
			);
			if (totalStudents > 0) {
				schoolPercentage = round1((attended / totalStudents) * 100);
			}
		}

		return Response.json({
			ok: true,
			data: {
				school: {
					percentage: schoolPercentage,
					submittedClasses: submittedClasses.length,
					totalClasses: classes.length,
				},
				classes,
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/attendance/admin-summary] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}

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
		requireRole(user, ["admin"]);

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		if (body?.action !== "override") {
			return Response.json(
				{ ok: false, error: "Unknown action" },
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

		const outcome = await adminOverrideAttendance({
			classId,
			adminId: user.profileId,
			absentStudentIds,
		});

		const { iso } = todayIst();
		await logAudit({
			branchId: user.branchId,
			actorId: user.profileId,
			action: "attendance.override",
			entityType: "class",
			entityId: classId,
			details: {
				date: iso,
				by: "admin",
				created: outcome.created,
				previousAbsentIds: outcome.previousAbsentIds,
				newAbsentIds: outcome.newAbsentIds,
			},
		});

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
				created: outcome.created,
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
		console.error("[api/attendance/admin-summary] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
