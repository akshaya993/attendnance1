import { query } from "@/lib/db";

/**
 * Shared reference-data reads used by many features.
 *
 * Branches and classes are read by attendance, fees, marks, timetable, groups,
 * admissions and more, so they do not belong to any single feature's repo.
 * If a later feature needs another branch/class read, ADD IT HERE - do not
 * duplicate these queries in another repo file.
 *
 * Rule: every SQL statement in the app lives in lib/repos/*.js, never in a route.
 */

/**
 * Every branch in the school. Admin-only use.
 */
export async function listAllBranches() {
	const result = await query(
		`SELECT id, name, address, created_at
		   FROM branches
		  ORDER BY id`
	);
	return result.rows;
}

/**
 * A single branch, returned as an array so callers always get the same shape.
 */
export async function listOwnBranch(branchId) {
	const result = await query(
		`SELECT id, name, address, created_at
		   FROM branches
		  WHERE id = $1`,
		[branchId]
	);
	return result.rows;
}

/**
 * All classes belonging to one branch, in natural school order:
 * class 1 A, 1 B, ... 10 A, 10 B, 10 C.
 */
export async function listClassesByBranch(branchId) {
	const result = await query(
		`SELECT id, branch_id, class_number, section
		   FROM classes
		  WHERE branch_id = $1
		  ORDER BY class_number, section`,
		[branchId]
	);
	return result.rows;
}