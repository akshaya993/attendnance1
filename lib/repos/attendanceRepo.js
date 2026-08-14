// lib/repos/attendanceRepo.js
// -----------------------------------------------------------------------------
// EVERY SQL STATEMENT FOR ATTENDANCE LIVES IN THIS FILE.
//
// coreRepo.js states the rule plainly: "every SQL statement in the app lives in
// lib/repos/*.js, never in a route." Routes and pages call these functions;
// they never write SQL themselves.
//
// DB CONTRACT: student_attendance, attendance_submissions, students, classes,
// profiles and branches already exist in db/schema.sql. NO DDL IN THIS FILE.
// Feature 01 adds no migration.
//
// THE WORKING-DAY RULE (set by the project owner - it overrides older plans):
//   A date is a "working day" FOR A CLASS if and only if that class has a row
//   in attendance_submissions for that date. Nothing else decides it.
//   - school_calendar is NOT used anywhere in this feature.
//   - Sundays and public holidays count if a teacher submitted.
//   - Each class has its own independent working-day count.
//   The submission row IS the "+1 working day" mark: UNIQUE(class_id, date)
//   makes a second mark for the same class and day physically impossible.
//
// ABSENTEE-ONLY STORAGE: present students have no row in student_attendance.
// Statuses: 'absent' (0), 'half_day' (0.5), 'late' (counts as present, 1).
// The teacher UI creates 'absent' rows only; the other two exist in seed data
// and are honoured in the maths and the displays.
//
// "TODAY" IS ALWAYS IST. Every query computes it as
//   (now() AT TIME ZONE 'Asia/Kolkata')::date
// so the answer never depends on the server machine's timezone.
//
// BIGINT NOTE: pg returns BIGINT columns as JavaScript STRINGS. Every id that
// leaves this file is Number()-ed here, at the boundary, so the rest of the
// app never has to think about it.
// -----------------------------------------------------------------------------

import { query, withTransaction } from "@/lib/db";

// The one and only "today". A constant SQL fragment - it contains no user
// input, so this is not string interpolation of data.
const TODAY_IST = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

// One INSERT shape shared by submit, modify and override. The class_id and
// is_active filters mean a hand-crafted request cannot mark a student from
// another class (or an inactive student) absent - only real, active members
// of THIS class are ever inserted. $1 = candidate ids, $2 = marker, $3 = class.
const INSERT_ABSENT_SQL = `
  INSERT INTO student_attendance (student_id, date, status, recorded_by)
  SELECT s.id, ${TODAY_IST}, 'absent', $2
    FROM students s
   WHERE s.id = ANY($1::bigint[])
     AND s.class_id = $3
     AND s.is_active = true
  RETURNING student_id`;

// =============================================================================
// READS
// =============================================================================

/**
 * One class by id. Every route uses this to confirm the class exists and to
 * enforce branch ownership (branchId must match the signed session's branch).
 */
export async function getClassInfo(classId) {
	const { rows } = await query(
		`SELECT id,
		        class_number AS "classNumber",
		        section,
		        branch_id    AS "branchId"
		   FROM classes
		  WHERE id = $1`,
		[classId]
	);
	const row = rows[0];
	if (!row) return null;
	return {
		id: Number(row.id),
		classNumber: row.classNumber,
		section: row.section,
		branchId: Number(row.branchId),
	};
}

/**
 * The active students of one class, in roll-number order. This is the marking
 * sheet a teacher sees. Rides the existing idx_students_class index.
 */
export async function getClassRoster(classId) {
	const { rows } = await query(
		`SELECT id,
		        full_name   AS "fullName",
		        roll_number AS "rollNumber"
		   FROM students
		  WHERE class_id = $1
		    AND is_active = true
		  ORDER BY roll_number`,
		[classId]
	);
	return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/**
 * Today's state for one class: the submission row (if any) plus the list of
 * students marked ABSENT today. Used by the teacher screen to decide between
 * "mark" mode and "review / one edit left" mode.
 *
 * absentIds filters to status = 'absent' on purpose: the marking UI only ever
 * creates absences, so that is the only status the edit form can faithfully
 * reproduce. (Seed history contains 'late'/'half_day' rows; those are shown in
 * read-only displays, never silently rewritten by an edit.)
 */
export async function getTodayClassState(classId) {
	const submissionResult = await query(
		`SELECT sub.id,
		        sub.absent_count   AS "absentCount",
		        sub.modified_count AS "modifiedCount",
		        sub.marked_by      AS "markedBy",
		        p.full_name        AS "markedByName",
		        sub.created_at     AS "createdAt"
		   FROM attendance_submissions sub
		   LEFT JOIN profiles p ON p.id = sub.marked_by
		  WHERE sub.class_id = $1
		    AND sub.date = ${TODAY_IST}`,
		[classId]
	);

	const absentResult = await query(
		`SELECT e.student_id AS "studentId"
		   FROM student_attendance e
		   JOIN students s ON s.id = e.student_id
		  WHERE s.class_id = $1
		    AND e.date = ${TODAY_IST}
		    AND e.status = 'absent'
		  ORDER BY e.student_id`,
		[classId]
	);

	const sub = submissionResult.rows[0];
	return {
		submission: sub
			? {
					id: Number(sub.id),
					absentCount: sub.absentCount,
					modifiedCount: sub.modifiedCount,
					markedBy: Number(sub.markedBy),
					markedByName: sub.markedByName,
					createdAt: sub.createdAt,
				}
			: null,
		absentIds: absentResult.rows.map((row) => Number(row.studentId)),
	};
}

/**
 * Every active child linked to one parent login, with class labels. Powers the
 * parent screen's child selector. (Seed data is 1 parent : 1 child, but the
 * schema allows more - do not assume one child.)
 */
export async function getChildrenOfParent(parentProfileId) {
	const { rows } = await query(
		`SELECT s.id,
		        s.full_name   AS "fullName",
		        s.roll_number AS "rollNumber",
		        s.class_id    AS "classId",
		        c.class_number AS "classNumber",
		        c.section
		   FROM students s
		   JOIN classes c ON c.id = s.class_id
		  WHERE s.parent_profile_id = $1
		    AND s.is_active = true
		  ORDER BY s.full_name`,
		[parentProfileId]
	);
	return rows.map((row) => ({
		...row,
		id: Number(row.id),
		classId: Number(row.classId),
	}));
}

/**
 * Ownership proof for the parent API: returns the child ONLY if the signed-in
 * parent is students.parent_profile_id. A null answer becomes a 403 - a parent
 * can never read another family's child by guessing an id.
 */
export async function getOwnedStudent(studentId, parentProfileId) {
	const { rows } = await query(
		`SELECT s.id,
		        s.full_name   AS "fullName",
		        s.roll_number AS "rollNumber",
		        s.class_id    AS "classId",
		        c.class_number AS "classNumber",
		        c.section
		   FROM students s
		   JOIN classes c ON c.id = s.class_id
		  WHERE s.id = $1
		    AND s.parent_profile_id = $2
		    AND s.is_active = true`,
		[studentId, parentProfileId]
	);
	const row = rows[0];
	if (!row) return null;
	return { ...row, id: Number(row.id), classId: Number(row.classId) };
}

/**
 * One child's attendance summary, computed on the fly under the CLASS-SPECIFIC
 * working-day rule:
 *
 *   workingDays = submission rows for the CHILD'S CLASS, up to today
 *   attended    = workingDays - (absent x 1) - (half_day x 0.5)   [late = 1]
 *   percentage  = attended / workingDays x 100, rounded to 1 decimal
 *
 * The exception counts JOIN attendance_submissions so a stray exception row on
 * a day the class never took attendance can never distort the maths.
 *
 * percentage is null when the class has no submissions yet - the UI shows
 * "No attendance recorded yet" instead of a meaningless 0% or 100%.
 */
export async function getStudentAttendanceSummary(studentId, classId) {
	const workingResult = await query(
		`SELECT count(*)::int AS "workingDays"
		   FROM attendance_submissions
		  WHERE class_id = $1
		    AND date <= ${TODAY_IST}`,
		[classId]
	);

	const exceptionsResult = await query(
		`SELECT (count(*) FILTER (WHERE e.status = 'absent'))::int   AS "absentDays",
		        (count(*) FILTER (WHERE e.status = 'half_day'))::int AS "halfDays",
		        (count(*) FILTER (WHERE e.status = 'late'))::int     AS "lateDays"
		   FROM student_attendance e
		   JOIN attendance_submissions sub
		     ON sub.class_id = $2
		    AND sub.date = e.date
		  WHERE e.student_id = $1
		    AND e.date <= ${TODAY_IST}`,
		[studentId, classId]
	);

	// Day-by-day history: one row per day the CLASS took attendance, with the
	// child's own status that day (null = present, because present students
	// have no row). Newest first.
	const historyResult = await query(
		`SELECT sub.date AS "date",
		        e.status
		   FROM attendance_submissions sub
		   LEFT JOIN student_attendance e
		     ON e.student_id = $1
		    AND e.date = sub.date
		  WHERE sub.class_id = $2
		    AND sub.date <= ${TODAY_IST}
		  ORDER BY sub.date DESC`,
		[studentId, classId]
	);

	const workingDays = workingResult.rows[0].workingDays;
	const { absentDays, halfDays, lateDays } = exceptionsResult.rows[0];
	const attended = workingDays - absentDays - halfDays * 0.5;
	const percentage =
		workingDays > 0
			? Math.round((attended / workingDays) * 1000) / 10
			: null;

	return {
		workingDays,
		absentDays,
		halfDays,
		lateDays,
		attendedDays: attended,
		percentage,
		history: historyResult.rows.map((row) => ({
			date: row.date,
			status: row.status ?? "present",
		})),
	};
}

/**
 * The admin dashboard: every class in the branch with its TODAY state.
 *
 * One grouped query returns per class: active-student total, whether a
 * submission exists today, and the exception counts split by status. The
 * percentage itself is computed in JavaScript (route), because rounding and
 * the "only submitted classes count" rule are presentation concerns.
 *
 * The per-status FILTER counts are needed because the contract's maths is
 * weighted (absent = 0, half_day = 0.5, late = 1) - a single lumped
 * absent_count column cannot express that.
 */
export async function getSchoolToday(branchId) {
	const { rows } = await query(
		`SELECT c.id           AS "classId",
		        c.class_number AS "classNumber",
		        c.section,
		        (count(s.id))::int AS "totalStudents",
		        (sub.id IS NOT NULL)  AS "submitted",
		        (count(e.id) FILTER (WHERE e.status = 'absent'))::int   AS "absentCount",
		        (count(e.id) FILTER (WHERE e.status = 'half_day'))::int AS "halfCount",
		        (count(e.id) FILTER (WHERE e.status = 'late'))::int     AS "lateCount"
		   FROM classes c
		   LEFT JOIN students s
		     ON s.class_id = c.id
		    AND s.is_active = true
		   LEFT JOIN attendance_submissions sub
		     ON sub.class_id = c.id
		    AND sub.date = ${TODAY_IST}
		   LEFT JOIN student_attendance e
		     ON e.student_id = s.id
		    AND e.date = sub.date
		  WHERE c.branch_id = $1
		  GROUP BY c.id, sub.id
		  ORDER BY c.class_number, c.section`,
		[branchId]
	);
	return rows.map((row) => ({ ...row, classId: Number(row.classId) }));
}

/**
 * Today's exception rows for one class (absent / late / half_day), newest
 * status vocabulary intact, for the admin drill-down screen.
 */
export async function getClassExceptionsToday(classId) {
	const { rows } = await query(
		`SELECT s.id          AS "studentId",
		        s.full_name   AS "fullName",
		        s.roll_number AS "rollNumber",
		        e.status
		   FROM student_attendance e
		   JOIN students s ON s.id = e.student_id
		  WHERE s.class_id = $1
		    AND e.date = ${TODAY_IST}
		  ORDER BY s.roll_number`,
		[classId]
	);
	return rows.map((row) => ({ ...row, studentId: Number(row.studentId) }));
}

/**
 * Parent contact info for a set of students - used to deliver absence
 * notifications to the right family and nobody else.
 */
export async function getParentInfoForStudents(studentIds) {
	if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
	const { rows } = await query(
		`SELECT s.id                AS "studentId",
		        s.full_name         AS "studentName",
		        s.parent_profile_id AS "parentProfileId"
		   FROM students s
		  WHERE s.id = ANY($1::bigint[])`,
		[studentIds]
	);
	return rows.map((row) => ({
		...row,
		studentId: Number(row.studentId),
		parentProfileId: Number(row.parentProfileId),
	}));
}

// =============================================================================
// WRITES - all multi-step, all inside withTransaction (all-or-nothing)
// =============================================================================

/**
 * First submission of the day for a class. Inserting the attendance_submissions
 * row IS what marks today as a working day for this class - the two inserts
 * below commit together or not at all.
 *
 * A duplicate submission for the same class + day is rejected by the database
 * itself: UNIQUE(class_id, date) raises error code 23505, which this function
 * deliberately lets bubble up so the route can answer 409. The transaction
 * rolls back, so no half-written absent rows survive.
 *
 * @returns {Promise<{submissionId: number, absentIds: number[]}>} the ids that
 *          were ACTUALLY inserted (after the roster safety filter)
 */
export async function submitAttendance({ classId, teacherId, absentStudentIds }) {
	return withTransaction(async (client) => {
		const inserted = await client.query(INSERT_ABSENT_SQL, [
			absentStudentIds,
			teacherId,
			classId,
		]);
		const absentIds = inserted.rows.map((row) => Number(row.student_id));

		const submission = await client.query(
			`INSERT INTO attendance_submissions
			        (class_id, date, marked_by, absent_count)
			 VALUES ($1, ${TODAY_IST}, $2, $3)
			 RETURNING id`,
			[classId, teacherId, absentIds.length]
		);

		return { submissionId: Number(submission.rows[0].id), absentIds };
	});
}

/**
 * The teacher's ONE allowed correction. Guarded by modified_count: the row is
 * locked (FOR UPDATE) so two teachers tapping "save" at the same second cannot
 * both pass the check - the second one waits, then sees modified_count = 1.
 *
 * Returns an outcome object instead of throwing for the two EXPECTED refusal
 * cases, so the route can answer a clean 404 / 403:
 *   { ok: false, reason: "no_submission" | "limit_reached" }
 *   { ok: true, previousAbsentIds, newAbsentIds }
 *
 * marked_by is updated to the person who made THIS edit: the column records
 * who touched the record last. The audit log carries the full story.
 */
export async function modifyAttendance({ classId, teacherId, absentStudentIds }) {
	return withTransaction(async (client) => {
		const found = await client.query(
			`SELECT id, modified_count AS "modifiedCount"
			   FROM attendance_submissions
			  WHERE class_id = $1
			    AND date = ${TODAY_IST}
			  FOR UPDATE`,
			[classId]
		);
		const sub = found.rows[0];
		if (!sub) return { ok: false, reason: "no_submission" };
		if (sub.modifiedCount >= 1) return { ok: false, reason: "limit_reached" };

		// Capture the old list before deleting it - the route needs it for the
		// notification delta (only NEWLY absent children trigger an alert).
		const removed = await client.query(
			`DELETE FROM student_attendance
			  WHERE date = ${TODAY_IST}
			    AND status = 'absent'
			    AND student_id IN (SELECT id FROM students WHERE class_id = $1)
			  RETURNING student_id`,
			[classId]
		);
		const previousAbsentIds = removed.rows.map((row) => Number(row.student_id));

		const inserted = await client.query(INSERT_ABSENT_SQL, [
			absentStudentIds,
			teacherId,
			classId,
		]);
		const newAbsentIds = inserted.rows.map((row) => Number(row.student_id));

		await client.query(
			`UPDATE attendance_submissions
			    SET absent_count = $2,
			        modified_count = modified_count + 1,
			        marked_by = $3
			  WHERE id = $1`,
			[sub.id, newAbsentIds.length, teacherId]
		);

		return { ok: true, previousAbsentIds, newAbsentIds };
	});
}

/**
 * The admin correction. Same replace-the-list mechanics as modifyAttendance,
 * but with two deliberate differences:
 *   - no modified_count check (admins bypass the one-edit rule)
 *   - if NO submission exists yet today, it is created (marked_by = the admin),
 *     so the office can mark a class whose teacher never submitted
 *
 * modified_count still increments on a replace: the column then honestly reads
 * as "how many corrections this record has survived".
 *
 * @returns {Promise<{created: boolean, previousAbsentIds: number[], newAbsentIds: number[]}>}
 */
export async function adminOverrideAttendance({ classId, adminId, absentStudentIds }) {
	return withTransaction(async (client) => {
		const found = await client.query(
			`SELECT id
			   FROM attendance_submissions
			  WHERE class_id = $1
			    AND date = ${TODAY_IST}
			  FOR UPDATE`,
			[classId]
		);
		const existing = found.rows[0];

		const removed = await client.query(
			`DELETE FROM student_attendance
			  WHERE date = ${TODAY_IST}
			    AND status = 'absent'
			    AND student_id IN (SELECT id FROM students WHERE class_id = $1)
			  RETURNING student_id`,
			[classId]
		);
		const previousAbsentIds = removed.rows.map((row) => Number(row.student_id));

		const inserted = await client.query(INSERT_ABSENT_SQL, [
			absentStudentIds,
			adminId,
			classId,
		]);
		const newAbsentIds = inserted.rows.map((row) => Number(row.student_id));

		if (existing) {
			await client.query(
				`UPDATE attendance_submissions
				    SET absent_count = $2,
				        modified_count = modified_count + 1,
				        marked_by = $3
				  WHERE id = $1`,
				[existing.id, newAbsentIds.length, adminId]
			);
		} else {
			await client.query(
				`INSERT INTO attendance_submissions
				        (class_id, date, marked_by, absent_count, modified_count)
				 VALUES ($1, ${TODAY_IST}, $2, $3, 0)`,
				[classId, adminId, newAbsentIds.length]
			);
		}

		return { created: !existing, previousAbsentIds, newAbsentIds };
	});
}
