// lib/notify.js
// -----------------------------------------------------------------------------
// THE ONLY WAY ANY FEATURE SENDS A NOTIFICATION.
//
// SHARED PROPERTY. Feature 09 owns this file, but every other feature calls it:
//   01 attendance -> "Your child was marked absent"
//   02 bus        -> "The bus is 5 minutes away"
//   04 fees       -> "Term 2 fees are due"
//   05 groups     -> "New post in Class 5A"
//   06 complaints -> "Your complaint was answered"
//   07 leaves     -> "Your leave request was approved"
//   10 exams      -> "Report cards are published"
// If you are building one of those, DO NOT write your own INSERT. Call
// createNotification() below. That is how the bell, the unread badge and phone
// push keep working without you touching them.
//
// CONTAINS NO SQL. coreRepo.js states the rule plainly: "every SQL statement in
// the app lives in lib/repos/*.js, never in a route." This file is orchestration
// only:  validate -> resolve audience -> write -> push -> audit
//
// SERVER ONLY. It reaches lib/db.js through the repo and lib/push.js reaches
// the "web-push" Node package, so a "use client" component can never import it.
// Client components import lib/notificationConstants.js instead - same allowed
// values, no database, no Node libraries.
// -----------------------------------------------------------------------------

import { logAudit } from "@/lib/audit";
import {
  AUDIENCES,
  BODY_MAX,
  CLASS_AUDIENCES,
  KINDS,
  PRIORITIES,
  TITLE_MAX,
  canUseAudience,
} from "@/lib/notificationConstants";
import { sendPushToProfiles } from "@/lib/push";
import {
  createWithRecipients,
  findAudienceProfileIds,
} from "@/lib/repos/notificationRepo";

// Re-exported so server code has ONE import to remember. The definitions live
// in notificationConstants.js so the browser can share the exact same rules.
export {
  AUDIENCES,
  BODY_MAX,
  CLASS_AUDIENCES,
  KINDS,
  PRIORITIES,
  TITLE_MAX,
  canUseAudience,
};

// -----------------------------------------------------------------------------
// WHICH MESSAGES BUZZ A PHONE.
//
// EVERY notification lands in the bell. This list decides which ones ALSO wake
// the device, including when the app is closed.
//
// "standard" is deliberately absent. A push that was not worth interrupting
// somebody for is what teaches them to switch notifications off - and once a
// parent switches them off, there is no way for the app to ask again, ever.
// Spending the interruption only on things with a consequence (a closure, a
// deadline) is what keeps the channel alive for years.
//
// Cost is NOT the reason. Push is free and lib/push.js batches in waves of 100.
// Attention is the scarce resource here, not bandwidth or CPU.
//
// NOTE: this is one level wider than the original "urgent only" plan. "Fees due
// in 3 days" is important, and a parent who misses it pays a late charge - that
// deserves a phone buzz. Change this one line if the school disagrees; nothing
// else in the app needs touching.
// -----------------------------------------------------------------------------
const PUSH_PRIORITIES = ["urgent", "important"];

/**
 * Thrown when the CALLER got something wrong - bad input, or not allowed.
 *
 * Deliberately shaped like AuthError in lib/auth.js (same `name` and `status`
 * fields) so a route can catch both in one branch instead of two.
 */
export class NotifyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "NotifyError";
    this.status = status;
  }
}

/**
 * Shared validator. Called by BOTH createNotification and broadcast so the
 * rules exist in exactly one place - and so broadcast can reject a bad message
 * BEFORE it spends a query resolving 423 recipients.
 *
 * @returns {{cleanTitle: string, cleanBody: string}} trimmed, safe values
 */
function validateMessage({ title, body, priority, kind }) {
  const cleanTitle = String(title ?? "").trim();
  const cleanBody = String(body ?? "").trim();

  if (!cleanTitle) {
    throw new NotifyError("Title is required", 400);
  }
  if (cleanTitle.length > TITLE_MAX) {
    throw new NotifyError(`Title must be ${TITLE_MAX} characters or fewer`, 400);
  }
  if (!cleanBody) {
    throw new NotifyError("Message is required", 400);
  }
  if (cleanBody.length > BODY_MAX) {
    throw new NotifyError(`Message must be ${BODY_MAX} characters or fewer`, 400);
  }
  if (!PRIORITIES.includes(priority)) {
    throw new NotifyError("Unknown priority", 400);
  }
  if (!KINDS.includes(kind)) {
    throw new NotifyError("Unknown kind", 400);
  }

  return { cleanTitle, cleanBody };
}

/**
 * Turns a list of class ids from anywhere (form, API body, another feature)
 * into a clean, de-duplicated array of positive whole numbers.
 *
 * Why this exists: the form sends strings like "63". Storing "63" in the audit
 * JSON is ugly and makes later queries awkward, so we normalise once, here.
 *
 * @param {unknown} raw
 * @returns {number[]}
 */
function normalizeClassIds(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const numbers = raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(numbers)];
}

/**
 * Writes one notification, fans it out to a list of people, and buzzes their
 * phones if it is important enough.
 *
 * This is the function every OTHER feature calls. It does not know or care
 * about audiences, roles or permissions - the caller has already worked out
 * exactly who should receive this.
 *
 * @param {object}   args
 * @param {number}   args.branchId            required
 * @param {string}   args.title               required, <= TITLE_MAX
 * @param {string}   args.body                required, <= BODY_MAX
 * @param {string}   [args.priority]          standard | important | urgent
 * @param {string}   [args.kind]              notice | reminder
 * @param {string}   args.source              which feature caused this
 * @param {string}   [args.linkUrl]           deep link opened on tap
 * @param {number}   [args.createdBy]         profile id, null for system events
 * @param {number[]} args.recipientProfileIds who receives it
 * @returns {Promise<{id: number, recipientCount: number}>}
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
  if (!branchId) {
    throw new NotifyError("branchId is required", 400);
  }
  if (!source) {
    throw new NotifyError("source is required", 400);
  }

  const { cleanTitle, cleanBody } = validateMessage({
    title,
    body,
    priority,
    kind,
  });

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

  // ---------------------------------------------------------------------------
  // PHONE PUSH. FIRE-AND-FORGET, AND THAT IS THE WHOLE POINT.
  //
  // There is deliberately NO await here. A push service having a slow day, or
  // 423 people owning phones that are switched off, must never make an admin's
  // Send button hang - and must never turn a notification that was successfully
  // saved and is already visible in the bell into a 500 on screen.
  //
  // The rows are committed by the time we get here. Push is a bonus delivery
  // channel on top of them, never a precondition.
  //
  // sendPushToProfiles() is written never to throw - it prunes dead tokens and
  // logs the rest. The .catch() is a second seatbelt for anything escaping
  // before its own guards are reached, because an unhandled rejection in Node
  // can take the whole process down.
  // ---------------------------------------------------------------------------
  if (PUSH_PRIORITIES.includes(priority)) {
    sendPushToProfiles(recipientProfileIds, {
      title: cleanTitle,
      body: cleanBody,
      linkUrl,
      kind,
      priority,
      notificationId: result.id,
    }).catch((err) => console.error("[notify] push failed:", err));
  }

  return result;
}

/**
 * Counts how many people an audience would reach, without sending anything.
 * Powers the "Send to 423 people?" confirmation in the composer.
 *
 * @returns {Promise<number>}
 */
export async function previewAudienceCount({
  branchId,
  audience,
  classIds = [],
  classAudience = "both",
}) {
  if (!AUDIENCES.includes(audience)) {
    throw new NotifyError("Pick who this message is for", 400);
  }

  const ids = await findAudienceProfileIds({
    branchId,
    audience,
    classIds: normalizeClassIds(classIds),
    classAudience,
  });

  return ids.length;
}

/**
 * A human deliberately sending a message from the Broadcast Center.
 *
 * The difference between this and createNotification: this one enforces WHO is
 * allowed to talk to WHOM, and it writes an audit row. Automated notifications
 * from other features skip both and call createNotification directly.
 *
 * @param {object}   args
 * @param {object}   args.actor          {profileId, branchId, role} FROM THE SESSION
 * @param {string}   args.audience       all | parents | teachers | classes
 * @param {number[]} [args.classIds]     only meaningful when audience is "classes"
 * @param {string}   [args.classAudience] parents | teachers | both
 * @returns {Promise<{id: number, recipientCount: number}>}
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
  if (!actor || !actor.profileId || !actor.branchId || !actor.role) {
    throw new NotifyError("Not signed in", 401);
  }
  if (!AUDIENCES.includes(audience)) {
    throw new NotifyError("Pick who this message is for", 400);
  }

  // PERMISSION FIRST, before any database work at all. A teacher trying to
  // reach the whole school is stopped here, so a hand-crafted request costs
  // us nothing more than a string comparison.
  if (!canUseAudience(actor.role, audience)) {
    throw new NotifyError(
      "You can only send to specific classes, not to the whole school",
      403
    );
  }

  // Validate the message NOW, before resolving an audience that could be 423
  // rows. Cheap failure beats expensive failure.
  const { cleanTitle } = validateMessage({ title, body, priority, kind });

  // The form keeps its class selection in memory even after you switch the
  // audience back to "All Users". Those leftovers must never reach the
  // database or the audit log, so everything class-related is gated on this
  // single flag rather than on whatever the browser happened to send.
  const isClassSend = audience === "classes";
  const cleanClassIds = isClassSend ? normalizeClassIds(classIds) : [];
  const cleanClassAudience = isClassSend ? classAudience : "both";

  if (isClassSend) {
    if (cleanClassIds.length === 0) {
      throw new NotifyError("Pick at least one class", 400);
    }
    if (!CLASS_AUDIENCES.includes(cleanClassAudience)) {
      throw new NotifyError("Unknown class audience", 400);
    }
  }

  const recipientProfileIds = await findAudienceProfileIds({
    branchId: actor.branchId,
    audience,
    classIds: cleanClassIds,
    classAudience: cleanClassAudience,
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

  // AUDIT DETAILS - record only what actually shaped this send.
  // Writing classIds on a school-wide message makes the audit trail lie about
  // the sender's intent, which defeats the point of having one.
  const details = {
    audience,
    priority,
    kind,
    title: cleanTitle,
    recipientCount: result.recipientCount,
  };
  if (isClassSend) {
    details.classIds = cleanClassIds;
    details.classAudience = cleanClassAudience;
  }

  // Standalone call (no transaction client), so lib/audit.js swallows any
  // failure rather than undoing a notification that already reached people.
  await logAudit({
    branchId: actor.branchId,
    actorId: actor.profileId,
    action: "notification.broadcast",
    entityType: "notification",
    entityId: result.id,
    details,
  });

  return result;
}