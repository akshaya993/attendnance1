// app/admin/fees/today/page.js
// Today's collections: every receipt issued today (IST calendar day),
// newest first, with the running total on top. The list resets at midnight
// by itself - it is derived from receipt timestamps, never a cron job.

import BackLink from "@/components/BackLink";
import DueTable from "@/components/fees/DueTable";
import StatCard from "@/components/fees/StatCard";
import { requireActiveSession } from "@/lib/guard";
import { feeCategoryLabel, formatDateIst, formatDateTimeIst, formatMoney } from "@/lib/format";
import { getTodaysCollections } from "@/lib/repos/feeRepo";

export const metadata = { title: "Today's collections | Greenwood School" };

const COLUMNS = [
	{ key: "time", label: "Time" },
	{ key: "student", label: "Student" },
	{ key: "classLabel", label: "Class" },
	{ key: "category", label: "Category" },
	{ key: "mode", label: "Mode" },
	{ key: "amount", label: "Amount", align: "right" },
];

const MODE_LABEL = { cash: "Cash", card: "Card", upi: "UPI" };

export default async function AdminTodayPage() {
	const { session } = await requireActiveSession();

	const { rows, totalCollected, receiptCount } = await getTodaysCollections(
		session.branchId
	);

	const tableRows = rows.map((row) => ({
		id: row.receiptId,
		time: formatDateTimeIst(row.createdAt).split(", ")[1] ?? "",
		student: row.studentName,
		classLabel: `${row.classNumber} ${row.section}`,
		category: feeCategoryLabel(row.category),
		mode: MODE_LABEL[row.paymentMode] ?? row.paymentMode,
		amount: formatMoney(row.amountPaid),
		receiptNumber: row.receiptNumber,
	}));

	return (
		<div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-12">
			<BackLink href="/admin/fees" label="FEES" />
			<p className="label-micro mt-4 text-muted">PORTAL / ADMIN / FEES / TODAY</p>
			<h1 className="mt-3 text-3xl">Today&apos;s collections</h1>
			<p className="mt-2 text-sm text-muted">{formatDateIst(new Date())}</p>

			<div className="mt-6">
				<StatCard
					label="Collected today"
					amount={formatMoney(totalCollected)}
					caption={`${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"}`}
					tone="ok"
				/>
			</div>

			<div className="mt-6">
				<DueTable
					columns={COLUMNS}
					rows={tableRows}
					rowHref={(row) => `/admin/fees/receipt/${row.receiptNumber}`}
					emptyText="No collections yet today."
				/>
			</div>
		</div>
	);
}
