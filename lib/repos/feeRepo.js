// lib/repos/feeRepo.js
// -----------------------------------------------------------------------------
// EVERY SQL STATEMENT FOR FEES LIVES IN THIS FILE.
//
// DB CONTRACT (db/schema.sql, frozen): fees, receipts, fee_installments already
// exist. NO DDL IN THIS FILE. Feature 04 adds no migration.
//
// MONEY RULES (non-negotiable):
//   - Money is NUMERIC(10,2). pg returns it as a STRING ("25500.00") and we
//     KEEP it as a string until the moment it is displayed. JavaScript never
//     does arithmetic on money - all maths happens in SQL.
//   - fees.balance_due is a PRECOMPUTED running balance: it is updated in the
//     SAME transaction as the receipt insert, after SELECT ... FOR UPDATE.
//   - A payment covers ONE category. amount_paid may never exceed that fee's
//     balance_due - enforced by the UPDATE's WHERE clause, not by JavaScript.
//
// BRANCH SCOPING: the fees table has NO branch_id column. Every branch filter
// goes through students (fees -> students -> branch_id) and the branch id
// always comes from the signed session, never from the client.
//
// AUDIT: fee payments are logged with lib/audit.js's logAudit(entry, client)
// INSIDE the payment transaction - if the audit row cannot be written, the
// payment rolls back with it. Money and its record can never disagree.
//
// "TODAY" IS ALWAYS IST (Asia/Kolkata), computed inside SQL.
// -----------------------------------------------------------------------------

import { query, withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Midnight IST as a timestamptz boundary - an index-friendly range predicate
// on receipts.created_at (the ::date cast form would not use the index).
const IST_DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata'`;
const IST_DAY_END = `(date_trunc('day', (now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day')) AT TIME ZONE 'Asia/Kolkata'`;

// =============================================================================
// READS
// =============================================================================

/**
 * Branch-wide money pulse: one row per fee category plus a ROLLUP totals row
 * (category = null). Only unpaid rows (balance_due > 0) contribute - the
 * partial index idx_fees_due exists for exactly this scan.
 */
export async function getBranchSummary(branchId) {
	const { rows } = await query(
		`SELECT f.category,
		        (count(*) FILTER (WHERE f.balance_due > 0))::int AS "studentsWithDues",
		        (COALESCE(sum(f.balance_due) FILTER (WHERE f.balance_due > 0), 0))::text AS "totalDue"
		   FROM fees f
		   JOIN students s ON s.id = f.student_id AND s.is_active = true
		  WHERE s.branch_id = $1
		  GROUP BY ROLLUP(f.category)`,
		[branchId]
	);
	return rows;
}

/**
 * Class-level dues for one category: which classes have unpaid students, how
 * many, and how much. Classes with zero dues in this category simply do not
 * appear (INNER JOIN).
 */
export async function getClassDues(branchId, category) {
	const { rows } = await query(
		`SELECT c.id           AS "classId",
		        c.class_number AS "classNumber",
		        c.section,
		        (count(DISTINCT s.id))::int AS "studentsWithDues",
		        sum(f.balance_due)::text    AS "totalDue"
		   FROM classes c
		   JOIN students s ON s.class_id = c.id AND s.is_active = true
		   JOIN fees f ON f.student_id = s.id
		         AND f.category = $2
		         AND f.balance_due > 0
		  WHERE c.branch_id = $1
		  GROUP BY c.id
		  ORDER BY c.class_number, c.section`,
		[branchId, category]
	);
	return rows.map((row) => ({ ...row, classId: Number(row.classId) }));
}

/**
 * The unpaid students of one class in one category, in roll order.
 */
export async function getUnpaidStudents(classId, category) {
	const { rows } = await query(
		`SELECT s.id          AS "studentId",
		        s.full_name   AS "fullName",
		        s.roll_number AS "rollNumber",
		        f.id          AS "feeId",
		        f.balance_due::text  AS "balanceDue",
		        f.total_amount::text AS "totalAmount"
		   FROM fees f
		   JOIN students s ON s.id = f.student_id
		  WHERE s.class_id = $1
		    AND s.is_active = true
		    AND f.category = $2
		    AND f.balance_due > 0
		  ORDER BY s.roll_number`,
		[classId, category]
	);
	return rows.map((row) => ({
		...row,
		studentId: Number(row.studentId),
		feeId: Number(row.feeId),
	}));
}

/**
 * One child's fee position: every fee row (all four categories that exist for
 * them), plus their receipts from the last 12 months, newest first.
 * Ownership is checked by the CALLER (getOwnedStudent) before this runs.
 */
export async function getParentSummary(studentId) {
	const duesResult = await query(
		`SELECT f.id AS "feeId",
		        f.category,
		        f.academic_year AS "academicYear",
		        f.total_amount::text  AS "totalAmount",
		        f.balance_due::text   AS "balanceDue"
		   FROM fees f
		  WHERE f.student_id = $1
		  ORDER BY f.category`,
		[studentId]
	);

	const receiptsResult = await query(
		`SELECT r.id AS "receiptId",
		        r.receipt_number::text AS "receiptNumber",
		        r.amount_paid::text    AS "amountPaid",
		        r.payment_mode         AS "paymentMode",
		        r.created_at           AS "createdAt",
		        f.category
		   FROM receipts r
		   JOIN fees f ON f.id = r.fee_id
		  WHERE f.student_id = $1
		    AND r.created_at >= now() - interval '12 months'
		  ORDER BY r.created_at DESC`,
		[studentId]
	);

	return {
		fees: duesResult.rows.map((row) => ({ ...row, feeId: Number(row.feeId) })),
		receipts: receiptsResult.rows.map((row) => ({
			...row,
			receiptId: Number(row.receiptId),
		})),
	};
}

/**
 * Today's collections: every receipt created today in IST (a CALENDAR day,
 * not a rolling 24 hours - a Monday payment never shows on Tuesday), plus the
 * branch total. The range predicate rides idx_receipts_day.
 */
export async function getTodaysCollections(branchId) {
	const rowsResult = await query(
		`SELECT r.id AS "receiptId",
		        r.receipt_number::text AS "receiptNumber",
		        r.amount_paid::text    AS "amountPaid",
		        r.payment_mode         AS "paymentMode",
		        r.created_at           AS "createdAt",
		        s.full_name    AS "studentName",
		        c.class_number AS "classNumber",
		        c.section,
		        f.category
		   FROM receipts r
		   JOIN fees f ON f.id = r.fee_id
		   JOIN students s ON s.id = f.student_id
		   JOIN classes c ON c.id = s.class_id
		  WHERE s.branch_id = $1
		    AND r.created_at >= ${IST_DAY_START}
		    AND r.created_at <  ${IST_DAY_END}
		  ORDER BY r.created_at DESC`,
		[branchId]
	);

	const totalResult = await query(
		`SELECT COALESCE(sum(r.amount_paid), 0)::text AS "totalCollected",
		        count(*)::int AS "receiptCount"
		   FROM receipts r
		   JOIN fees f ON f.id = r.fee_id
		   JOIN students s ON s.id = f.student_id
		  WHERE s.branch_id = $1
		    AND r.created_at >= ${IST_DAY_START}
		    AND r.created_at <  ${IST_DAY_END}`,
		[branchId]
	);

	return {
		rows: rowsResult.rows.map((row) => ({ ...row, receiptId: Number(row.receiptId) })),
		totalCollected: totalResult.rows[0].totalCollected,
		receiptCount: totalResult.rows[0].receiptCount,
	};
}

/**
 * One receipt, fully dressed for display: money, student, class, branch,
 * category, and who collected it. Access control is the CALLER's job:
 * parents compare parentProfileId with their session, admins compare branchId.
 */
export async function getReceipt(receiptNumber) {
	const { rows } = await query(
		`SELECT r.receipt_number::text AS "receiptNumber",
		        r.amount_paid::text    AS "amountPaid",
		        r.payment_mode         AS "paymentMode",
		        r.created_at           AS "createdAt",
		        s.id            AS "studentId",
		        s.full_name     AS "studentName",
		        s.roll_number   AS "rollNumber",
		        s.parent_profile_id AS "parentProfileId",
		        s.branch_id     AS "branchId",
		        c.class_number  AS "classNumber",
		        c.section,
		        f.category,
		        f.total_amount::text AS "totalAmount",
		        b.name          AS "branchName",
		        p.full_name     AS "receivedByName"
		   FROM receipts r
		   JOIN fees f ON f.id = r.fee_id
		   JOIN students s ON s.id = f.student_id
		   JOIN classes c ON c.id = s.class_id
		   JOIN branches b ON b.id = s.branch_id
		   LEFT JOIN profiles p ON p.id = r.received_by
		  WHERE r.receipt_number = $1`,
		[receiptNumber]
	);
	const row = rows[0];
	if (!row) return null;
	return {
		...row,
		studentId: Number(row.studentId),
		parentProfileId: Number(row.parentProfileId),
		branchId: Number(row.branchId),
	};
}

/**
 * Kiosk search: the parent profile for an exact phone number (unique index),
 * then all their active children with pending fees attached. Returns
 * { parent, students } or { parent: null, students: [] } when the number
 * belongs to nobody in this branch - the route turns that into a 404.
 *
 * Each student appears once per pending fee row, so the route groups rows by
 * student before responding.
 */
export async function searchByParentPhone(phone, branchId) {
	const parentResult = await query(
		`SELECT id,
		        full_name    AS "fullName",
		        phone_number AS "phoneNumber"
		   FROM profiles
		  WHERE phone_number = $1
		    AND branch_id = $2
		    AND role = 'parent'`,
		[phone, branchId]
	);
	const parent = parentResult.rows[0];
	if (!parent) return { parent: null, students: [] };

	const studentsResult = await query(
		`SELECT s.id          AS "studentId",
		        s.full_name   AS "fullName",
		        s.roll_number AS "rollNumber",
		        s.photo_url   AS "photoUrl",
		        c.class_number AS "classNumber",
		        c.section,
		        f.id          AS "feeId",
		        f.category,
		        f.total_amount::text AS "totalAmount",
		        f.balance_due::text  AS "balanceDue"
		   FROM students s
		   JOIN classes c ON c.id = s.class_id
		   LEFT JOIN fees f
		     ON f.student_id = s.id
		    AND f.balance_due > 0
		  WHERE s.parent_profile_id = $1
		    AND s.is_active = true
		  ORDER BY s.full_name, f.category`,
		[parent.id]
	);

	return {
		parent: { id: Number(parent.id), fullName: parent.fullName, phoneNumber: parent.phoneNumber },
		rows: studentsResult.rows,
	};
}

/**
 * THE MONEY TRANSACTION. One payment against one fee category.
 *
 * Order inside ONE transaction:
 *   1. SELECT ... FOR UPDATE  - lock the fee row; a second admin paying the
 *      same fee at the same second waits, then sees the NEW balance.
 *   2. Validate in SQL: the UPDATE only matches while balance_due >= amount.
 *      JavaScript never subtracts money.
 *   3. Insert the receipt (receipt_number is a database identity starting at
 *      100001 - the app never invents one).
 *   4. Write the audit row with the SAME client, so money and its record
 *      commit together or not at all.
 *
 * Expected refusals come back as outcome objects, not exceptions:
 *   { ok:false, reason:"not_found" }       fee id unknown
 *   { ok:false, reason:"wrong_branch" }    fee belongs to another branch
 *   { ok:false, reason:"exceeds" }         amount > balance_due
 *
 * @param {string} amount  numeric STRING ("500.00") - never a JS float
 */
export async function processPayment({ feeId, amount, paymentMode, adminId, branchId }) {
	return withTransaction(async (client) => {
		const locked = await client.query(
			`SELECT f.id,
			        f.balance_due::text AS "balanceDue",
			        f.category,
			        f.student_id AS "studentId",
			        s.branch_id  AS "branchId"
			   FROM fees f
			   JOIN students s ON s.id = f.student_id
			  WHERE f.id = $1
			  FOR UPDATE`,
			[feeId]
		);
		const fee = locked.rows[0];
		if (!fee) return { ok: false, reason: "not_found" };
		if (Number(fee.branchId) !== Number(branchId)) {
			return { ok: false, reason: "wrong_branch" };
		}

		// Atomic check-and-deduct: the row only updates when the balance can
		// cover the amount. rowCount 0 = "entered amount exceeded the due".
		const updated = await client.query(
			`UPDATE fees
			    SET balance_due = balance_due - $2::numeric
			  WHERE id = $1
			    AND balance_due >= $2::numeric
			  RETURNING balance_due::text AS "newBalance"`,
			[feeId, amount]
		);
		if (updated.rowCount === 0) {
			return { ok: false, reason: "exceeds", balanceDue: fee.balanceDue };
		}
		const newBalance = updated.rows[0].newBalance;

		const receipt = await client.query(
			`INSERT INTO receipts (fee_id, amount_paid, payment_mode, received_by)
			 VALUES ($1, $2::numeric, $3, $4)
			 RETURNING id,
			           receipt_number::text AS "receiptNumber",
			           created_at AS "createdAt"`,
			[feeId, amount, paymentMode, adminId]
		);
		const receiptRow = receipt.rows[0];

		// Audit with the SAME client: if this write fails, the whole payment
		// rolls back. Money without a record must never exist.
		await logAudit(
			{
				branchId,
				actorId: adminId,
				action: "fee.payment",
				entityType: "fee",
				entityId: Number(fee.id),
				details: {
					studentId: Number(fee.studentId),
					category: fee.category,
					amountPaid: amount,
					paymentMode,
					receiptNumber: receiptRow.receiptNumber,
					newBalance,
				},
			},
			client
		);

		return {
			ok: true,
			receiptId: Number(receiptRow.id),
			receiptNumber: receiptRow.receiptNumber,
			amountPaid: amount,
			category: fee.category,
			newBalance,
			studentId: Number(fee.studentId),
		};
	});
}
