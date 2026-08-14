// app/api/fees/pay/route.js
// POST /api/fees/pay
// Body: { feeId, amount, paymentMode }
//
// THE MONEY ENDPOINT. The browser's validation is only a courtesy - every rule
// is re-enforced here and inside the database transaction:
//   - amount is a numeric STRING, max 8 whole digits + 2 decimals (NUMERIC(10,2))
//   - amount > 0 and amount <= balance_due (enforced in SQL, row-locked)
//   - the fee must belong to the admin's own branch
//   - receipt + balance update + audit row commit together, or not at all
//
// After COMMIT (never inside the transaction): the child's parent gets a
// bell notification AND a phone buzz (priority "important" - the owner's
// choice), carrying the receipt number. A notification failure can never
// undo saved money.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { createNotification } from "@/lib/notify";
import { feeCategoryLabel, formatDateIst, formatMoney } from "@/lib/format";
import { getParentInfoForStudents } from "@/lib/repos/attendanceRepo";
import { processPayment } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

const VALID_MODES = new Set(["cash", "card", "upi"]);
// Up to 8 whole digits + up to 2 decimals - exactly what NUMERIC(10,2) holds.
const AMOUNT_SHAPE = /^\d{1,8}(\.\d{1,2})?$/;

export async function POST(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		let body;
		try {
			body = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const feeId = Number(body?.feeId);
		if (!Number.isInteger(feeId) || feeId <= 0) {
			return Response.json(
				{ ok: false, error: "A valid feeId is required" },
				{ status: 400 }
			);
		}

		// Money arrives and travels as a STRING. Floats are never allowed to
		// touch it.
		const amount = String(body?.amount ?? "").trim();
		if (!AMOUNT_SHAPE.test(amount) || Number(amount) <= 0) {
			return Response.json(
				{ ok: false, error: "Enter a valid amount" },
				{ status: 400 }
			);
		}

		const paymentMode = String(body?.paymentMode ?? "");
		if (!VALID_MODES.has(paymentMode)) {
			return Response.json(
				{ ok: false, error: "Pick a payment mode" },
				{ status: 400 }
			);
		}

		const outcome = await processPayment({
			feeId,
			amount,
			paymentMode,
			adminId: user.profileId,
			branchId: user.branchId,
		});

		if (!outcome.ok && outcome.reason === "exceeds") {
			return Response.json(
				{
					ok: false,
					error: `Entered amount exceeded the due (${formatMoney(outcome.balanceDue)})`,
				},
				{ status: 400 }
			);
		}
		if (!outcome.ok) {
			// not_found / wrong_branch - the fee does not exist as far as this
			// admin is concerned.
			return Response.json(
				{ ok: false, error: "Fee record not found" },
				{ status: 404 }
			);
		}

		// ---------------- parent alert (after commit, never blocking) ----------------
		let notified = 0;
		try {
			const recipients = await getParentInfoForStudents([outcome.studentId]);
			const recipient = recipients[0];
			if (recipient?.parentProfileId) {
				await createNotification({
					branchId: user.branchId,
					title: `Fee payment received - Receipt #${outcome.receiptNumber}`,
					body:
						`${formatMoney(outcome.amountPaid)} received for ` +
						`${feeCategoryLabel(outcome.category)} fees of ` +
						`${recipient.studentName} on ${formatDateIst(new Date())}. ` +
						`New balance: ${formatMoney(outcome.newBalance)}.`,
					priority: "important",
					kind: "notice",
					source: "fees",
					linkUrl: "/fees/parent",
					createdBy: user.profileId,
					recipientProfileIds: [recipient.parentProfileId],
				});
				notified = 1;
			}
		} catch (err) {
			console.error("[api/fees/pay] payment saved but parent alert failed:", err);
		}

		return Response.json({
			ok: true,
			data: {
				receiptId: outcome.receiptId,
				receiptNumber: outcome.receiptNumber,
				amountPaid: outcome.amountPaid,
				category: outcome.category,
				newBalance: outcome.newBalance,
				studentId: outcome.studentId,
				notified,
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/pay] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
