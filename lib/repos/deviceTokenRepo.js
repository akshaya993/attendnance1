// lib/repos/deviceTokenRepo.js
// -----------------------------------------------------------------------------
// EVERY SQL STATEMENT FOR PUSH SUBSCRIPTIONS LIVES IN THIS FILE.
//
// WHY THIS IS A SEPARATE FILE AND NOT MORE FUNCTIONS IN notificationRepo.js
//   1. Different table, opposite lifetime. A notification is written once and
//      kept forever. A device token is written when somebody allows
//      notifications and DELETED the instant their browser abandons it.
//   2. SHARED WITH FEATURE 02 (bus). device_tokens deliberately sits in the bus
//      section of db/schema.sql, because live bus tracking will push from the
//      same table. Feature 02 imports this one small file and nothing else.
//   3. notificationRepo.js is already 7 functions long. code-standards.md says
//      split past roughly 200 lines.
//   This is not a duplicate of notificationRepo.js - there is no overlap of a
//   single query between them.
//
// DB CONTRACT: device_tokens ALREADY EXISTS in db/schema.sql, verified live:
//   id BIGINT identity, profile_id BIGINT NOT NULL -> profiles(id),
//   subscription JSONB NOT NULL, created_at TIMESTAMPTZ,
//   UNIQUE (profile_id, subscription)
// NO DDL IN THIS FILE. Feature 09 adds no migration for push.
// -----------------------------------------------------------------------------

import { query } from "@/lib/db";

/**
 * Remembers one browser so we can push to it later.
 *
 * THE UNIQUE CONSTRAINT IS ON THE WHOLE JSONB BLOB, which is why the caller
 * must hand us an already-normalised subscription. jsonb ignores key ORDER
 * (PostgreSQL sorts keys internally), but it does NOT ignore extra FIELDS -
 * Chrome sometimes includes `expirationTime: null` and sometimes omits it, and
 * those two would be stored as two different rows. Same phone, two entries,
 * every notification arriving twice. app/api/notifications/subscribe/route.js
 * strips the object down to {endpoint, keys:{p256dh, auth}} before calling us.
 *
 * ON CONFLICT DO NOTHING makes re-subscribing free. Every visit re-registers
 * the service worker, so this runs constantly for the same browser.
 *
 * @param {number} profileId
 * @param {object} subscription normalised {endpoint, keys:{p256dh, auth}}
 * @returns {Promise<boolean>} true if this was a NEW device, false if known
 */
export async function saveDeviceToken(profileId, subscription) {
	const result = await query(
		`INSERT INTO device_tokens (profile_id, subscription)
		 VALUES ($1, $2::jsonb)
		 ON CONFLICT (profile_id, subscription) DO NOTHING`,
		[profileId, JSON.stringify(subscription)]
	);

	return result.rowCount > 0;
}

/**
 * Every browser belonging to any of these people.
 *
 * ONE QUERY FOR THE WHOLE AUDIENCE, not one per person. An urgent broadcast to
 * 423 profiles must not become 423 round trips.
 *
 * The id comes back too because that is what lib/push.js deletes when a push
 * service reports the subscription is dead.
 *
 * @param {number[]} profileIds
 * @returns {Promise<Array<{id: string, profileId: string, subscription: object}>>}
 */
export async function listDeviceTokens(profileIds) {
	if (!Array.isArray(profileIds) || profileIds.length === 0) {
		return [];
	}

	const result = await query(
		`SELECT id,
		        profile_id AS "profileId",
		        subscription
		   FROM device_tokens
		  WHERE profile_id = ANY($1::bigint[])`,
		[profileIds]
	);

	// node-postgres parses a jsonb column into a real object for us, so
	// row.subscription is ready to hand straight to web-push.
	return result.rows;
}

/**
 * Forgets dead browsers.
 *
 * WHY THIS IS NOT OPTIONAL: a push service answers 404 or 410 when the user
 * cleared their site data, uninstalled the app, or the subscription simply
 * expired. That row will never work again. Left in place it is retried on every
 * single urgent broadcast forever, so the table - and the time each broadcast
 * takes - grows without limit. lib/push.js calls this after every send.
 *
 * @param {Array<string|number>} tokenIds
 * @returns {Promise<number>} rows removed
 */
export async function deleteDeviceTokens(tokenIds) {
	if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
		return 0;
	}

	const result = await query(
		`DELETE FROM device_tokens WHERE id = ANY($1::bigint[])`,
		[tokenIds]
	);

	return result.rowCount;
}