// lib/attendance.js
// -----------------------------------------------------------------------------
// FEATURE 01's NON-SQL BRAIN. Small on purpose.
//
// Two jobs live here because all three write routes (submit, modify, override)
// share them:
//   todayIst()        - "today" as seen in India, for labels and audit details
//   notifyAbsences()  - tell each absent child's parent, once per child
//
// SERVER ONLY. This file reaches lib/notify.js and (through it) lib/db.js, so
// a "use client" component must never import it.
// -----------------------------------------------------------------------------

import { createNotification } from "@/lib/notify";
import { getParentInfoForStudents } from "@/lib/repos/attendanceRepo";

/**
 * "Today" in India, in the two shapes this feature needs:
 *   iso   - '2026-08-13'  (goes into the audit log's details)
 *   label - '13 Aug 2026' (goes into notification text and screen headers)
 *
 * The timeZone option makes the answer correct no matter what timezone the
 * server machine itself is set to. The database independently computes the
 * same "today" inside SQL - the two agree because both pin to Asia/Kolkata.
 */
export function todayIst() {
	const now = new Date();
	const iso = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Kolkata",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const label = new Intl.DateTimeFormat("en-IN", {
		timeZone: "Asia/Kolkata",
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(now);
	return { iso, label };
}

/**
 * Sends one absence notification per child to that child's OWN parent.
 *
 * DELIBERATE CHOICES:
 *   - priority "important": the parent's phone actually buzzes (the project
 *     owner asked for that), but it is not the red "urgent" emergency level
 *     reserved for things like "school closed tomorrow".
 *   - one notification per child, addressed to one parent: a family never
 *     learns anything about another family's child.
 *   - source "attendance": keeps these OUT of the broadcast Sent list, which
 *     only shows messages a human deliberately wrote.
 *   - linkUrl "/parent/attendance": tapping the phone notification opens the
 *     child's attendance screen directly.
 *
 * NEVER THROWS and NEVER blocks the caller's success. Attendance is already
 * committed by the time this runs; a notification hiccup must not turn a
 * saved attendance sheet into an error on the teacher's screen. Each child is
 * wrapped individually so one bad row cannot silence the rest.
 *
 * @returns {Promise<{notified: number}>} how many parents were messaged
 */
export async function notifyAbsences({ branchId, actorId, classLabel, studentIds }) {
	if (!Array.isArray(studentIds) || studentIds.length === 0) {
		return { notified: 0 };
	}

	let recipients;
	try {
		recipients = await getParentInfoForStudents(studentIds);
	} catch (err) {
		console.error("[attendance] could not look up parents for alerts:", err);
		return { notified: 0 };
	}

	const { label } = todayIst();
	let notified = 0;

	for (const recipient of recipients) {
		if (!recipient.parentProfileId) continue;
		try {
			await createNotification({
				branchId,
				title: `Absence marked: ${recipient.studentName}`,
				body:
					`${recipient.studentName} (${classLabel}) was marked absent ` +
					`today, ${label}.`,
				priority: "important",
				kind: "notice",
				source: "attendance",
				linkUrl: "/parent/attendance",
				createdBy: actorId,
				recipientProfileIds: [recipient.parentProfileId],
			});
			notified += 1;
		} catch (err) {
			console.error(
				`[attendance] absence alert failed for student ${recipient.studentId}:`,
				err
			);
		}
	}

	return { notified };
}
