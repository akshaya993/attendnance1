// app/parent/fees/page.js
// The parent's fee screen: total outstanding on top, a per-category breakdown
// (a category with no dues shows 0 rather than hiding), then the payment
// history (last 12 months, each row opening the receipt view).
//
// CHILD SELECTION mirrors the attendance page exactly: the same temporary
// link-based picker (?student=<id>), shown only when the family has 2+
// children. Feature 11 replaces both stand-ins with the real ChildSwitcher.

import Link from "next/link";

import BackLink from "@/components/BackLink";
import StatCard from "@/components/fees/StatCard";
import { requireActiveSession } from "@/lib/guard";
import {
	FEE_CATEGORIES,
	feeCategoryLabel,
	formatDateIst,
	formatMoney,
} from "@/lib/format";
import { getChildrenOfParent } from "@/lib/repos/attendanceRepo";
import { getParentSummary } from "@/lib/repos/feeRepo";

export const metadata = { title: "Fees | Greenwood School" };

export default async function ParentFeesPage({ searchParams }) {
	const { session } = await requireActiveSession();

	const params = await searchParams;
	const wantedStudent = params?.student;

	const children = await getChildrenOfParent(session.profileId);

	if (children.length === 0) {
		return (
			<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
				<BackLink href="/parent" />
				<p className="label-micro mt-4 text-muted">PORTAL / PARENT / FEES</p>
				<h1 className="mt-3 text-3xl">Fees</h1>
				<div className="card mt-8 p-6">
					<p className="text-sm text-muted">
						No children are linked to this account. Please contact the school
						office.
					</p>
				</div>
			</div>
		);
	}

	// Unknown / someone else's id silently falls back to the first child; the
	// API hard-403s any actual non-owner fetch.
	const selected =
		children.find((child) => String(child.id) === String(wantedStudent)) ??
		children[0];

	const summary = await getParentSummary(selected.id);

	// Per-category view of the four known categories, in fixed display order,
	// summing nothing in JavaScript - the per-row strings come from SQL.
	const feeByCategory = new Map(
		summary.fees.map((fee) => [fee.category, fee])
	);
	const totalOutstanding = summary.fees
		.reduce((sum, fee) => sum + Number(fee.balanceDue), 0)
		.toFixed(2);

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<BackLink href="/parent" />
			<p className="label-micro mt-4 text-muted">PORTAL / PARENT / FEES</p>
			<h1 className="mt-3 text-3xl">Fees</h1>

			{children.length > 1 ? (
				<div className="mt-4 flex flex-wrap gap-2">
					{children.map((child) => {
						const active = child.id === selected.id;
						return (
							<Link
								key={child.id}
								href={`/parent/fees?student=${child.id}`}
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
				<StatCard
					label="Total outstanding balance"
					amount={formatMoney(totalOutstanding)}
					tone={Number(totalOutstanding) > 0 ? "danger" : "ok"}
					caption={
						Number(totalOutstanding) > 0
							? "Please pay at the school office"
							: "All fees are settled. Thank you!"
					}
				/>
			</div>

			<p className="label-micro mt-8 text-muted">BY CATEGORY</p>
			<div className="card mt-3 overflow-hidden p-0">
				{FEE_CATEGORIES.map((category) => {
					const fee = feeByCategory.get(category);
					const due = fee ? fee.balanceDue : "0";
					const hasDue = Number(due) > 0;
					return (
						<div
							key={category}
							className="flex min-h-11 items-center justify-between gap-3 border-b border-soft px-4 py-3 last:border-b-0"
						>
							<span className="text-sm">{feeCategoryLabel(category)}</span>
							<span
								className={`font-mono text-[13px] ${
									hasDue ? "text-danger" : "text-muted"
								}`}
							>
								{fee ? formatMoney(due) : "-"}
							</span>
						</div>
					);
				})}
			</div>

			<p className="label-micro mt-8 text-muted">
				PAYMENT HISTORY (LAST 12 MONTHS)
			</p>
			{summary.receipts.length === 0 ? (
				<div className="card mt-3 p-6">
					<p className="text-sm text-muted">No payments in the last 12 months.</p>
				</div>
			) : (
				<div className="card mt-3 overflow-hidden p-0">
					{summary.receipts.map((receipt) => (
						<Link
							key={receipt.receiptId}
							href={`/parent/fees/receipt/${receipt.receiptNumber}`}
							className="flex min-h-12 items-center justify-between gap-3 border-b border-soft px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-raised"
						>
							<span>
								<span className="block text-sm">
									{feeCategoryLabel(receipt.category)} -{" "}
									{formatMoney(receipt.amountPaid)}
								</span>
								<span className="label-micro mt-0.5 block text-muted">
									{formatDateIst(receipt.createdAt)} - Receipt #
									{receipt.receiptNumber} - {receipt.paymentMode.toUpperCase()}
								</span>
							</span>
							<span className="label-micro shrink-0 text-muted">VIEW</span>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
