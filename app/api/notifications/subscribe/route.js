// app/api/notifications/subscribe/route.js
// -----------------------------------------------------------------------------
// POST   /api/notifications/subscribe  - remember this browser
// DELETE /api/notifications/subscribe  - forget this browser (called on sign out)
//
// The browser calls POST once it has permission to show notifications, handing
// over the subscription its push service issued. Every role may subscribe -
// parents, teachers, admins and bus staff all need to be reachable.
//
// THE PROFILE ID COMES FROM THE SIGNED COOKIE, NEVER FROM THE BODY. Otherwise
// anybody could register their own phone against the principal's account and
// receive every message the school sends.
//
// The one thing the body IS trusted for is the endpoint on DELETE, and that is
// safe because the SQL pins it to `profile_id = <cookie>`. The worst a forged
// endpoint can do is delete a row you already own.
// -----------------------------------------------------------------------------

import { requireActiveApiSession } from "@/lib/guard";
import { pushStatus } from "@/lib/push";
import {
	deleteDeviceTokenByEndpoint,
	releaseEndpointFromOtherProfiles,
	saveDeviceToken,
} from "@/lib/repos/deviceTokenRepo";

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

/**
 * Shared error handling for both methods.
 */
function errorResponse(err, method) {
	if (err.name === "AuthError") {
		return Response.json({ ok: false, error: err.message }, { status: err.status });
	}
	console.error(`[api/notifications/subscribe] ${method} failed:`, err);
	return Response.json(
		{ ok: false, error: "Something went wrong. Please try again." },
		{ status: 500 }
	);
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
		// ONE BROWSER, ONE OWNER.
		//
		// Ours is saved first, then anybody else's claim on the same endpoint is
		// released. That order matters: if the release fails we have still
		// stored the row we came here to store, and the situation is no worse
		// than it was a second ago.
		//
		// Wrapped in its own try/catch for the same reason the status check
		// below is - a browser that registered correctly deserves a 200. This
		// is housekeeping, not the caller's business.
		// ---------------------------------------------------------------------
		let released = 0;
		try {
			released = await releaseEndpointFromOtherProfiles(
				user.profileId,
				subscription.endpoint
			);
			if (released > 0) {
				console.warn(
					`[api/notifications/subscribe] endpoint reassigned to profile ${user.profileId}, released ${released} stale row(s)`
				);
			}
		} catch (err) {
			console.error("[api/notifications/subscribe] release failed:", err);
		}

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
				released,
				pushReady: push.ready,
				pushReason: push.reason,
			},
		});
	} catch (err) {
		return errorResponse(err, "POST");
	}
}

/**
 * Called by components/auth/LogoutButton.js immediately BEFORE it clears the
 * session cookie, because this needs a valid session to know who you are.
 *
 * WHY SIGN-OUT HAS TO DO THIS AT ALL: notification permission is stored per
 * SITE, not per login, and a browser holds exactly one subscription for the
 * whole site. Without this, the next person to sign in on the same phone
 * inherits the previous person's push address and starts receiving messages
 * meant for them.
 *
 * Returns 200 with removed: 0 when there was nothing to remove. That is a
 * completely normal outcome - most people never turned notifications on - and
 * must not look like a failure to the caller.
 */
export async function DELETE(request) {
	try {
		const { session: user } = await requireActiveApiSession(request);

		let payload;
		try {
			payload = await request.json();
		} catch {
			return Response.json(
				{ ok: false, error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const endpoint =
			typeof payload?.endpoint === "string" ? payload.endpoint.trim() : "";

		if (!endpoint.startsWith("https://")) {
			return Response.json(
				{ ok: false, error: "Invalid push subscription" },
				{ status: 400 }
			);
		}

		const removed = await deleteDeviceTokenByEndpoint(user.profileId, endpoint);

		return Response.json({ ok: true, data: { removed } });
	} catch (err) {
		return errorResponse(err, "DELETE");
	}
}