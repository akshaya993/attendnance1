// app/attendance/admin/page.js
// The admin's attendance dashboard - STUDENTS ONLY for now.
//
// THE STAFF TAB IS DELIBERATELY ABSENT (owner's decision): nothing in the app
// records staff clock-in data yet, so a staff tab could only ever show empty
// states. It returns when a staff-attendance feature exists.
//
// Server-rendered on every visit, so the numbers are always live - the
// percentage never waits for late teachers: it averages only the classes that
// HAVE submitted, with a "N of 16 classes submitted" counter next to it.
//
// Each class card links to the drill-down page (absent list + admin edit).

import Link from "next/link";

import BackLink from "@/components/BackLink";
import AttendanceStatCard from "@/components/attendance/AttendanceStatCard";
import { requireActiveSession } from "@/lib/guard";
import { todayIst } from "@/lib/attendance";
import { getSchoolToday } from "@/lib/repos/attendanceRepo";

export const metadata = { title: "Attendance | Greenwood School" };

function round1(value) {
	return Math.round(value * 10) / 10;
}

export default async function AdminAttendancePage() {
	// session.branchId is a NUMBER from the signed token; profile.branchId from
	// pg would be a BIGINT string ("4") and silently fail === comparisons.
	const { session } = await requireActiveSession();

	const rows = await getSchoolToday(session.branchId);

	// Contract weights: absent = 0, half_day = 0.5, late = full presence.
	const classes = rows.map((row) => {
		let percentage = null;
		if (row.submitted && row.totalStudents > 0) {
			const attended =
				row.totalStudents - row.absentCount - row.halfCount * 0.5;
			percentage = round1((attended / row.totalStudents) * 100);
		}
		return { ...row, percentage };
	});

	const submittedClasses = classes.filter((row) => row.submitted);
	let schoolPercentage = null;
	if (submittedClasses.length > 0) {
		const totalStudents = submittedClasses.reduce(
			(sum, row) => sum + row.totalStudents,
			0
		);
		const attended = submittedClasses.reduce(
			(sum, row) =>
				sum + (row.totalStudents - row.absentCount - row.halfCount * 0.5),
			0
		);
		if (totalStudents > 0) {
			schoolPercentage = round1((attended / totalStudents) * 100);
		}
	}

	const { label } = todayIst();

	return (
		<div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
			<BackLink href="/admin" />
			<p className="label-micro mt-4 text-muted">PORTAL / ADMIN / ATTENDANCE</p>
			<h1 className="mt-3 text-3xl">Attendance today</h1>
			<p className="mt-2 text-sm text-muted">
				{label} - updates every time this page is opened
			</p>

			<div className="mt-6">
				<AttendanceStatCard
					label="School today"
					percentage={schoolPercentage}
					emptyText="No class has submitted attendance yet today"
					caption={`${submittedClasses.length} of ${classes.length} classes submitted`}
				/>
			</div>

			<p className="label-micro mt-8 text-muted">CLASS BY CLASS</p>
			<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
				{classes.map((cls) => (
					<Link
						key={cls.classId}
						href={`/attendance/admin/class/${cls.classId}`}
						className={`card flex min-h-[92px] flex-col justify-center p-4 transition-colors duration-150 hover:bg-raised ${
							cls.submitted ? "" : "opacity-60"
						}`}
					>
						<span className="label-micro text-muted">
							CLASS {cls.classNumber} {cls.section}
						</span>
						{cls.submitted ? (
							<>
								<span className="mt-1 text-xl">
									{cls.percentage}
									<span className="text-sm text-muted">%</span>
								</span>
								<span className="label-micro mt-1 text-muted">
									{cls.absentCount} absent today
								</span>
							</>
						) : (
							<span className="mt-2 text-sm text-muted">Not submitted yet</span>
						)}
					</Link>
				))}
			</div>
		</div>
	);
}
