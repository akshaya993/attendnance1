// app/api/fees/receipt/[receiptNumber]/route.js
// GET /api/fees/receipt/101015  ->  a real PDF file download.
//
// ADDED AS AN ADDITION, not a replacement: the printable receipt PAGES
// (/admin/fees/receipt/..., /parent/fees/receipt/...) stay exactly as they
// are; this route is the "Download PDF" button's target. Access rules are
// copied from those pages on purpose: admin = same branch, parent = own
// child only. Another family's receipt number answers 404, not a hint.
//
// FONT GOTCHA (documented in the feature 04 docs): pdfkit's built-in
// Helvetica cannot draw the rupee symbol. PDFs therefore write amounts as
// "Rs 25,500.00" while the screens keep showing "₹25,500.00". If a proper
// rupee glyph is ever required in the PDF, a TTF font containing it must be
// embedded - a deliberate, separate change.

import PDFDocument from "pdfkit";

import { requireActiveApiSession } from "@/lib/guard";
import { feeCategoryLabel, formatDateTimeIst } from "@/lib/format";
import { getReceipt } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

/** pdfkit works in streams; collect the chunks into one Buffer. */
function buildReceiptPdf(receipt) {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ size: "A4", margin: 56 });
		const chunks = [];
		doc.on("data", (chunk) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		const money = (value) =>
			"Rs " +
			new Intl.NumberFormat("en-IN", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(Number(value ?? 0));

		// Header
		doc.fontSize(11).fillColor("#666666").text("FEE RECEIPT", { align: "center" });
		doc.moveDown(0.4);
		doc.fontSize(20).fillColor("#111111").text(receipt.branchName, { align: "center" });
		doc.moveDown(0.3);
		doc
			.fontSize(10)
			.fillColor("#666666")
			.text(`Receipt No. ${receipt.receiptNumber}`, { align: "center" });
		doc.moveDown(1.6);
		doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor("#cccccc").stroke();
		doc.moveDown(1);

		// Detail rows
		const rows = [
			["Student", `${receipt.studentName} (Class ${receipt.classNumber} ${receipt.section}, Roll ${receipt.rollNumber})`],
			["Category", feeCategoryLabel(receipt.category)],
			["Payment mode", receipt.paymentMode.toUpperCase()],
			["Date", formatDateTimeIst(receipt.createdAt)],
			["Received by", receipt.receivedByName ?? "-"],
		];
		for (const [label, value] of rows) {
			doc
				.fontSize(10)
				.fillColor("#666666")
				.text(label.toUpperCase(), { continued: false });
			doc.fontSize(12).fillColor("#111111").text(value);
			doc.moveDown(0.6);
		}

		// Amount highlight box
		doc.moveDown(0.6);
		const boxTop = doc.y;
		doc.roundedRect(56, boxTop, 483, 64, 8).fill("#f1efe9");
		doc
			.fontSize(10)
			.fillColor("#666666")
			.text("AMOUNT RECEIVED", 56, boxTop + 12, { width: 483, align: "center" });
		doc
			.fontSize(22)
			.fillColor("#111111")
			.text(money(receipt.amountPaid), 56, boxTop + 28, { width: 483, align: "center" });

		doc.moveDown(4);
		doc
			.fontSize(9)
			.fillColor("#888888")
			.text("This is a computer-generated receipt.", { align: "center" });

		doc.end();
	});
}

export async function GET(request, { params }) {
	try {
		// Any signed-in role may land here; the ownership checks below decide.
		const { session: user } = await requireActiveApiSession(request);

		const { receiptNumber } = await params;
		if (!/^\d+$/.test(receiptNumber ?? "")) {
			return Response.json(
				{ ok: false, error: "Invalid receipt number" },
				{ status: 400 }
			);
		}

		const receipt = await getReceipt(receiptNumber);
		if (!receipt) {
			return Response.json(
				{ ok: false, error: "Receipt not found" },
				{ status: 404 }
			);
		}

		const isAdminOfBranch =
			user.role === "admin" && receipt.branchId === user.branchId;
		const isOwningParent =
			user.role === "parent" && receipt.parentProfileId === user.profileId;
		if (!isAdminOfBranch && !isOwningParent) {
			return Response.json(
				{ ok: false, error: "Receipt not found" },
				{ status: 404 }
			);
		}

		const pdfBuffer = await buildReceiptPdf(receipt);

		return new Response(pdfBuffer, {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="receipt-${receipt.receiptNumber}.pdf"`,
				"Content-Length": String(pdfBuffer.length),
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/receipt] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
