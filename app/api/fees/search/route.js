// app/api/fees/search/route.js
// GET /api/fees/search?phone=9810000002
//
// The pay kiosk's search: exact parent phone number -> the parent plus every
// linked child with that child's pending fees. Exact match only (the phone
// number is the login identity, so it is unique) - this is a cash counter,
// not a directory browser.
//
// 404 for an unknown number. Admin only, branch-scoped from the session.

import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { searchByParentPhone } from "@/lib/repos/feeRepo";

export const dynamic = "force-dynamic";

export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin"]);

		const phone = new URL(request.url).searchParams.get("phone");
		if (!phone || !/^\d{10}$/.test(phone)) {
			return Response.json(
				{ ok: false, error: "Enter a valid 10-digit phone number" },
				{ status: 400 }
			);
		}

		const { parent, rows } = await searchByParentPhone(phone, user.branchId);
		if (!parent) {
			return Response.json(
				{ ok: false, error: "No parent found with this number" },
				{ status: 404 }
			);
		}

		// Rows arrive as one row per (student x pending fee). Group them back
		// into one entry per child with a pendingFees list.
		const byStudent = new Map();
		for (const row of rows) {
			if (!byStudent.has(row.studentId)) {
				byStudent.set(row.studentId, {
					id: Number(row.studentId),
					fullName: row.fullName,
					rollNumber: row.rollNumber,
					photoUrl: row.photoUrl,
					classNumber: row.classNumber,
					section: row.section,
					pendingFees: [],
				});
			}
			if (row.feeId !== null) {
				byStudent.get(row.studentId).pendingFees.push({
					feeId: Number(row.feeId),
					category: row.category,
					totalAmount: row.totalAmount,
					balanceDue: row.balanceDue,
				});
			}
		}

		return Response.json({
			ok: true,
			data: { parent, students: [...byStudent.values()] },
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/fees/search] GET failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}
