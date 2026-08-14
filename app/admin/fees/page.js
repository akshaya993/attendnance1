// app/admin/fees/page.js
// The fee management landing page: the money pulse of the school.
// Total outstanding on top, one clickable card per fee category (all four -
// a category with no dues shows 0 rather than hiding), and quick links to the
// pay kiosk and today's collections.

import Link from "next/link";

import BackLink from "@/components/BackLink";
import StatCard from "@/components/fees/StatCard";
import { requireActiveSession } from "@/lib/guard";
import { FEE_CATEGORIES, feeCategoryLabel, formatMoney } from "@/lib/format";
import { getBranchSummary } from "@/lib/repos/feeRepo";

export const metadata = { title: "Fees | Greenwood School" };

export default async function AdminFeesPage() {
	// session.branchId is the NUMBER from the signed token (profile.branchId
	// from pg would be a string - see the feature 01 decisions).
	const { session } = await requireActiveSession();

	const rows = await getBranchSummary(session.branchId);
	const totalRow = rows.find((row) => row.category === null);
	const totalDue = totalRow ? totalRow.totalDue : "0";
	const dueCount = totalRow ? totalRow.studentsWithDues : 0;

	return (
		<div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
			<BackLink href="/admin" />
			<p className="label-micro mt-4 text-muted">PORTAL / ADMIN / FEES</p>
			<h1 className="mt-3 text-3xl">Fees</h1>
			<p className="mt-2 text-sm text-muted">
				Collect payments, chase dues, see today&apos;s collections.
			</p>

			<div className="mt-6">
				<StatCard
					label="Total fee due"
					amount={formatMoney(totalDue)}
					caption={`${dueCount} fee ${dueCount === 1 ? "record" : "records"} with dues`}
					tone="danger"
				/>
			</div>

			<p className="label-micro mt-8 text-muted">DUE BY CATEGORY</p>
			<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
				{FEE_CATEGORIES.map((category) => {
					const hit = rows.find((row) => row.category === category);
					return (
						<StatCard
							key={category}
							label={`${feeCategoryLabel(category)} fee due`}
							amount={formatMoney(hit ? hit.totalDue : "0")}
							caption={`${hit ? hit.studentsWithDues : 0} with dues`}
							href={`/admin/fees/due/${category}`}
							tone={hit && Number(hit.totalDue) > 0 ? "warn" : "ok"}
						/>
					);
				})}
			</div>

			<p className="label-micro mt-8 text-muted">COUNTER</p>
			<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Link
					href="/admin/fees/pay"
					className="card block p-5 transition-all duration-150 hover:bg-raised active:scale-[0.98]"
				>
					<p className="label-micro text-muted">PAY FEE</p>
					<p className="mt-2 text-sm text-muted">
						Search a parent&apos;s phone number, collect a payment, print the
						receipt.
					</p>
				</Link>
				<Link
					href="/admin/fees/today"
					className="card block p-5 transition-all duration-150 hover:bg-raised active:scale-[0.98]"
				>
					<p className="label-micro text-muted">TODAY&apos;S COLLECTIONS</p>
					<p className="mt-2 text-sm text-muted">
						Every receipt issued today, with the running total.
					</p>
				</Link>
			</div>
		</div>
	);
}
