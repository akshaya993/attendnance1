import { query, withTransaction } from "@/lib/db";

// lib/repos/notificationRepo.js
// EVERY SQL STATEMENT FOR NOTIFICATIONS LIVES IN THIS FILE. No SQL in routes,
// no SQL in lib/notify.js, no SQL in components. Same rule as coreRepo.js.
//
// OWNERSHIP: built in Feature 09, but SHARED PROPERTY. Features 01, 02, 04,
// 05, 06, 07 and 10 all send notifications. They must go through
// lib/notify.js, which calls this file. They must NEVER write their own
// INSERT into notifications or notification_recipients.
//
// DB CONTRACT: notifications, notification_recipients and device_tokens all
// already exist in db/schema.sql, plus the kind column and the
// idx_notif_recipient_profile index from db/migrations/003. NO DDL HERE.
//
// pg TYPE NOTES (these have bitten us before):
//   - BIGINT comes back as a JavaScript STRING, not a number. That is why ids
//     are compared as strings and why count(*) is cast with ::int below.
//   - SMALLINT comes back as a real number.
//
// This file has two halves. Do not delete one while editing the other:
//   READ PATH  - powers the bell. Used by the 3 /api/notifications routes.
//   WRITE PATH - powers broadcasting. Used by lib/notify.js only.

/**
 * The columns every list query returns, aliased to camelCase so components
 * never see snake_case. Keep this in one place: if the bell needs a new
 * field, add it here once and every query picks it up.
 */
const LIST_COLUMNS = `
	n.id,
	n.title,
	n.body,
	n.priority,
	n.kind,
	n.source,
	n.link_url   AS "linkUrl",
	n.created_at AS "createdAt",
	r.is_read    AS "isRead",
	r.read_at    AS "readAt"
`;

/* =====================================================================
   READ PATH - the bell
   ===================================================================== */

/**
 * How many unread notifications this person has. Powers the badge.
 *
 * This runs every 30 seconds for every signed-in user, so it is the single
 * hottest query in the app. It is served entirely by the partial index
 * idx_notif_unread, which only contains unread rows - so the index stays
 * small no matter how much history builds up.
 *
 * count(*) returns BIGINT, which pg hands back as a string. ::int makes it a
 * real JavaScript number so the badge does not render "6" as text weirdly.
 *
 * @param {number|string} profileId - from the signed session cookie, NEVER
 *                                    from a query parameter
 * @returns {Promise<number>}
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
 * KEYSET PAGINATION, not OFFSET. Page 20 of an OFFSET query makes the
 * database walk and throw away 400 rows; this jumps straight to the right
 * place using idx_notif_recipient_profile (profile_id, notification_id DESC).
 * Cost stays flat however deep you scroll.
 *
 * Two separate SQL strings rather than one with a clever OR: an OR here
 * stops the planner using the index cleanly. Slightly more text, much
 * better plan.
 *
 * @param {number|string} profileId
 * @param {object}  [options]
 * @param {number}  [options.limit=20]
 * @param {string}  [options.before] - pass the id of the last row you have
 * @returns {Promise<Array>}
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
 * Mark one notification read for one person.
 *
 * THE OWNERSHIP CHECK IS THE WHERE CLAUSE. profile_id = $2 means someone
 * else's notification simply matches zero rows. There is no way to mark a
 * stranger's notification read, even by guessing ids.
 *
 * Deliberately NOT filtered by is_read = false. Clicking an already-read row
 * updates zero-to-one rows and still returns true, so double clicks and slow
 * networks never produce an error. COALESCE keeps the ORIGINAL read time
 * instead of overwriting it on every re-click.
 *
 * @returns {Promise<boolean>} false means "not yours or does not exist"
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
 * Mark everything read for one person. Powers the double-tick icon.
 *
 * is_read = false IS kept here, for two reasons: it lets the partial index
 * find exactly the rows that need changing, and it makes the returned count
 * honest - "marked 6" rather than "rewrote 400 rows that were already read".
 *
 * @returns {Promise<number>} how many rows actually changed
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

/* =====================================================================
   WRITE PATH - broadcasting (Feature 09 Phase 4b)
   Called only by lib/notify.js. Never import these into a route directly.
   ===================================================================== */

/**
 * Turn an audience choice into a deduplicated list of profile ids.
 *
 * SECURITY: branchId is applied on EVERY branch of this function, including
 * the class queries, which join back to classes to prove each class belongs
 * to the caller's own branch. A class id smuggled in from another school
 * contributes zero rows instead of leaking a message across branches. The
 * route checks this too - this is the second line of defence.
 *
 * @param {object}   args
 * @param {number}   args.branchId
 * @param {string}   args.audience        'all' | 'parents' | 'teachers' | 'classes'
 * @param {Array}    [args.classIds]      required when audience === 'classes'
 * @param {string}   [args.classAudience] 'parents' | 'teachers' | 'both'
 * @returns {Promise<Array<string>>}
 */
export async function findAudienceProfileIds({
	branchId,
	audience,
	classIds = [],
	classAudience = "both",
}) {
	// 'all' includes bus staff on purpose. The bell renders on /bus, and a
	// driver needs "school closed tomorrow" more than most - they would
	// otherwise drive the route. Change this one query if you disagree.
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
			`SELECT id FROM profiles WHERE branch_id = $1 AND role = $2`,
			[branchId, role]
		);
		return result.rows.map((row) => row.id);
	}

	if (audience !== "classes") return [];
	if (!Array.isArray(classIds) || classIds.length === 0) return [];

	// Parents of ACTIVE students only. DISTINCT because a parent with two
	// children in two selected classes must receive exactly one copy. Today
	// no parent has two children, so this changes nothing - the day a real
	// school enters siblings, this one word prevents a duplicate.
	const parentsSql = `
		SELECT DISTINCT s.parent_profile_id AS id
		  FROM students s
		  JOIN classes c ON c.id = s.class_id
		 WHERE c.branch_id = $1
		   AND s.class_id = ANY($2::bigint[])
		   AND s.is_active = true
	`;

	// DISTINCT is mandatory here too: a teacher who takes three subjects for
	// the same class is three rows in teacher_class_assignments.
	const teachersSql = `
		SELECT DISTINCT tca.teacher_id AS id
		  FROM teacher_class_assignments tca
		  JOIN classes c ON c.id = tca.class_id
		 WHERE c.branch_id = $1
		   AND tca.class_id = ANY($2::bigint[])
	`;

	// UNION, not UNION ALL - it removes duplicates across both halves too.
	let sql = parentsSql;
	if (classAudience === "teachers") sql = teachersSql;
	else if (classAudience === "both") sql = `${parentsSql} UNION ${teachersSql}`;

	const result = await query(sql, [branchId, classIds]);
	return result.rows.map((row) => row.id);
}

/**
 * Create one notification and deliver it to everyone, atomically.
 *
 * FAN-OUT ON WRITE is deliberate. One row per recipient is what lets the
 * unread badge be a single indexed count, instead of joining students,
 * classes and assignments on every 30-second poll. Do not "optimise" this
 * into working out the audience at read time.
 *
 * The delivery is ONE statement using unnest, not a loop. 423 recipients is
 * a single round trip to the database.
 *
 * Wrapped in a transaction so a half-delivered notification is impossible:
 * either everyone gets it or nobody does.
 *
 * @returns {Promise<{id: string, recipientCount: number}>}
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

		// ON CONFLICT DO NOTHING guards the (notification_id, profile_id)
		// primary key, in case a caller ever passes the same id twice.
		const fanOut = await client.query(
			`INSERT INTO notification_recipients (notification_id, profile_id)
			 SELECT $1, unnest($2::bigint[])
			 ON CONFLICT DO NOTHING`,
			[notificationId, recipientProfileIds]
		);

		return { id: notificationId, recipientCount: fanOut.rowCount };
	});
}