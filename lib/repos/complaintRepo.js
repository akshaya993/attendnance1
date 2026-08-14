// lib/repos/complaintRepo.js
// -----------------------------------------------------------------------------
// EVERY SQL STATEMENT FOR COMPLAINTS LIVES IN THIS FILE.
//
// DB CONTRACT (db/schema.sql, frozen): complaints(id, branch_id, parent_id,
// subject, description, status['unread'|'read'|'resolved'], is_flagged,
// admin_reply, replied_by, replied_at, created_at). NO DDL IN THIS FILE.
// Feature 03 adds no migration.
//
// THE LIFECYCLE (owner's rules, locked):
//   - A complaint is born 'unread'.
//   - An admin OPENING it marks it 'read'.
//   - Sending a reply does NOT resolve it - reply != resolved. A reply just
//     records the answer (and flips 'unread' to 'read' if needed).
//   - Only the explicit "resolve" action closes a complaint, and ONLY after a
//     reply exists (the office must have answered before closing).
//   - Resolved is final. There is no reopen in v1.
//
// THE TABLE IS ITS OWN AUDIT TRAIL: replied_by + replied_at record who
// answered and when, so no audit_logs rows are written here (deliberate -
// complaints are conversations, not money).
// -----------------------------------------------------------------------------

import { query } from "@/lib/db";

// One row shape for every list - the queue and "my complaints" never drift.
const LIST_COLUMNS = `
	c.id,
	c.subject,
	c.description,
	c.status,
	c.is_flagged  AS "isFlagged",
	c.admin_reply AS "adminReply",
	c.created_at  AS "createdAt",
	c.replied_at  AS "repliedAt",
	p.full_name   AS "parentName",
	rp.full_name  AS "repliedByName"`;

const LIST_JOINS = `
	   FROM complaints c
	   JOIN profiles p ON p.id = c.parent_id
	   LEFT JOIN profiles rp ON rp.id = c.replied_by`;

// =============================================================================
// PARENT
// =============================================================================

/** A parent files a complaint. Always born 'unread'. */
export async function createComplaint({ branchId, parentId, subject, description }) {
	const { rows } = await query(
		`INSERT INTO complaints (branch_id, parent_id, subject, description)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at AS "createdAt"`,
		[branchId, parentId, subject, description]
	);
	return { id: Number(rows[0].id), createdAt: rows[0].createdAt };
}

/** One parent's own complaints, newest first. */
export async function getParentComplaints(parentId) {
	const { rows } = await query(
		`SELECT ${LIST_COLUMNS}
		   ${LIST_JOINS}
		  WHERE c.parent_id = $1
		  ORDER BY c.created_at DESC`,
		[parentId]
	);
	return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

// =============================================================================
// ADMIN
// =============================================================================

/**
 * The admin inbox for the branch: unread pinned on top (newest first), then
 * read, then resolved last (greyed history). The partial index
 * idx_complaints_open serves the unresolved majority of this ordering.
 */
export async function getQueue(branchId, { flaggedOnly = false } = {}) {
	const { rows } = await query(
		`SELECT ${LIST_COLUMNS}
		   ${LIST_JOINS}
		  WHERE c.branch_id = $1
		    ${flaggedOnly ? "AND c.is_flagged = true" : ""}
		  ORDER BY CASE c.status
		             WHEN 'unread' THEN 0
		             WHEN 'read' THEN 1
		             ELSE 2
		           END,
		           c.created_at DESC`,
		[branchId]
	);
	return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/**
 * One complaint for the admin's active-ticket view, branch-checked. The
 * caller fetches the parent's children separately (reuses
 * attendanceRepo.getChildrenOfParent).
 */
export async function getComplaintForAdmin(id, branchId) {
	const { rows } = await query(
		`SELECT ${LIST_COLUMNS},
		        c.parent_id AS "parentId",
		        p.phone_number AS "parentPhone",
		        p.email AS "parentEmail"
		   ${LIST_JOINS}
		  WHERE c.id = $1 AND c.branch_id = $2`,
		[id, branchId]
	);
	const row = rows[0];
	if (!row) return null;
	return { ...row, id: Number(row.id), parentId: Number(row.parentId) };
}

/** Opening a ticket marks it read. Read/resolved tickets are unaffected. */
export async function markRead(id, branchId) {
	const { rows } = await query(
		`UPDATE complaints SET status = 'read'
		  WHERE id = $1 AND branch_id = $2 AND status = 'unread'
		  RETURNING id`,
		[id, branchId]
	);
	return rows.length > 0;
}

/** Flag = the admin's personal bookmark for "needs attention". Toggles. */
export async function toggleFlag(id, branchId) {
	const { rows } = await query(
		`UPDATE complaints SET is_flagged = NOT is_flagged
		  WHERE id = $1 AND branch_id = $2
		  RETURNING is_flagged AS "isFlagged"`,
		[id, branchId]
	);
	return rows[0] ?? null;
}

/**
 * Store the admin's reply. A reply NEVER resolves the ticket (owner's rule) -
 * it only answers. An unread ticket being answered becomes 'read' (someone
 * has clearly seen it); a resolved ticket keeps its status.
 *
 * NOTE: the table has ONE admin_reply column, so the LATEST reply replaces
 * the previous one. Conversation threading is a future feature decision.
 */
export async function replyToComplaint(id, branchId, adminId, text) {
	const { rows } = await query(
		`UPDATE complaints
		    SET admin_reply = $3,
		        replied_by = $4,
		        replied_at = now(),
		        status = CASE WHEN status = 'unread' THEN 'read' ELSE status END
		  WHERE id = $1 AND branch_id = $2
		  RETURNING id,
		        parent_id AS "parentId",
		        status,
		        replied_at AS "repliedAt"`,
		[id, branchId, text, adminId]
	);
	const row = rows[0];
	if (!row) return null;
	return { ...row, id: Number(row.id), parentId: Number(row.parentId) };
}

/**
 * Close the ticket. ONLY possible once a reply exists (owner's rule: the
 * office answers first, then closes after the conversation is done).
 * Outcomes are objects, not exceptions: the route maps them to HTTP.
 */
export async function resolveComplaint(id, branchId, adminId) {
	const { rows } = await query(
		`UPDATE complaints
		    SET status = 'resolved'
		  WHERE id = $1 AND branch_id = $2
		    AND status <> 'resolved'
		    AND admin_reply IS NOT NULL
		  RETURNING id`,
		[id, branchId]
	);
	if (rows.length > 0) return { ok: true, id: Number(rows[0].id) };

	// Distinguish the two refusals for an honest error message.
	const check = await query(
		`SELECT status, (admin_reply IS NOT NULL) AS "hasReply"
		   FROM complaints WHERE id = $1 AND branch_id = $2`,
		[id, branchId]
	);
	const row = check.rows[0];
	if (!row) return { ok: false, reason: "not_found" };
	if (row.status === "resolved") return { ok: false, reason: "already_resolved" };
	return { ok: false, reason: "needs_reply" };
}
