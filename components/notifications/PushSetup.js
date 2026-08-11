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
//   so the button is a requirement, not a preference. Even the automatic weekly
//   panel below only OPENS by itself - the asking is still done by a tap.
//
// THE AGREED RULE (Feature 09): the icon stays visible until alerts are
// actually on, and we re-offer at most once every seven days. Granted makes it
// disappear for good.
//
// THE HARD BROWSER LIMIT YOU CANNOT DESIGN AROUND: once someone picks Block,
// requestPermission() returns "denied" instantly, forever, without showing
// anything. No site can re-open that dialog - only the user can, through the
// padlock in the address bar. So for a blocked browser this component stops
// asking and starts EXPLAINING, which is the only thing left that works.
//
// MUST NEVER IMPORT lib/push.js OR ANYTHING REACHING lib/db.js. Those are Node
// modules; pulling one into a "use client" file breaks the build.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

// Injected at build time by Next.js because of the NEXT_PUBLIC_ prefix. The
// PRIVATE key has no prefix precisely so it can never end up here.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// How long to wait before the panel opens by itself again.
const NUDGE_DAYS = 7;

// THE THIRD THING THIS APP KEEPS IN localStorage, after the theme and the OTP
// cooldown deadline. It holds a date, nothing else - never a token, never
// anything about who is signed in. localStorage is readable by any script on
// the page, so the only safe things to keep there are ones that would not
// matter if a stranger read them. A date the user is next allowed to be asked
// a question qualifies.
const NUDGE_KEY = "greenwood.push.nudge";

/**
 * Reads the "do not nudge before" date. Returns 0 if there isn't one, which
 * means "nudge now".
 *
 * Wrapped because localStorage THROWS, not returns null, in private browsing
 * and when a browser is configured to block site data. An unhandled throw here
 * would take the whole header down with it.
 */
function readNudgeAfter() {
  try {
    const raw = window.localStorage.getItem(NUDGE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Books the next nudge for a week from now. Silently does nothing if storage
 *  is unavailable - the cost is being asked again on the next visit, which is
 *  a far smaller problem than a crash. */
function postponeNudge() {
  try {
    const next = Date.now() + NUDGE_DAYS * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(NUDGE_KEY, String(next));
  } catch {
    /* storage unavailable - ignore */
  }
}

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
  // "checking" - deciding what to show, render nothing
  // "ask"      - supported, never answered, show the icon and offer the prompt
  // "blocked"  - they chose Block, show the icon and explain how to undo it
  // "working"  - mid-request
  // "hidden"   - nothing to do: alerts are on, or this browser cannot do push
  const [phase, setPhase] = useState("checking");

  // The little panel under the icon. Opens on a tap, or by itself once a week.
  const [panelOpen, setPanelOpen] = useState(false);

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
        // to notice is to ask for it again. Nothing is rendered.
        await subscribe().catch((err) => console.error("[push] subscribe failed:", err));
        if (alive) setPhase("hidden");
        return;
      }

      if (!alive) return;

      // Not granted. The icon stays put either way - that is the agreed rule.
      // Only the panel's wording differs.
      setPhase(Notification.permission === "denied" ? "blocked" : "ask");

      // Open the panel by itself, but at most once a week. Someone who is not
      // interested sees a small icon and nothing else for seven days.
      if (readNudgeAfter() <= Date.now()) {
        setPanelOpen(true);
        postponeNudge();
      }
    };

    start();

    return () => {
      alive = false;
    };
  }, [subscribe]);

  // Tapping the icon always opens the panel, whatever the browser has decided.
  // It does not spend the weekly budget - the user asked for this one.
  const togglePanel = () => setPanelOpen((open) => !open);

  const dismiss = () => {
    setPanelOpen(false);
    postponeNudge();
  };

  const handleEnable = async () => {
    setPhase("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await subscribe();
        setPanelOpen(false);
        setPhase("hidden");
        return;
      }
      // They chose Block. The dialog can never be shown again, so from here on
      // the panel explains instead of asking. The icon stays.
      setPhase("blocked");
      setPanelOpen(false);
      postponeNudge();
    } catch (err) {
      console.error("[push] enabling alerts failed:", err);
      setPhase("blocked");
      setPanelOpen(false);
      postponeNudge();
    }
  };

  if (phase === "checking" || phase === "hidden") {
    return null;
  }

  const blocked = phase === "blocked";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={togglePanel}
        disabled={phase === "working"}
        aria-label={blocked ? "Alerts are blocked on this device" : "Turn on alerts on this device"}
        title={blocked ? "Alerts are blocked on this device" : "Turn on alerts on this device"}
        aria-expanded={panelOpen}
        // Shared square from globals.css. The attention colour is dropped once
        // the browser is blocked - at that point it is information, not an
        // invitation, and a permanently yellow icon just becomes wallpaper.
        className={blocked ? "icon-button" : "icon-button icon-button-attention"}
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

      {panelOpen && (
        <div
          role="dialog"
          aria-label="Alerts on this device"
          className="card absolute right-0 top-full z-50 mt-2 w-72 text-left"
        >
          <p className="label-micro">Alerts</p>

          {blocked ? (
            <>
              <p className="mt-2 text-sm text-body">
                This browser is blocking alerts, so urgent school messages will
                not reach you when the app is closed.
              </p>
              <p className="mt-2 text-sm text-muted">
                To switch them back on: tap the padlock next to the web address,
                set Notifications to Allow, then reload the page. Only you can
                do this - the app is not allowed to ask again.
              </p>
              <button type="button" onClick={dismiss} className="cta mt-4 w-full">
                Got it
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-body">
                Get urgent school messages on this device even when the app is
                closed.
              </p>
              <p className="mt-2 text-sm text-muted">
                Only urgent and important notices are sent this way. You can
                turn it off at any time.
              </p>
              <button
                type="button"
                onClick={handleEnable}
                disabled={phase === "working"}
                className="cta mt-4 w-full"
              >
                {phase === "working" ? "Just a moment" : "Turn on alerts"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="mt-2 w-full text-xs text-muted hover:text-body"
              >
                Not now
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}