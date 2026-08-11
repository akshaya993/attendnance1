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
//
// THREE WAYS A ROW LEAVES THIS TABLE, and all three matter:
//   deleteDeviceTokens            - the push service said the browser is gone
//   deleteDeviceTokenByEndpoint   - the person signed out of this browser
//   releaseEndpointFromOtherProfiles - somebody else took this browser over
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

/**
 * Forgets ONE browser belonging to ONE person. Called when they sign out.
 *
 * WHY WE MATCH ON THE ENDPOINT AND NOT JUST THE PROFILE: a parent may have the
 * app on their phone AND on the family laptop. Signing out of the laptop must
 * not silence their phone. The endpoint is the address of one specific browser,
 * so it is the only safe thing to key on.
 *
 * Deleting by endpoint rather than by row id also means the caller does not
 * need to have read the table first - the browser already knows its own
 * endpoint, which saves a query on a path the user is waiting on.
 *
 * INDEX NOTE: `profile_id` is the leading column of the existing
 * device_tokens_profile_id_subscription_key unique index, so PostgreSQL narrows
 * to this person's handful of rows before it looks at the endpoint text.
 *
 * @param {number} profileId from the signed cookie, never from the request body
 * @param {string} endpoint the browser's own push address
 * @returns {Promise<number>} rows removed, 0 is normal and not an error
 */
export async function deleteDeviceTokenByEndpoint(profileId, endpoint) {
	if (!profileId || typeof endpoint !== "string" || endpoint === "") {
		return 0;
	}

	const result = await query(
		`DELETE FROM device_tokens
		  WHERE profile_id = $1
		    AND subscription->>'endpoint' = $2`,
		[profileId, endpoint]
	);

	return result.rowCount;
}

/**
 * Takes this browser away from anybody else who still claims it.
 *
 * THE PROBLEM THIS SOLVES, MEASURED IN OUR OWN DATABASE:
 *   id | profile_id | endpoint
 *    8 |       1266 | https://wns2-pn1p.notify.windows.com/w/?token...
 *   10 |       1267 | https://wns2-pn1p.notify.windows.com/w/?token...
 * One browser, two owners. A browser holds exactly ONE push subscription per
 * site no matter who is signed in, so when the teacher signed in on the admin's
 * machine the app dutifully saved the admin's endpoint a second time. From then
 * on the teacher's messages would surface on the admin's screen and the other
 * way round. On a shared family phone - the normal case for this app - that is
 * a privacy leak, not a cosmetic bug.
 *
 * Sign-out already handles the tidy case. This handles the untidy one: people
 * close the tab, hand the phone to somebody else, and never press Sign out.
 * Whoever is signed in NOW owns the browser; there is no useful meaning to
 * delivering to a device the previous person has walked away from.
 *
 * SEQUENTIAL SCAN, DELIBERATELY: there is no index on the endpoint text and
 * this table holds one row per browser, not per user. Adding an index would
 * cost more on every subscribe than it saves on this one statement.
 *
 * @param {number} profileId the person who now owns this browser
 * @param {string} endpoint
 * @returns {Promise<number>} rows taken from other profiles, normally 0
 */
export async function releaseEndpointFromOtherProfiles(profileId, endpoint) {
	if (!profileId || typeof endpoint !== "string" || endpoint === "") {
		return 0;
	}

	const result = await query(
		`DELETE FROM device_tokens
		  WHERE subscription->>'endpoint' = $2
		    AND profile_id <> $1`,
		[profileId, endpoint]
	);

	return result.rowCount;
}


/**
 * Throws away every push subscription belonging to one person.
 *
 * WHY THIS EXISTS: the sign-out rule agreed for Feature 09 - no login, no
 * notifications. Changing or resetting a password bumps profiles.session_epoch,
 * which signs every device out instantly. Without this call those devices would
 * carry on buzzing for an account nobody is signed into, which is exactly the
 * leak the rule was written to stop.
 *
 * DELIBERATELY SEPARATE FROM THE OTHER DELETES IN THIS FILE. One prunes
 * browsers the push service has declared dead, by row id. One releases a single
 * browser when its owner signs out. This one answers a third question - "this
 * person, everywhere" - and a function per question reads better than one
 * function with a mode flag.
 *
 * Deleting rows that may not exist is fine: it simply removes nothing and
 * returns 0.
 *
 * @param {number|string} profileId
 * @returns {Promise<number>} subscriptions removed
 */
export async function deleteDeviceTokensForProfile(profileId) {
	const result = await query(
		`DELETE FROM device_tokens WHERE profile_id = $1`,
		[profileId]
	);

	return result.rowCount;
}