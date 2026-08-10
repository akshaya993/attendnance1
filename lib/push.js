// lib/push.js
// -----------------------------------------------------------------------------
// THE ONLY WAY THE APP TALKS TO A PHONE'S PUSH SERVICE.
//
// SHARED PROPERTY, exactly like lib/notify.js. Feature 09 owns it; Feature 02
// (live bus tracking) will send through it too. Nobody else should ever import
// "web-push" directly.
//
// The Feature 09 prompt file assumed a push helper already existed from Feature
// 02. It does not - Feature 02 is not built yet - so this file is created here.
//
// CONTAINS NO SQL. Rows come from lib/repos/deviceTokenRepo.js.
//
// SERVER ONLY, AND STRICTLY SO. "web-push" is a Node library using crypto that
// does not exist in a browser. A "use client" component that imports this file
// - even indirectly - will fail to build.
//
// WHAT A SUBSCRIPTION IS:
//   We never contact a phone. When a user allows notifications, their browser
//   registers with ITS OWN maker's push service (Chrome with Google, Firefox
//   with Mozilla) and gets back a secret endpoint URL plus two encryption keys.
//   We store that bundle and, to send, post an encrypted blob to the endpoint
//   signed with our VAPID private key. The push service delivers it even when
//   the app is closed. That is why polling cannot replace this, and why the
//   private key must never leave the server.
// -----------------------------------------------------------------------------

import webpushImport from "web-push";
import {
  deleteDeviceTokens,
  listDeviceTokens,
} from "@/lib/repos/deviceTokenRepo";

// "web-push" is an older CommonJS package. Depending on how the bundler
// interops it, this default import is EITHER the module itself OR an object
// with the real module hiding under `.default`. Assuming one shape and getting
// the other makes setVapidDetails `undefined`, and calling undefined throws a
// TypeError that reaches the browser as a bare 500 with no clue in it.
// Accepting both shapes costs one line and removes a whole class of mystery.
const webpush = webpushImport?.default ?? webpushImport;

// How long a push service should keep retrying while a phone is off, in
// seconds. Six hours suits the messages we mark urgent ("school is closed
// tomorrow"). Past that the message is stale, and the bell shows it anyway.
const TTL_SECONDS = 60 * 60 * 6;

// Send in waves instead of firing everything at once. A school-wide urgent
// broadcast is 423 people who may own two devices each - over 800 outbound
// HTTPS calls. All at once would exhaust the Node socket pool and stall the
// request that triggered it.
const CHUNK_SIZE = 100;

// setVapidDetails is global state inside web-push, so it must run exactly once.
// We cache the OUTCOME, success or failure, along with a human reason.
let configureResult = null;

/**
 * Loads the VAPID keys and hands them to web-push. Runs once per server start.
 *
 * NEVER THROWS. Push being misconfigured must not be able to break anything
 * else - the bell, the badge and the broadcast center all work without it. Any
 * problem is reported as { ok: false, reason } for a human to read.
 *
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY carries the NEXT_PUBLIC_ prefix because the
 * BROWSER needs the public key to create a subscription. The private key has no
 * prefix on purpose: that is what keeps it server-side only. Never rename it.
 *
 * The result is cached, INCLUDING a failure. So after correcting .env.local you
 * must restart the dev server - which Next.js requires for env changes anyway.
 *
 * @returns {{ok: boolean, reason: string}}
 */
function configure() {
  if (configureResult) {
    return configureResult;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  const missing = [];
  if (!publicKey) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!privateKey) missing.push("VAPID_PRIVATE_KEY");
  if (!subject) missing.push("VAPID_SUBJECT");

  if (missing.length > 0) {
    configureResult = {
      ok: false,
      reason: `missing from .env.local: ${missing.join(", ")} (restart the dev server after adding them)`,
    };
    return configureResult;
  }

  if (typeof webpush?.setVapidDetails !== "function") {
    configureResult = {
      ok: false,
      reason: "the web-push package did not load correctly - run: npm install web-push",
    };
    return configureResult;
  }

  try {
    // Strict about all three: the subject must be a mailto: or https: URL, the
    // public key must decode to 65 bytes and the private key to 32. A stray
    // quote, space or newline copied out of the terminal fails right here.
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configureResult = { ok: true, reason: "ready" };
  } catch (err) {
    configureResult = {
      ok: false,
      reason: `VAPID details rejected: ${err.message} - check .env.local has no quotes, spaces or line breaks around the values`,
    };
  }

  return configureResult;
}

/**
 * Is push usable, and if not, why? Safe to call from anywhere.
 * @returns {{ready: boolean, reason: string}}
 */
export function pushStatus() {
  const result = configure();
  return { ready: result.ok, reason: result.reason };
}

/**
 * Convenience wrapper for callers that only need a yes or no.
 */
export function isPushConfigured() {
  return configure().ok;
}

/**
 * Pushes one message to every browser belonging to these people.
 *
 * CALL THIS FIRE-AND-FORGET. Do not await it inside a request. A phone that has
 * been off for a week must never make an admin's Send button hang, and a push
 * service having a bad day must never turn a delivered notification into a 500.
 * lib/notify.js calls it without await and logs any rejection.
 *
 * NEVER THROWS. Every failure is either a pruned dead token or a log line.
 *
 * @param {number[]} profileIds  who to reach
 * @param {object}   message
 * @param {string}   message.title
 * @param {string}   message.body
 * @param {string}   [message.linkUrl]  where a tap should land
 * @param {string}   [message.kind]     notice | reminder
 * @param {string}   [message.priority]
 * @param {string|number} [message.notificationId]
 * @returns {Promise<{sent: number, failed: number, removed: number}>}
 */
export async function sendPushToProfiles(profileIds, message) {
  const config = configure();

  if (!config.ok) {
    // Not an error. Push simply is not available in this environment.
    console.warn(`[push] skipped - ${config.reason}`);
    return { sent: 0, failed: 0, removed: 0 };
  }

  const tokens = await listDeviceTokens(profileIds);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  // Serialised once, reused for every device. public/sw.js reads exactly these
  // field names - change one side and you must change the other.
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    linkUrl: message.linkUrl ?? null,
    kind: message.kind ?? "notice",
    priority: message.priority ?? "standard",
    notificationId: message.notificationId ?? null,
  });

  const options = {
    TTL: TTL_SECONDS,
    // Tells the phone this is worth waking the screen for, rather than being
    // batched until the device next happens to be awake.
    urgency: message.priority === "urgent" ? "high" : "normal",
  };

  let sent = 0;
  let failed = 0;
  const deadTokenIds = [];

  for (let start = 0; start < tokens.length; start += CHUNK_SIZE) {
    const wave = tokens.slice(start, start + CHUNK_SIZE);

    // allSettled, never Promise.all: one rejected push must not abandon the
    // other ninety-nine in the wave.
    const results = await Promise.allSettled(
      wave.map((token) =>
        webpush.sendNotification(token.subscription, payload, options)
      )
    );

    results.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        sent += 1;
        return;
      }

      failed += 1;
      const status = outcome.reason?.statusCode;

      // 404 = endpoint gone. 410 = subscription expired or revoked. Both are
      // permanent, so the row is useless and gets deleted. Anything else - 429,
      // 500, a timeout, a DNS failure - is temporary, so we keep the token and
      // it simply works next time.
      if (status === 404 || status === 410) {
        deadTokenIds.push(wave[index].id);
      } else {
        console.error("[push] send failed:", status ?? outcome.reason?.message);
      }
    });
  }

  let removed = 0;
  if (deadTokenIds.length > 0) {
    try {
      removed = await deleteDeviceTokens(deadTokenIds);
    } catch (err) {
      // Housekeeping only. Failing to prune is not worth surfacing anywhere.
      console.error("[push] could not remove dead tokens:", err);
    }
  }

  return { sent, failed, removed };
}