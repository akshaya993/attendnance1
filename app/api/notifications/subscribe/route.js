// app/api/notifications/subscribe/route.js
// -----------------------------------------------------------------------------
// POST /api/notifications/subscribe
//
// The browser calls this once it has permission to show notifications, handing
// over the subscription its push service issued. Every role may subscribe -
// parents, teachers, admins and bus staff all need to be reachable.
//
// THE PROFILE ID COMES FROM THE SIGNED COOKIE, NEVER FROM THE BODY. Otherwise
// anybody could register their own phone against the principal's account and
// receive every message the school sends.
// -----------------------------------------------------------------------------

import { requireActiveApiSession } from "@/lib/guard";
import { pushStatus } from "@/lib/push";
import { saveDeviceToken } from "@/lib/repos/deviceTokenRepo";

export const dynamic = "force-dynamic";

/**
 * Reduces whatever the browser sent to the exact three values we store.
 *
 * WHY TRIM IT AT ALL: device_tokens has UNIQUE (profile_id, subscription) over
 * the whole JSONB value. Chrome sometimes attaches `expirationTime: null` and
 * sometimes does not, so storing the raw object means the same phone can occupy
 * two rows and receive every notification twice. Keeping only the three fields
 * web-push actually needs makes the constraint mean what we intended.
 *
 * It is also validation: a subscription without keys is undeliverable, so it is
 * better rejected now than discovered during a school-wide urgent send.
 *
 * @returns {object|null} null means "not a usable subscription"
 */
function normalizeSubscription(raw) {
	if (!raw || typeof raw !== "object") {
		return null;
	}

	const endpoint = typeof raw.endpoint === "string" ? raw.endpoint.trim() : "";
	const keys = raw.keys && typeof raw.keys === "object" ? raw.keys : null;
	const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
	const auth = keys && typeof keys.auth === "string" ? keys.auth.trim() : "";

	// Real push endpoints are always https. This also blocks an attempt to point
	// the server at an internal address it should not be calling.
	if (!endpoint.startsWith("https://") || !p256dh || !auth) {
		return null;
	}

	return { endpoint, keys: { p256dh, auth } };
}

export async function POST(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);

		// No requireRole() here on purpose - every role receives notifications.

		let payload;
		try {
			payload = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const subscription = normalizeSubscription(payload?.subscription ?? payload);

		if (!subscription) {
			return Response.json(
				{ ok: false, error: "Invalid push subscription" },
				{ status: 400 }
			);
		}

		const created = await saveDeviceToken(user.profileId, subscription);

		// ---------------------------------------------------------------------
		// READING THE PUSH CONFIG MUST NOT BE ABLE TO FAIL THE SAVE.
		//
		// The first version of this route called the status check inline inside
		// the response object, on the line AFTER the insert had already
		// committed. A VAPID key web-push would not accept threw there, the
		// catch below answered 500, and the row was in the table anyway. The
		// symptom looked impossible: a stored subscription and a 500 for the
		// same request.
		//
		// Storing an address and being able to deliver to it are separate
		// concerns. A browser that successfully registered deserves a 200 even
		// when the server's own keys are wrong, because that is the operator's
		// problem to fix, not something for the user to retry.
		// ---------------------------------------------------------------------
		let push = { ready: false, reason: "status check failed" };
		try {
			push = pushStatus();
		} catch (err) {
			console.error("[api/notifications/subscribe] push status failed:", err);
		}

		if (!push.ready) {
			console.warn(`[api/notifications/subscribe] saved, but push is not ready - ${push.reason}`);
		}

		// `created: false` is a success, not a problem - it means this browser was
		// already registered. The client re-subscribes on every visit by design.
		return Response.json({
			ok: true,
			data: {
				saved: true,
				created,
				pushReady: push.ready,
				pushReason: push.reason,
			},
		});
	} catch (err) {
		if (err.name === "AuthError") {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: err.status }
			);
		}
		console.error("[api/notifications/subscribe] POST failed:", err);
		return Response.json(
			{ ok: false, error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}