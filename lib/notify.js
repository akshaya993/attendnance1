// lib/notify.js
// THE ONLY WAY ANY FEATURE SENDS A NOTIFICATION. Never INSERT into
// notifications or notification_recipients from anywhere else.
//
// OWNERSHIP: built in Feature 09, but SHARED PROPERTY. Features 01
// (attendance), 02 (bus), 04 (fees), 05 (groups), 06 (leaves), 07 (exams) and
// 10 (complaints) must import createNotification() from here.
// => Do NOT create a second notify helper. Do NOT write SQL in those features.
//
// CONTAINS NO SQL. Every statement lives in lib/repos/notificationRepo.js,
// per the rule stated at the top of lib/repos/coreRepo.js.

import {
  findAudienceProfileIds,
  createWithRecipients,
} from "@/lib/repos/notificationRepo";
import { logAudit } from "@/lib/audit";

export const PRIORITIES = ["standard", "important", "urgent"];
export const KINDS = ["notice", "reminder"];
export const AUDIENCES = ["all", "parents", "teachers", "classes"];
export const CLASS_AUDIENCES = ["parents", "teachers", "both"];

// Audiences that reach beyond a class list. Admin only - see canUseAudience.
export const SCHOOL_WIDE_AUDIENCES = ["all", "parents", "teachers"];

export const TITLE_MAX = 120;
export const BODY_MAX = 1000;

/**
 * Thrown for anything the caller got wrong. Deliberately shaped like AuthError
 * so a route can handle both with one catch block.
 */
export class NotifyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "NotifyError";
    this.status = status;
  }
}

/**
 * Is this role allowed to target this audience?
 *
 * THE RULE (decided by the product owner, Feature 09):
 *   admin   - anything in the branch
 *   teacher - ANY class, but never All Users / All Parents / All Teachers
 *
 * Why teachers are capped: there are 20 of them and 400 parents. One annoyed
 * teacher, or one stolen teacher password, must not be able to blast the whole
 * school. Admins are few and every broadcast they send is audited.
 *
 * The composer hides the blocked radio buttons, but that is cosmetic. This
 * function is the real boundary and the route calls it on every request.
 */
export function canUseAudience(role, audience) {
  if (role === "admin") return true;
  if (role === "teacher") return audience === "classes";
  return false;
}

/**
 * Send a notification to an explicit list of people.
 *
 * THIS IS THE FUNCTION OTHER FEATURES CALL. Attendance marking a child absent
 * passes one parent id; fees passes the defaulters. Nobody outside this file
 * needs to know how fan-out works.
 *
 * @param {object}   args
 * @param {number}   args.branchId
 * @param {string}   args.title
 * @param {string}   args.body
 * @param {string}   [args.priority='standard']
 * @param {string}   [args.kind='notice']
 * @param {string}   args.source   must be in notifications_source_check
 * @param {string}   [args.linkUrl]  deep link, e.g. '/parent/fees'
 * @param {number}   [args.createdBy]
 * @param {Array}    args.recipientProfileIds
 * @returns {Promise<{id: string, recipientCount: number}>}
 */
export async function createNotification({
  branchId,
  title,
  body,
  priority = "standard",
  kind = "notice",
  source,
  linkUrl = null,
  createdBy = null,
  recipientProfileIds,
}) {
  if (!branchId) throw new NotifyError("branchId is required", 400);
  if (!source) throw new NotifyError("source is required", 400);

  const cleanTitle = String(title ?? "").trim();
  const cleanBody = String(body ?? "").trim();

  if (!cleanTitle) throw new NotifyError("Title is required", 400);
  if (!cleanBody) throw new NotifyError("Message is required", 400);
  if (cleanTitle.length > TITLE_MAX) {
    throw new NotifyError(`Title cannot exceed ${TITLE_MAX} characters`, 400);
  }
  if (cleanBody.length > BODY_MAX) {
    throw new NotifyError(`Message cannot exceed ${BODY_MAX} characters`, 400);
  }
  if (!PRIORITIES.includes(priority)) {
    throw new NotifyError("Invalid priority", 400);
  }
  if (!KINDS.includes(kind)) {
    throw new NotifyError("Invalid kind", 400);
  }
  if (!Array.isArray(recipientProfileIds) || recipientProfileIds.length === 0) {
    throw new NotifyError("Nobody matches that audience", 400);
  }

  const result = await createWithRecipients({
    branchId,
    title: cleanTitle,
    body: cleanBody,
    priority,
    kind,
    source,
    linkUrl,
    createdBy,
    recipientProfileIds,
  });

  // FEATURE 03 (PWA push) HOOKS IN HERE, once lib/push.js exists:
  //   if (priority === "urgent") sendPushToProfiles(recipientProfileIds, {...})
  // Fire-and-forget - a dead push token must never fail a broadcast.

  return result;
}

/**
 * Count who an audience would reach, without sending anything.
 * Powers the "Send to ~N recipients?" confirm dialog.
 */
export async function previewAudienceCount({
  branchId,
  audience,
  classIds = [],
  classAudience = "both",
}) {
  const ids = await findAudienceProfileIds({
    branchId,
    audience,
    classIds,
    classAudience,
  });
  return ids.length;
}

/**
 * Resolve an audience and send to it. Used by the Broadcast Center only.
 *
 * @param {object} args.actor - { profileId, branchId, role } from the session
 */
export async function broadcast({
  actor,
  title,
  body,
  priority = "standard",
  kind = "notice",
  audience,
  classIds = [],
  classAudience = "both",
  linkUrl = null,
}) {
  if (!AUDIENCES.includes(audience)) {
    throw new NotifyError("Invalid audience", 400);
  }
  if (!CLASS_AUDIENCES.includes(classAudience)) {
    throw new NotifyError("Invalid class audience", 400);
  }

  // THE PERMISSION GATE. Runs before any database work.
  if (!canUseAudience(actor.role, audience)) {
    throw new NotifyError(
      "You can only send to specific classes, not to the whole school",
      403
    );
  }

  if (audience === "classes" && classIds.length === 0) {
    throw new NotifyError("Select at least one class", 400);
  }

  const recipientProfileIds = await findAudienceProfileIds({
    branchId: actor.branchId,
    audience,
    classIds,
    classAudience,
  });

  const result = await createNotification({
    branchId: actor.branchId,
    title,
    body,
    priority,
    kind,
    source: "broadcast",
    linkUrl,
    createdBy: actor.profileId,
    recipientProfileIds,
  });

  // Audited AFTER the transaction commits, standalone. lib/audit.js swallows
  // standalone failures by design - a lost audit row must never undo a
  // broadcast that 400 parents have already received.
  await logAudit({
    branchId: actor.branchId,
    actorId: actor.profileId,
    action: "notification.broadcast",
    entityType: "notification",
    entityId: result.id,
    details: {
      audience,
      classIds,
      classAudience,
      priority,
      kind,
      recipientCount: result.recipientCount,
      title: String(title).slice(0, TITLE_MAX),
    },
  });

  return result;
}