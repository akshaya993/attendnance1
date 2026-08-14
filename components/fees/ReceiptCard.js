"use client";

// components/fees/ReceiptCard.js
// The printable fee receipt, shared by the admin and parent receipt screens.
//
// WHY A PRINTABLE PAGE AND NOT A PDF (owner's decision): the prompt imagined a
// pdfkit-generated file, but pdfkit is not installed and every phone and
// browser can already Print / Save-as-PDF this page. Zero new packages, zero
// new failure modes. The feature-04 docs explain exactly how to rebuild this
// as a real PDF later without breaking anything.
//
// This is a client component for ONE reason: the Print button needs
// window.print(). All data arrives as plain props from the server page.

import { feeCategoryLabel, formatDateTimeIst, formatMoney } from "@/lib/format";

const MODE_LABEL = { cash: "Cash", card: "Card", upi: "UPI" };

export default function ReceiptCard({ receipt }) {
	const rows = [
		["Student", `${receipt.studentName} (Class ${receipt.classNumber} ${receipt.section}, Roll ${receipt.rollNumber})`],
		["Category", feeCategoryLabel(receipt.category)],
		["Amount paid", formatMoney(receipt.amountPaid)],
		["Payment mode", MODE_LABEL[receipt.paymentMode] ?? receipt.paymentMode],
		["Date", formatDateTimeIst(receipt.createdAt)],
		["Received by", receipt.receivedByName ?? "-"],
	];

	return (
		<div className="card mx-auto w-full max-w-md p-6">
			{/* Header */}
			<div className="border-b border-line pb-4 text-center">
				<p className="label-micro text-muted">FEE RECEIPT</p>
				<h1 className="mt-2 text-2xl">{receipt.branchName}</h1>
				<p className="label-micro mt-2 text-muted">
					RECEIPT NO. {receipt.receiptNumber}
				</p>
			</div>

			{/* Detail rows */}
			<dl className="mt-4 space-y-3">
				{rows.map(([label, value]) => (
					<div key={label} className="flex items-start justify-between gap-4">
						<dt className="label-micro shrink-0 pt-0.5 text-muted">{label}</dt>
						<dd className="text-right text-sm">{value}</dd>
					</div>
				))}
			</dl>

			{/* Amount highlight */}
			<div className="mt-6 rounded-lg bg-raised p-4 text-center">
				<p className="label-micro text-muted">AMOUNT RECEIVED</p>
				<p className="mt-1 text-3xl">{formatMoney(receipt.amountPaid)}</p>
			</div>

			<p className="label-micro mt-6 text-center text-muted">
				This is a computer-generated receipt.
			</p>

			{/* Hidden when printing */}
			<button
				type="button"
				onClick={() => window.print()}
				className="cta mt-6 w-full print:hidden"
			>
				Print / Save as PDF
			</button>
			{/* A real .pdf file, generated on the server by the receipt PDF route.
			    A plain link - no JavaScript needed. */}
			<a
				href={`/api/fees/receipt/${receipt.receiptNumber}`}
				className="label-micro mt-3 block text-center text-muted hover:text-body print:hidden"
			>
				Download as PDF file
			</a>
		</div>
	);
}
