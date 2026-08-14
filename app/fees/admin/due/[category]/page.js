// app/fees/admin/due/[category]/page.js
// Class-level dues for one category: which classes have unpaid students,
// how many, and how much. A row tap drills into the class's unpaid list.
//
// params arrives as a Promise in Next.js 16 - always await it.

import { notFound } from "next/navigation";

import BackLink from "@/components/BackLink";
import DueTable from "@/components/fees/DueTable";
import { requireActiveSession } from "@/lib/guard";
import { feeCategoryLabel, formatMoney } from "@/lib/format";
import { FEE_CATEGORIES } from "@/lib/format";
import { getClassDues } from "@/lib/repos/feeRepo";

export const metadata = { title: "Dues | Greenwood School" };

const COLUMNS = [
	{ key: "classLabel", label: "Class" },
	{ key: "studentsWithDues", label: "Students with dues", align: "right" },
	{ key: "totalDue", label: "Total due", align: "right" },
];

export default async function DueCategoryPage({ params }) {
	const { session } = await requireActiveSession();

	const { category } = await params;
	if (!FEE_CATEGORIES.includes(category)) notFound();

	const rows = await getClassDues(session.branchId, category);

	const tableRows = rows.map((row) => ({
		id: row.classId,
		classLabel: `Class ${row.classNumber} ${row.section}`,
		studentsWithDues: row.studentsWithDues,
		totalDue: formatMoney(row.totalDue),
	}));

	return (
		<div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
			<BackLink href="/fees/admin" label="FEES" />
			<p className="label-micro mt-4 text-muted">
				PORTAL / ADMIN / FEES / {category.toUpperCase()}
			</p>
			<h1 className="mt-3 text-3xl">{feeCategoryLabel(category)} dues</h1>
			<p className="mt-2 text-sm text-muted">
				Class by class. Tap a class to see exactly who has not paid.
			</p>

			<DueTable
				columns={COLUMNS}
				rows={tableRows}
				rowHref={(row) => `/fees/admin/due/${category}/${row.id}`}
				emptyText={`No ${feeCategoryLabel(category).toLowerCase()} dues anywhere right now.`}
			/>
		</div>
	);
}
