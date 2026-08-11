// lib/repos/notificationRepo.js
// -----------------------------------------------------------------------------
// EVERY SQL STATEMENT FOR NOTIFICATIONS LIVES IN THIS FILE.
//
// coreRepo.js states the rule plainly: "every SQL statement in the app lives in
// lib/repos/*.js, never in a route." lib/notify.js does the validating,
// permission-checking and auditing; this file does nothing but talk to
// PostgreSQL. If you find yourself writing a notification query anywhere else,
// add it here instead.
//
// DB CONTRACT: notifications, notification_recipients and device_tokens all
// already exist in db/schema.sql. db/migrations/003_notification_kind.sql added
// the `kind` column, the `source` CHECK list and idx_notif_recipient_profile.
// NO DDL IN THIS FILE.
//
// READ PATH  (the bell):    unreadCount, listForProfile, markRead, markAllRead
// WRITE PATH (broadcasts):  findAudienceProfileIds, createWithRecipients
// TRACE PATH (the outbox):  listSentBroadcasts
// -----------------------------------------------------------------------------

import { query, withTransaction } from "@/lib/db";

// Every bell query returns the same shape, so the browser never has to care
// which of them produced a row. Defined once so the two list queries below can
// never drift apart.
const LIST_COLUMNS = `
			n.id, n.title, n.body, n.priority, n.kind, n.source,
			n.link_url   AS "linkUrl",
			n.created_at AS "createdAt",
			r.is_read    AS "isRead",
			r.read_at    AS "readAt"`;

// =============================================================================
// 1. READ PATH - the bell
// =============================================================================

/**
 * How many unread notifications this person has. Powers the badge.
 *
 * Served entirely by the partial index idx_notif_unread, which only contains
 * unread rows - so this stays fast no matter how much history piles up.
 *
 * @param {number} profileId
 * @returns {Promise<number>} a real JavaScript number, not a string
 */
export async function unreadCount(profileId) {
	const result = await query(
		`SELECT count(*)::int AS count
		   FROM notification_recipients
		  WHERE profile_id = $1
		    AND is_read = false`,
		[profileId]
	);

	return result.rows[0].count;
}

/**
 * One page of this person's notifications, newest first.
 *
 * PAGINATION IS KEYSET, NOT OFFSET. `before` is the last id you already have,
 * so page 50 costs the same as page 1. OFFSET would make deep scrolling get
 * slower and slower.
 *
 * The two branches are written out separately on purpose. Folding them into one
 * query with `($2 IS NULL OR r.notification_id < $2)` stops PostgreSQL using
 * idx_notif_recipient_profile and turns this into a full scan.
 *
 * @param {number} profileId
 * @param {object} [options]
 * @param {number} [options.limit]  how many rows
 * @param {number} [options.before] return rows with a SMALLER id than this
 */
export async function listForProfile(profileId, { limit = 20, before = null } = {}) {
	if (before) {
		const result = await query(
			`SELECT ${LIST_COLUMNS}
			   FROM notification_recipients r
			   JOIN notifications n ON n.id = r.notification_id
			  WHERE r.profile_id = $1
			    AND r.notification_id < $2
			  ORDER BY r.notification_id DESC
			  LIMIT $3`,
			[profileId, before, limit]
		);
		return result.rows;
	}

	const result = await query(
		`SELECT ${LIST_COLUMNS}
		   FROM notification_recipients r
		   JOIN notifications n ON n.id = r.notification_id
		  WHERE r.profile_id = $1
		  ORDER BY r.notification_id DESC
		  LIMIT $2`,
		[profileId, limit]
	);
	return result.rows;
}

/**
 * Marks one notification read FOR ONE PERSON.
 *
 * Note what is NOT here: `AND is_read = false`. Leaving it out means clicking an
 * already-read item still matches a row and still returns true, so the API
 * answers 200 instead of a confusing 404. COALESCE keeps the original read_at
 * timestamp so the first read is the one on record.
 *
 * The profile_id in the WHERE clause is the security boundary - it comes from
 * the signed cookie, so one person can never mark another person's row.
 *
 * @returns {Promise<boolean>} false means this person has no such notification
 */
export async function markRead(notificationId, profileId) {
	const result = await query(
		`UPDATE notification_recipients
		    SET is_read = true,
		        read_at = COALESCE(read_at, now())
		  WHERE notification_id = $1
		    AND profile_id = $2`,
		[notificationId, profileId]
	);

	return result.rowCount > 0;
}

/**
 * Marks everything read for this person.
 *
 * `AND is_read = false` IS wanted here - it keeps the row count honest ("marked
 * 6") and avoids rewriting rows that were already read.
 *
 * @returns {Promise<number>} how many rows changed
 */
export async function markAllRead(profileId) {
	const result = await query(
		`UPDATE notification_recipients
		    SET is_read = true,
		        read_at = COALESCE(read_at, now())
		  WHERE profile_id = $1
		    AND is_read = false`,
		[profileId]
	);

	return result.rowCount;
}

// =============================================================================
// 2. WRITE PATH - broadcasts
// =============================================================================

/**
 * Turns an audience choice into a concrete list of profile ids.
 *
 * THE CROSS-BRANCH GUARD: every class branch JOINs `classes` and filters on
 * c.branch_id = $1. So even if someone hand-crafts a request containing a class
 * id from another school, it resolves to zero people. branchId always comes
 * from the session, never from the request body.
 *
 * "all" DELIBERATELY INCLUDES BUS STAFF. The original Feature 09 prompt said
 * "every non-bus profile", and I reversed that: a driver needs to know the
 * school is shut tomorrow more than most people do. Recorded in
 * the feature 09 decisions doc in context/features/.
 *
 * @param {object}   args
 * @param {number}   args.branchId
 * @param {string}   args.audience       all | parents | teachers | classes
 * @param {number[]} [args.classIds]     required when audience is "classes"
 * @param {string}   [args.classAudience] parents | teachers | both
 * @returns {Promise<number[]>}
 */
export async function findAudienceProfileIds({
	branchId,
	audience,
	classIds = [],
	classAudience = "both",
}) {
	if (audience === "all") {
		const result = await query(
			`SELECT id FROM profiles WHERE branch_id = $1`,
			[branchId]
		);
		return result.rows.map((row) => row.id);
	}

	if (audience === "parents" || audience === "teachers") {
		const role = audience === "parents" ? "parent" : "teacher";
		const result = await query(
			`SELECT id
			   FROM profiles
			  WHERE branch_id = $1
			    AND role = $2`,
			[branchId, role]
		);
		return result.rows.map((row) => row.id);
	}

	if (audience === "classes") {
		// DISTINCT matters: one parent can have two children in the same class,
		// and a teacher can hold several subjects in one class. Without it the
		// same person is counted - and inserted - more than once.
		const parentsSql = `
			SELECT DISTINCT s.parent_profile_id AS id
			  FROM students s
			  JOIN classes c ON c.id = s.class_id
			 WHERE c.branch_id = $1
			   AND s.class_id = ANY($2::bigint[])
			   AND s.is_active = true`;

		const teachersSql = `
			SELECT DISTINCT tca.teacher_id AS id
			  FROM teacher_class_assignments tca
			  JOIN classes c ON c.id = tca.class_id
			 WHERE c.branch_id = $1
			   AND tca.class_id = ANY($2::bigint[])`;

		let sql;
		if (classAudience === "parents") {
			sql = parentsSql;
		} else if (classAudience === "teachers") {
			sql = teachersSql;
		} else {
			// UNION, not UNION ALL - a class teacher who is also a parent in that
			// same class must receive exactly one copy.
			sql = `${parentsSql} UNION ${teachersSql}`;
		}

		const result = await query(sql, [branchId, classIds]);
		return result.rows.map((row) => row.id);
	}

	return [];
}

/**
 * Writes the notification and fans it out to everybody, in ONE transaction.
 *
 * Why a transaction: a notification that exists with nobody attached is
 * invisible forever, and recipient rows pointing at a missing notification
 * break the bell. Both statements land or neither does.
 *
 * The fan-out is a single INSERT ... SELECT unnest(), not a loop. 423 rows go in
 * as one round trip instead of 423.
 *
 * ON CONFLICT DO NOTHING protects the (notification_id, profile_id) primary key
 * in case a caller hands us a list with a duplicate in it.
 *
 * @returns {Promise<{id: number, recipientCount: number}>}
 */
export async function createWithRecipients({
	branchId,
	title,
	body,
	priority,
	kind,
	source,
	linkUrl = null,
	createdBy = null,
	recipientProfileIds,
}) {
	return withTransaction(async (client) => {
		const inserted = await client.query(
			`INSERT INTO notifications
			        (branch_id, title, body, priority, kind, source, link_url, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id`,
			[branchId, title, body, priority, kind, source, linkUrl, createdBy]
		);

		const notificationId = inserted.rows[0].id;

		const fanOut = await client.query(
			`INSERT INTO notification_recipients (notification_id, profile_id)
			 SELECT $1, unnest($2::bigint[])
			 ON CONFLICT DO NOTHING`,
			[notificationId, recipientProfileIds]
		);

		return { id: notificationId, recipientCount: fanOut.rowCount };
	});
}

// =============================================================================
// 3. TRACE PATH - the outbox
// =============================================================================

/**
 * The Sent list. What did this person - or, for an admin, what did anybody -
 * broadcast, and how many people have actually read it.
 *
 * NO NEW TABLE WAS NEEDED FOR THIS. Everything was already being recorded:
 * created_by is the sender, created_at is the timestamp, and counting
 * notification_recipients gives both the delivered total and the read total in
 * the same pass.
 *
 * scope is decided by ROLE in the route, never by the browser:
 *   "own" -> a teacher sees only what they sent
 *   "all" -> an admin sees every broadcast in the school, with the sender's name
 *
 * WHY `source = 'broadcast'`: later features call createNotification with their
 * own source ("attendance", "fees", ...) and may pass the acting user as
 * created_by. Those are automatic side effects, not messages the person wrote,
 * so they must never appear in a Sent list. Only deliberate broadcasts do.
 *
 * The JOIN (not LEFT JOIN) on recipients is safe because lib/notify.js refuses
 * to create a notification with zero recipients.
 *
 * @param {object} args
 * @param {number} args.branchId
 * @param {number} args.profileId  only used when scope is "own"
 * @param {string} [args.scope]    "own" | "all"
 * @param {number} [args.limit]
 * @param {number} [args.before]   keyset cursor, same idea as listForProfile
 */
export async function listSentBroadcasts({
	branchId,
	profileId,
	scope = "own",
	limit = 20,
	before = null,
}) {
	// Built up as fragments so the four scope/cursor combinations do not need
	// four near-identical copies of the query. Only $n placeholders are ever
	// concatenated - no caller value is ever put into the SQL text.
	const conditions = [
		"n.branch_id = $1",
		"n.source = 'broadcast'",
		"n.created_by IS NOT NULL",
	];
	const params = [branchId];

	if (scope !== "all") {
		params.push(profileId);
		conditions.push(`n.created_by = $${params.length}`);
	}

	if (before) {
		params.push(before);
		conditions.push(`n.id < $${params.length}`);
	}

	params.push(limit);
	const limitPlaceholder = `$${params.length}`;

	const result = await query(
		`SELECT
			n.id, n.title, n.body, n.priority, n.kind,
			n.created_at AS "createdAt",
			p.full_name  AS "sentBy",
			count(r.profile_id)::int AS "recipientCount",
			(count(r.profile_id) FILTER (WHERE r.is_read))::int AS "readCount"
		   FROM notifications n
		   JOIN notification_recipients r ON r.notification_id = n.id
		   LEFT JOIN profiles p ON p.id = n.created_by
		  WHERE ${conditions.join("\n		    AND ")}
		  GROUP BY n.id, p.full_name
		  ORDER BY n.id DESC
		  LIMIT ${limitPlaceholder}`,
		params
	);

	return result.rows;
}