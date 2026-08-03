// lib/audit.js
// THE ONLY WRITE PATH INTO audit_logs. Never write to that table directly.
//
// OWNERSHIP: on paper this file belongs to Feature 14 (Promotions), Prompt 1.
// It was built early, during Feature 13, because authentication has to log
// 'auth.admin_login' and 'auth.lockout' from day one.
// => Features 01, 04, 07, 08, 11, 12 and 14 must IMPORT this file.
//    They must NEVER create it again. Tracker row 14-P1 is DONE.
//
// DB CONTRACT: audit_logs already exists in db/schema.sql. No DDL here.
//   branch_id   NOT NULL   -- every call MUST supply a branch
//   actor_id    nullable   -- null = system/unauthenticated actor
//   action      NOT NULL   -- dotted string, see the list below
//   entity_type NOT NULL
//   entity_id   nullable
//   details     JSONB DEFAULT '{}'
//
// WHEN TO LOG: sensitive mutations only -- money, marks overrides, deletes,
// promotions, admin overrides, admin logins, lockouts. NEVER on reads, and
// never on ordinary parent/teacher logins (400 parents x daily = pure noise).

import { query } from "@/lib/db";

// Allowlist. A typo like 'fee.paymnet' would silently create a bogus action
// that no report ever finds, so we fail loudly in development instead.
export const AUDIT_ACTIONS = [
  "fee.payment",
  "marks.save",
  "marks.override",
  "attendance.override",
  "post.delete",
  "profile.change_review",
  "admission.approve",
  "auth.admin_login",
  "auth.lockout",
  "promotion.run",
  "promotion.school_run",
  "student.move",
];

/**
 * Write one audit row.
 *
 * @param {Object} entry
 * @param {number|string}  entry.branchId    required
 * @param {number|string?} entry.actorId     who did it (null = system)
 * @param {string}         entry.action      one of AUDIT_ACTIONS
 * @param {string}         entry.entityType  'fee' | 'profile' | 'student' ...
 * @param {number|string?} entry.entityId
 * @param {Object?}        entry.details     before/after values, JSON-safe
 * @param {Object?} client  a pg client from withTransaction(). Pass it when
 *                          the audit row must commit or roll back together
 *                          with the operation (fees, promotions).
 *
 * Standalone (no client): errors are swallowed and logged. Audit failure must
 * never break a login or a payment screen.
 * With a client: errors are re-thrown, because a half-written transaction is
 * worse than no transaction.
 *
 * NOTE: context/00-PROJECT-STRUCTURE.md documents this as
 * logAudit(client, {...}). We use logAudit(entry, client) because almost every
 * caller has no transaction. That doc gets corrected in Feature 13 Task 11.
 */
export async function logAudit(entry, client = null) {
  const {
    branchId,
    actorId = null,
    action,
    entityType,
    entityId = null,
    details = {},
  } = entry || {};

  if (!branchId) throw new Error("logAudit: branchId is required");
  if (!action) throw new Error("logAudit: action is required");
  if (!entityType) throw new Error("logAudit: entityType is required");

  if (
    process.env.NODE_ENV !== "production" &&
    !AUDIT_ACTIONS.includes(action)
  ) {
    throw new Error(
      `logAudit: unknown action "${action}". Add it to AUDIT_ACTIONS in lib/audit.js first.`
    );
  }

  const text = `
    INSERT INTO audit_logs
      (branch_id, actor_id, action, entity_type, entity_id, details)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `;
  const params = [
    branchId,
    actorId,
    action,
    entityType,
    entityId,
    JSON.stringify(details ?? {}),
  ];

  if (client) {
    const { rows } = await client.query(text, params);
    return rows[0].id;
  }

  try {
    const { rows } = await query(text, params);
    return rows[0].id;
  } catch (err) {
    console.error("[audit] failed to write audit row", { action, err });
    return null;
  }
}