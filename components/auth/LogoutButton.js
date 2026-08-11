"use client";

// Sign out of THIS device. Calls POST /api/auth/logout, which clears the
// session cookie. It deliberately does not log you out of your other devices -
// that only happens on a password change (session_epoch bump).
//
// IT ALSO HANDS BACK THE PUSH SUBSCRIPTION FIRST. Notification permission
// belongs to the SITE, not to your login, and a browser holds exactly one
// subscription for the whole site. Skip this and the next person to sign in on
// the same phone inherits your push address - our own database had one endpoint
// registered to both the admin and a teacher because of it.
//
// Feature 09 owns the push half. Feature 13 owns the cookie half.

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Gives up this browser's push subscription and tells the server to drop the
 * matching device_tokens row.
 *
 * NEVER THROWS AND NEVER BLOCKS FOR LONG. Sign out is a thing the user asked
 * for; it cannot be held hostage by a service worker or a slow network. Every
 * step is optional and every failure is swallowed. The worst case is one stale
 * row, which lib/push.js prunes the first time the push service reports it
 * dead, or which the next person's subscribe releases.
 *
 * THREE ORDERING RULES, all of them easy to get wrong:
 *   1. Read `subscription.endpoint` BEFORE calling unsubscribe(). Afterwards
 *      the object is spent.
 *   2. Send the DELETE BEFORE /api/auth/logout, while the cookie still proves
 *      who we are. The server reads the profile id from that cookie.
 *   3. Use getRegistration(), NOT serviceWorker.ready. `ready` never resolves
 *      when no worker is registered, which would hang Sign out forever on any
 *      browser that does not support push.
 */
async function releaseThisDevice() {
  try {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || !registration.pushManager) {
      return;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return;
    }

    const endpoint = subscription.endpoint;

    // Tell the browser first. Even if our own API call fails, this device stops
    // receiving messages, which is the part the user actually cares about.
    await subscription.unsubscribe().catch(() => {});

    await fetch("/api/notifications/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
      // A hard cap so a stalled request cannot trap somebody on the page.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Deliberately silent. See the note above: sign out always proceeds.
  }
}

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);

    // Push first, cookie second. Reversing these two lines would break it:
    // the DELETE endpoint needs the session that /api/auth/logout destroys.
    await releaseThisDevice();

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the network call fails, send them to /login. The cookie may
      // survive, but the user is not left stuck on a page they wanted to leave.
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} disabled={busy} className="cta">
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}