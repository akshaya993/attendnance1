// app/admin/attendance/class/[classId]/page.js
// The admin drill-down: exactly who is absent in one class today, and the
// "Admin Edit" control that corrects the record (bypasses the teacher's
// one-edit limit; every override is audit-logged).
//
// params arrives as a Promise in Next.js 16 - always await it.

import { notFound } from "next/navigation";

import BackLink from "@/components/BackLink";
import StudentAttendanceList from "@/components/attendance/StudentAttendanceList";
import { requireActiveSession } from "@/lib/guard";
import { todayIst } from "@/lib/attendance";
import {
	getClassExceptionsToday,
	getClassInfo,
	getClassRoster,
	getTodayClassState,
} from "@/lib/repos/attendanceRepo";

export const metadata = { title: "Class attendance | Greenwood School" };

const STATUS_CHIP = {
	absent: { label: "Absent", className: "bg-danger-soft text-danger" },
	late: { label: "Late", className: "bg-warn-soft text-warn" },
	half_day: { label: "Half day", className: "bg-warn-soft text-warn" },
};

export default async function AdminClassAttendancePage({ params }) {
	// session.branchId is a NUMBER from the signed token; profile.branchId from
	// pg would be a BIGINT string ("4") and silently fail === comparisons.
	const { session } = await requireActiveSession();

	const { classId: rawClassId } = await params;
	if (!/^\d+$/.test(rawClassId ?? "")) notFound();

	const classInfo = await getClassInfo(Number(rawClassId));
	if (!classInfo || classInfo.branchId !== session.branchId) notFound();

	const [students, state, exceptions] = await Promise.all([
		getClassRoster(classInfo.id),
		getTodayClassState(classInfo.id),
		getClassExceptionsToday(classInfo.id),
	]);

	const { label } = todayIst();
	const submitted = Boolean(state.submission);

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<BackLink href="/admin/attendance" label="ATTENDANCE" />
			<p className="label-micro mt-4 text-muted">
				PORTAL / ADMIN / ATTENDANCE / CLASS
			</p>
			<h1 className="mt-3 text-3xl">
				Class {classInfo.classNumber} {classInfo.section}
			</h1>
			<p className="mt-2 text-sm text-muted">
				{label} - {students.length} students
			</p>

			{/* ---------------- TODAY'S EXCEPTIONS ---------------- */}
			<p className="label-micro mt-6 text-muted">NOT FULLY PRESENT TODAY</p>
			{!submitted ? (
				<div className="card mt-3 p-6">
					<p className="text-sm text-muted">
						Attendance has not been submitted for this class today.
					</p>
				</div>
			) : exceptions.length === 0 ? (
				<div className="card mt-3 p-6">
					<p className="text-sm text-muted">
						Everyone is present today.
					</p>
				</div>
			) : (
				<div className="card mt-3 overflow-hidden p-0">
					{exceptions.map((row) => {
						const chip = STATUS_CHIP[row.status] ?? STATUS_CHIP.absent;
						return (
							<div
								key={row.studentId}
								className="flex min-h-11 items-center gap-3 border-b border-soft px-3.5 py-2.5 last:border-b-0"
							>
								<span className="label-micro w-8 shrink-0 text-muted">
									{row.rollNumber}
								</span>
								<span className="min-w-0 flex-1 truncate text-sm">
									{row.fullName}
								</span>
								<span className={`pill shrink-0 ${chip.className}`}>
									{chip.label}
								</span>
							</div>
						);
					})}
				</div>
			)}

			{/* ---------------- ADMIN EDIT ---------------- */}
			<p className="label-micro mt-8 text-muted">CORRECT THE RECORD</p>
			<div className="mt-3">
				<StudentAttendanceList
					classId={classInfo.id}
					students={students}
					initialAbsentIds={state.absentIds}
					submitted={submitted}
					canEdit={true}
					mode="admin"
					markedByName={state.submission?.markedByName ?? null}
					modifiedCount={state.submission?.modifiedCount ?? 0}
				/>
			</div>
		</div>
	);
}
