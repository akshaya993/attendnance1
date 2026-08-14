// app/teacher/attendance/page.js
// The teacher's attendance screen.
//
// ONE PAGE, TWO VIEWS, decided by the URL (no client-side screen switching):
//   /teacher/attendance            -> the class grid (ClassPicker)
//   /teacher/attendance?classId=49 -> the marking sheet for that class
//
// Server component: reads come straight from the repos (allowed - pages never
// WRITE; writes go through app/api/*). searchParams arrives as a Promise in
// Next.js 16 - always await it.
//
// Teachers may mark ANY class (owner's decision, like broadcasting), so the
// grid lists every class in the branch. The branch itself comes from the
// session, never from the URL.

import { notFound } from "next/navigation";

import BackLink from "@/components/BackLink";
import ClassPicker from "@/components/attendance/ClassPicker";
import StudentAttendanceList from "@/components/attendance/StudentAttendanceList";
import { requireActiveSession } from "@/lib/guard";
import { todayIst } from "@/lib/attendance";
import { listClassesByBranch } from "@/lib/repos/coreRepo";
import {
	getClassInfo,
	getClassRoster,
	getTodayClassState,
} from "@/lib/repos/attendanceRepo";

export const metadata = { title: "Attendance | Greenwood School" };

export default async function TeacherAttendancePage({ searchParams }) {
	// Session validity + the session_epoch kill switch. The ROLE check already
	// happened in proxy.js (ROLE_PREFIXES) before this page was reached.
	// branchId comes from the SESSION (a number, from the signed token).
	// profile.branchId would be the raw BIGINT from pg - a STRING ("4"), and
	// "4" !== 4 already caused a silent 404 here. session it is.
	const { session } = await requireActiveSession();

	const params = await searchParams;
	const rawClassId = params?.classId;

	// ---------------- VIEW 1: pick a class ----------------
	if (!rawClassId) {
		const classes = (await listClassesByBranch(session.branchId)).map(
			(cls) => ({
				id: Number(cls.id),
				classNumber: cls.class_number,
				section: cls.section,
			})
		);

		return (
			<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
				<BackLink href="/teacher" />
				<p className="label-micro mt-4 text-muted">PORTAL / TEACHER / ATTENDANCE</p>
				<h1 className="mt-3 text-3xl">Mark attendance</h1>
				<p className="mt-2 text-sm text-muted">
					Pick a class. Everyone starts as Present - tap a student once to mark
					them Absent.
				</p>
				<ClassPicker classes={classes} basePath="/teacher/attendance" />
			</div>
		);
	}

	// ---------------- VIEW 2: the marking sheet ----------------
	if (!/^\d+$/.test(rawClassId)) notFound();

	const classInfo = await getClassInfo(Number(rawClassId));
	// A class from another branch does not exist as far as this session knows.
	if (!classInfo || classInfo.branchId !== session.branchId) notFound();

	const [students, state] = await Promise.all([
		getClassRoster(classInfo.id),
		getTodayClassState(classInfo.id),
	]);

	const { label } = todayIst();
	const submitted = Boolean(state.submission);

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<BackLink href="/teacher/attendance" label="CLASSES" />
			<p className="label-micro mt-4 text-muted">
				PORTAL / TEACHER / ATTENDANCE
			</p>
			<h1 className="mt-3 text-3xl">
				Class {classInfo.classNumber} {classInfo.section}
			</h1>
			<p className="mt-2 text-sm text-muted">
				{label} - {students.length} students
			</p>

			<div className="mt-4">
				<StudentAttendanceList
					classId={classInfo.id}
					students={students}
					initialAbsentIds={state.absentIds}
					submitted={submitted}
					canEdit={submitted && state.submission.modifiedCount === 0}
					mode="teacher"
					markedByName={state.submission?.markedByName ?? null}
					modifiedCount={state.submission?.modifiedCount ?? 0}
				/>
			</div>
		</div>
	);
}
