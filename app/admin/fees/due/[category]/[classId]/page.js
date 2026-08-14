// app/admin/fees/due/[category]/[classId]/page.js
// The unpaid-students list for one class + one category, with the "Copy
// Names" button for the office's follow-up messages.

import { notFound } from "next/navigation";

import BackLink from "@/components/BackLink";
import CopyNamesButton from "@/components/fees/CopyNamesButton";
import DueTable from "@/components/fees/DueTable";
import { requireActiveSession } from "@/lib/guard";
import { FEE_CATEGORIES, feeCategoryLabel, formatMoney } from "@/lib/format";
import { getClassInfo } from "@/lib/repos/attendanceRepo";
import { getUnpaidStudents } from "@/lib/repos/feeRepo";

export const metadata = { title: "Unpaid students | Greenwood School" };

const COLUMNS = [
	{ key: "rollNumber", label: "Roll" },
	{ key: "fullName", label: "Student" },
	{ key: "balanceDue", label: "Due", align: "right" },
];

export default async function DueClassPage({ params }) {
	const { session } = await requireActiveSession();

	const { category, classId } = await params;
	if (!FEE_CATEGORIES.includes(category)) notFound();
	if (!/^\d+$/.test(classId ?? "")) notFound();

	const classInfo = await getClassInfo(Number(classId));
	// Another branch's class does not exist as far as this admin knows.
	if (!classInfo || classInfo.branchId !== session.branchId) notFound();

	const students = await getUnpaidStudents(classInfo.id, category);

	const tableRows = students.map((student) => ({
		id: student.studentId,
		rollNumber: student.rollNumber,
		fullName: student.fullName,
		balanceDue: formatMoney(student.balanceDue),
	}));

	return (
		<div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
			<BackLink href={`/admin/fees/due/${category}`} label={category.toUpperCase()} />
			<p className="label-micro mt-4 text-muted">
				PORTAL / ADMIN / FEES / {category.toUpperCase()}
			</p>
			<h1 className="mt-3 text-3xl">
				Class {classInfo.classNumber} {classInfo.section}
			</h1>
			<p className="mt-2 text-sm text-muted">
				{students.length === 0
					? `No ${feeCategoryLabel(category).toLowerCase()} dues in this class.`
					: `${students.length} ${students.length === 1 ? "student has" : "students have"} ${feeCategoryLabel(category).toLowerCase()} dues.`}
			</p>

			<DueTable columns={COLUMNS} rows={tableRows} />

			{students.length > 0 ? (
				<div className="mt-5">
					<CopyNamesButton names={students.map((s) => s.fullName)} />
				</div>
			) : null}
		</div>
	);
}
