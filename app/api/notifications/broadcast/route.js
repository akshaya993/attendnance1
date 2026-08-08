import { requireRole } from "@/lib/auth";
import { requireActiveApiSession } from "@/lib/guard";
import { broadcast, previewAudienceCount, canUseAudience, NotifyError } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Parse "12,15,19" into a safe array of numeric strings.
 * Anything that is not digits is dropped rather than passed to the database.
 */
function parseClassIds(raw) {
	if (!raw) return [];
	return raw
		.split(",")
		.map((part) => part.trim())
		.filter((part) => /^\d+$/.test(part));
}

function errorResponse(err, where) {
	if (err.name === "AuthError" || err.name === "NotifyError") {
		return Response.json({ ok: false, error: err.message }, { status: err.status });
	}
	console.error(`[api/notifications/broadcast] ${where} failed:`, err);
	return Response.json(
		{ ok: false, error: "Something went wrong. Please try again." },
		{ status: 500 }
	);
}

/**
 * GET /api/notifications/broadcast?preview_audience=classes&class_ids=1,2&class_audience=both
 *
 * How many people would receive this? Powers the confirmation step.
 * Counts only - it never sends anything and never writes to the database.
 */
export async function GET(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin", "teacher"]);

		const params = new URL(request.url).searchParams;
		const audience = params.get("preview_audience");

		if (!audience) {
			return Response.json(
				{ ok: false, error: "preview_audience is required" },
				{ status: 400 }
			);
		}

		// Same gate as the send path. A teacher must not be able to discover
		// how many people are in the school by previewing an audience they
		// are not allowed to send to.
		if (!canUseAudience(user.role, audience)) {
			return Response.json(
				{ ok: false, error: "You can only send to specific classes" },
				{ status: 403 }
			);
		}

		const count = await previewAudienceCount({
			branchId: user.branchId,
			audience,
			classIds: parseClassIds(params.get("class_ids")),
			classAudience: params.get("class_audience") || "both",
		});

		return Response.json({ ok: true, data: { count } });
	} catch (err) {
		return errorResponse(err, "GET");
	}
}

/**
 * POST /api/notifications/broadcast
 *
 * Body: { title, body, priority, kind, audience, classIds, classAudience }
 *
 * SECURITY NOTES:
 *   - branchId and the sender's id come from the SIGNED SESSION COOKIE only.
 *     They are never read from the request body, so nobody can send as
 *     someone else or into another branch.
 *   - The admin/teacher rule is enforced inside broadcast() in lib/notify.js,
 *     not here and not in the form. A teacher posting audience:'all' straight
 *     from the browser console gets a 403 exactly like one using the form.
 */
export async function POST(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);
		requireRole(user, ["admin", "teacher"]);

		let payload;
		try {
			payload = await request.json();
		} catch {
			return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
		}

		const result = await broadcast({
			actor: {
				profileId: user.profileId,
				branchId: user.branchId,
				role: user.role,
			},
			title: payload.title,
			body: payload.body,
			priority: payload.priority || "standard",
			kind: payload.kind || "notice",
			audience: payload.audience,
			classIds: Array.isArray(payload.classIds) ? payload.classIds : [],
			classAudience: payload.classAudience || "both",
			linkUrl: payload.linkUrl || null,
		});

		return Response.json({
			ok: true,
			data: { id: result.id, recipientCount: result.recipientCount },
		});
	} catch (err) {
		return errorResponse(err, "POST");
	}
}