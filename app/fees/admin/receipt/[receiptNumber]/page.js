// app/fees/admin/receipt/[receiptNumber]/page.js
// The admin's print-friendly receipt view. Any receipt in the admin's own
// branch may be opened; another branch's receipt is a 404, not a hint.

import { notFound } from "next/navigation";

import BackLink from "@/components/BackLink";
import ReceiptCard from "@/components/fees/ReceiptCard";
import { requireActiveSession } from "@/lib/guard";
import { getReceipt } from "@/lib/repos/feeRepo";

export const metadata = { title: "Receipt | Greenwood School" };

export default async function AdminReceiptPage({ params }) {
	const { session } = await requireActiveSession();

	const { receiptNumber } = await params;
	if (!/^\d+$/.test(receiptNumber ?? "")) notFound();

	const receipt = await getReceipt(receiptNumber);
	if (!receipt || receipt.branchId !== session.branchId) notFound();

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<div className="print:hidden">
				<BackLink href="/fees/admin/today" label="COLLECTIONS" />
			</div>
			<div className="mt-6">
				<ReceiptCard receipt={receipt} />
			</div>
		</div>
	);
}
