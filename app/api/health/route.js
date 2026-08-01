import { query } from "@/lib/db";

// A health probe must never be cached - a cached "ok" would hide a dead database.
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Deliberately UNAUTHENTICATED. This is an uptime probe: it must answer even
 * when nobody is logged in, and it exposes only a row count.
 *
 * Response shape is a fixed contract - { ok, students } - and must not change.
 * It is the smoke test used after every single task in this project.
 */
export async function GET() {
	try {
		const result = await query(
			"SELECT count(*)::int AS students FROM students"
		);
		return Response.json({ ok: true, students: result.rows[0].students });
	} catch (err) {
		console.error("[api/health] GET failed:", err);
		return Response.json({ ok: false, error: err.message }, { status: 500 });
	}
}