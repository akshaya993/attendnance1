// app/parent/attendance/page.js
// The parent's attendance screen: the child's percentage card plus the full
// day-by-day history (one row per day the CHILD'S CLASS took attendance).
//
// CHILD SELECTION: families with more than one child get a simple picker at
// the top (UI context rule 9). It is a row of plain links (?student=<id>),
// not a dropdown library. THIS IS A DELIBERATE STAND-IN: Feature 11 will
// mount the real ChildSwitcher across the whole app. Selection is guarded
// twice - the picker only lists this parent's children, and an unknown
// ?student= id silently falls back to the first child while the API itself
// hard-403s any non-owner request.
//
// Server component: reads come from the repos. searchParams is a Promise in
// Next.js 16 - always await it.

import Link from "next/link";

import BackLink from "@/components/BackLink";
import AttendanceStatCard from "@/components/attendance/AttendanceStatCard";
import { requireActiveSession } from "@/lib/guard";
import {
	getChildrenOfParent,
	getStudentAttendanceSummary,
} from "@/lib/repos/attendanceRepo";

export const metadata = { title: "Attendance | Greenwood School" };

// History row chip: present/late/half_day/absent, using the UI context's
// status colours (ok / warn / danger). Colour is never the only signal - the
// word is always printed too.
const STATUS_CHIP = {
	present: { label: "Present", className: "bg-ok-soft text-ok" },
	absent: { label: "Absent", className: "bg-danger-soft text-danger" },
	late: { label: "Late", className: "bg-warn-soft text-warn" },
	half_day: { label: "Half day", className: "bg-warn-soft text-warn" },
};

function formatDay(value) {
	return new Date(value).toLocaleDateString("en-IN", {
		timeZone: "Asia/Kolkata",
		day: "numeric",
		month: "short",
		weekday: "short",
	});
}

export default async function ParentAttendancePage({ searchParams }) {
	// session.profileId is the login's id (the profile object calls it "id" -
	// use the session field here and the two can never be confused again).
	const { session } = await requireActiveSession();

	const params = await searchParams;
	const wantedStudent = params?.student;

	const children = await getChildrenOfParent(session.profileId);

	if (children.length === 0) {
		return (
			<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
				<BackLink href="/parent" />
				<p className="label-micro mt-4 text-muted">PORTAL / PARENT / ATTENDANCE</p>
				<h1 className="mt-3 text-3xl">Attendance</h1>
				<div className="card mt-8 p-6">
					<p className="text-sm text-muted">
						No children are linked to this account. Please contact the school
						office.
					</p>
				</div>
			</div>
		);
	}

	// The ?student= param is a WISH, not a right: only ids from this parent's
	// own children list are honoured. Anything else quietly shows the first child.
	const selected =
		children.find((child) => String(child.id) === String(wantedStudent)) ??
		children[0];

	const summary = await getStudentAttendanceSummary(selected.id, selected.classId);

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<BackLink href="/parent" />
			<p className="label-micro mt-4 text-muted">PORTAL / PARENT / ATTENDANCE</p>
			<h1 className="mt-3 text-3xl">Attendance</h1>

			{/* Child picker - only rendered when the family has more than one
			    child. Stand-in for Feature 11's ChildSwitcher. */}
			{children.length > 1 ? (
				<div className="mt-4 flex flex-wrap gap-2">
					{children.map((child) => {
						const active = child.id === selected.id;
						return (
							<Link
								key={child.id}
								href={`/parent/attendance?student=${child.id}`}
								className={`pill border ${
									active
										? "border-line bg-raised text-body"
										: "border-soft text-muted hover:text-body"
								}`}
							>
								{child.fullName}
							</Link>
						);
					})}
				</div>
			) : null}

			<p className="mt-4 text-sm text-muted">
				{selected.fullName} - Class {selected.classNumber} {selected.section}
			</p>

			<div className="mt-4">
				<AttendanceStatCard
					label="Attendance this year"
					percentage={summary.percentage}
					caption={
						summary.percentage === null
							? undefined
							: `${summary.attendedDays} of ${summary.workingDays} working days - ${summary.absentDays} absent, ${summary.halfDays} half day, ${summary.lateDays} late`
					}
				/>
			</div>

			<p className="label-micro mt-8 text-muted">DAY-BY-DAY HISTORY</p>
			{summary.history.length === 0 ? (
				<div className="card mt-3 p-6">
					<p className="text-sm text-muted">
						Attendance has not been taken for this class yet.
					</p>
				</div>
			) : (
				<div className="card mt-3 overflow-hidden p-0">
					{summary.history.map((day) => {
						const chip = STATUS_CHIP[day.status] ?? STATUS_CHIP.present;
						return (
							<div
								key={String(day.date)}
								className="flex min-h-11 items-center justify-between gap-3 border-b border-soft px-3.5 py-2.5 last:border-b-0"
							>
								<span className="text-sm">{formatDay(day.date)}</span>
								<span className={`pill ${chip.className}`}>{chip.label}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
