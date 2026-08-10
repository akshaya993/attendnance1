"use client";

// components/notifications/PushSetup.js
// -----------------------------------------------------------------------------
// Registers the service worker and gets this browser a push subscription.
//
// MOUNTED ONCE, IN app/layout.js, AND ONLY WHEN SOMEBODY IS SIGNED IN. Never
// mount it on /login - there is no account to attach a subscription to yet.
//
// WHY THIS IS A BUTTON AND NOT AUTOMATIC
//   Notification.requestPermission() must be triggered by a real tap on Safari
//   and iOS, or it is refused outright. Chrome allows it without one but
//   punishes sites that ask on page load by quietly suppressing the prompt for
//   repeat visitors. A single tap is the only approach that works everywhere,
//   so the button is a requirement, not a preference.
//
// IT RENDERS NOTHING once permission is settled - granted or denied. A parent
// sees it once, ever.
//
// MUST NEVER IMPORT lib/push.js OR ANYTHING REACHING lib/db.js. Those are Node
// modules; pulling one into a "use client" file breaks the build.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

// Injected at build time by Next.js because of the NEXT_PUBLIC_ prefix. The
// PRIVATE key has no prefix precisely so it can never end up here.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * The push API wants the key as raw bytes, but VAPID keys travel as
 * base64url text. This converts one to the other.
 *
 * base64url swaps "+/" for "-_" and drops the "=" padding, so both have to be
 * put back before atob() will accept the string.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/**
 * Was an existing subscription created with the key we are using today?
 *
 * WHY THIS MATTERS: a subscription is bound to the public key that made it. If
 * the server's VAPID pair is ever regenerated, every stored subscription still
 * looks perfectly valid to the browser but the push service will reject
 * anything we sign. The symptom is notifications that silently never arrive.
 * Comparing the bytes lets us detect it and re-subscribe instead.
 */
function keyMatches(existingKey, currentBytes) {
  if (!existingKey) {
    return false;
  }
  const existing = new Uint8Array(existingKey);
  if (existing.length !== currentBytes.length) {
    return false;
  }
  for (let i = 0; i < existing.length; i += 1) {
    if (existing[i] !== currentBytes[i]) {
      return false;
    }
  }
  return true;
}

export default function PushSetup() {
  // "checking"  - deciding what to show, render nothing
  // "prompt"    - supported, permission not answered yet, show the button
  // "working"   - mid-request
  // "hidden"    - nothing to do: granted, denied, or unsupported
  const [phase, setPhase] = useState("checking");

  // Guards against React running effects twice in development, which would
  // otherwise fire two subscribe calls on every page load.
  const startedRef = useRef(false);

  /**
   * Gets a subscription and hands it to the server. Safe to call repeatedly -
   * the API upserts, so a second call simply answers created:false.
   */
  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing - restart the dev server after editing .env.local");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const currentBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    let subscription = await registration.pushManager.getSubscription();

    if (subscription && !keyMatches(subscription.options?.applicationServerKey, currentBytes)) {
      // Signed for a key we no longer own. Throw it away rather than keeping a
      // subscription that can never receive anything.
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        // Required to be true by every browser. It is a promise that every push
        // we send results in something the user can see - no silent tracking.
        userVisibleOnly: true,
        applicationServerKey: currentBytes,
      });
    }

    const response = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // toJSON() produces exactly { endpoint, expirationTime, keys }. The API
      // strips expirationTime before storing - see the note about the UNIQUE
      // constraint in that route.
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      console.error("[push] server refused the subscription:", result?.error ?? response.status);
      return false;
    }

    if (result.data?.pushReady === false) {
      // Saved fine, but this server cannot actually send. Worth saying out loud
      // in development, because the only other symptom is silence.
      console.warn(`[push] subscribed, but the server cannot send yet - ${result.data.pushReason}`);
    }

    return true;
  }, []);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    let alive = true;

    const start = async () => {
      // A service worker needs a secure context: real HTTPS, or localhost.
      // http://192.168.x.x:3000 does NOT qualify, which is why the phone cannot
      // be tested this way yet.
      const supported =
        typeof window !== "undefined" &&
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported) {
        if (alive) setPhase("hidden");
        return;
      }

      try {
        // Idempotent - the browser reuses the existing registration unless
        // /sw.js changed on disk.
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        console.error("[push] service worker registration failed:", err);
        if (alive) setPhase("hidden");
        return;
      }

      if (Notification.permission === "granted") {
        // Already allowed. Re-subscribe silently on every load, because a
        // browser can rotate or drop a subscription on its own and the only way
        // to notice is to ask for it again.
        await subscribe().catch((err) => console.error("[push] subscribe failed:", err));
        if (alive) setPhase("hidden");
        return;
      }

      if (Notification.permission === "denied") {
        // Cannot be re-prompted from code. Only the user can undo this, via the
        // padlock in the address bar. Showing a dead button would be worse than
        // showing nothing.
        if (alive) setPhase("hidden");
        return;
      }

      if (alive) setPhase("prompt");
    };

    start();

    return () => {
      alive = false;
    };
  }, [subscribe]);

  const handleClick = async () => {
    setPhase("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await subscribe();
      }
    } catch (err) {
      console.error("[push] enabling alerts failed:", err);
    }
    // Either way the button's job is done. Granted means it is no longer
    // needed; denied means it can never work again.
    setPhase("hidden");
  };

  if (phase !== "prompt" && phase !== "working") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={phase === "working"}
      aria-label="Turn on alerts on this device"
      title="Turn on alerts on this device"
      // Same 44px square as the bell and the theme toggle so the header stays
      // on one grid. text-warn on purpose: this is the one header control that
      // should catch the eye, and it disappears for good once it is used.
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised text-warn transition-colors duration-150 hover:text-body disabled:opacity-50"
    >
      {/* A bell with a line through it - alerts are currently off. Distinct
          from the plain bell next to it, which opens the list. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8.7 3.7A6 6 0 0 1 18 8.7c0 5 2 6.3 2 6.3H7" />
        <path d="M6.3 6.3A6 6 0 0 0 6 8.7c0 5-2 6.3-2 6.3h3" />
        <path d="M10.3 19a2 2 0 0 0 3.4 0" />
        <path d="M2 2l20 20" />
      </svg>
    </button>
  );
}