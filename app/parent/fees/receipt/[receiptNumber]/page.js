// app/parent/fees/receipt/[receiptNumber]/page.js
// The parent's print-friendly receipt view. THE OWNERSHIP CHECK IS THE POINT:
// the receipt must belong to a child of the signed-in parent
// (students.parent_profile_id). Another family's receipt is a 404 - the
// parent never learns whether a receipt number exists at all.

import { notFound } from "next/navigation";

import BackLink from "@/components/BackLink";
import ReceiptCard from "@/components/fees/ReceiptCard";
import { requireActiveSession } from "@/lib/guard";
import { getReceipt } from "@/lib/repos/feeRepo";

export const metadata = { title: "Receipt | Greenwood School" };

export default async function ParentReceiptPage({ params }) {
	const { session } = await requireActiveSession();

	const { receiptNumber } = await params;
	if (!/^\d+$/.test(receiptNumber ?? "")) notFound();

	const receipt = await getReceipt(receiptNumber);
	if (!receipt || receipt.parentProfileId !== session.profileId) notFound();

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<div className="print:hidden">
				<BackLink href="/parent/fees" label="FEES" />
			</div>
			<div className="mt-6">
				<ReceiptCard receipt={receipt} />
			</div>
		</div>
	);
}
