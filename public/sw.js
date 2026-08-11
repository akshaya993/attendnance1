// public/sw.js
// -----------------------------------------------------------------------------
// THE SERVICE WORKER. Feature 09 (Notifications).
//
// This is the only piece of the app that keeps running after the last tab is
// closed. The browser wakes it up when a push arrives, it draws the OS
// notification, and it goes back to sleep. That is the whole reason a parent
// hears about a closed school while the app is not even open.
//
// IT IS NOT BUNDLED. It is served raw from /sw.js, so:
//   - no imports, no "@/" aliases, no JSX, no npm packages
//   - `self` is the worker, not `window`. There is no DOM in here at all.
//
// WHY IT LIVES IN public/ AND NOT app/
//   A service worker can only control pages at or below its own URL. Served
//   from /sw.js it controls the whole site, which is what "scope": "/" in
//   public/manifest.json promises. Put it anywhere deeper and push would only
//   work on part of the app.
//
// proxy.js ALREADY LETS THIS THROUGH. The matcher excludes anything ending in
// .js, so /sw.js is public. It must be - the browser fetches it with no cookie.
// -----------------------------------------------------------------------------

// Bump this when you change this file. It is only a comment marker for humans,
// but the browser reinstalls the worker whenever the BYTES change, so a version
// note makes "which version is that phone running" answerable.
// v1 - Feature 09, initial push + click handling.
// v2 - the sign-out rule: nothing is drawn on a device with nobody signed in.

// Take over immediately instead of waiting for every old tab to close. Without
// this, a fix to this file could sit unused for days on a parent's phone.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// -----------------------------------------------------------------------------
// THERE IS DELIBERATELY NO FETCH HANDLER.
//
// This worker used to register an empty one, because older browsers demanded a
// fetch handler before they would offer "Install app". That requirement is gone,
// and browsers now warn about it: an empty handler still forces every single
// page request to detour through this worker and back, for no benefit at all.
// With no handler, the browser skips this worker entirely during navigation.
//
// NEVER ADD CACHING HERE. Every real page in this app is behind a login, and a
// cached page is stored on the DEVICE, not per account. On a shared family
// phone, caching /parent would serve one parent's child's data to the next
// person who signs in. Offline support, if it is ever wanted, belongs to a
// designed feature with an explicit rule about which URLs are safe - never a
// blanket cache bolted onto notifications.
// -----------------------------------------------------------------------------
self.addEventListener("fetch", () => {});

// -----------------------------------------------------------------------------
// THE SIGN-OUT RULE: no login, no notification.
//
// Signing out already deletes this browser's row from device_tokens, so the
// server stops pushing here at all. That is the real protection, and it happens
// on the server. This function is the seatbelt for the gap in between - a push
// that was already dispatched and is still travelling when the person signs out
// will still land here, and must not be drawn.
//
// HOW IT ASKS. A service worker cannot read the session cookie: it is httpOnly,
// which is exactly what stops a script from stealing it. What it CAN do is make
// an ordinary same-origin request, and the browser attaches the cookie by
// itself. So we call a route that already sits behind the login and let the
// ANSWER tell us. 401 means nobody is signed in on this device.
//
// WHY THIS ROUTE. /api/notifications?count_only=true already exists, returns a
// tiny {unreadCount} and nothing private, and proxy.js already answers it with
// 401 for a caller with no session. No new endpoint was invented for this.
//
// no-store MATTERS. A cached 200 from earlier would happily hide the fact that
// the person has since signed out.
//
// IF THE CHECK ITSELF FAILS, WE SHOW THE NOTIFICATION. We cannot prove anybody
// is signed out, and swallowing a real "school is closed tomorrow" is worse
// than showing one message to a phone that just signed out.
//
// KNOWN AND ACCEPTED: this proves SOMEBODY is signed in, not WHO. On a shared
// family phone, one parent would have to sign out and the other sign in inside
// the couple of seconds a push is in flight for the wrong person to see it.
// Deleting the row on sign-out closes everything wider than that.
//
// SIDE EFFECT TO EXPECT: when we choose to draw nothing, Chrome sometimes puts
// up its own "This site has been updated in the background" notice instead.
// That is the browser, not us, and it is the price of refusing to leak.
// -----------------------------------------------------------------------------
function hasSignedInUser() {
  return fetch("/api/notifications?count_only=true", {
    credentials: "include",
    cache: "no-store",
  })
    .then(function (response) {
      if (response.status === 401 || response.status === 403) return false;
      return true;
    })
    .catch(function () {
      return true;
    });
}

// -----------------------------------------------------------------------------
// A PUSH ARRIVED.
//
// The payload was encrypted by lib/push.js and these field names must match the
// object it builds exactly:
//   { title, body, linkUrl, kind, priority, notificationId }
// Change one side and you must change the other.
// -----------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  var payload = {};

  // event.data can be null: push services are allowed to send an empty wake-up.
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      // Not our JSON. Show it as plain text rather than showing nothing - a
      // silent push in Chrome triggers a browser-generated "This site has been
      // updated in the background" notice, which looks broken to a parent.
      payload = { title: "Greenwood School", body: event.data.text() };
    }
  }

  var title = payload.title || "Greenwood School";
  var tag = payload.notificationId ? "greenwood-" + payload.notificationId : null;

  var options = {
    body: payload.body || "",
    icon: "/icon-512.png",

    // The small monochrome mark Android puts in the status bar. Our logo is not
    // ideal for it (it wants a flat silhouette) but a wrong-shaped badge is
    // better than Chrome's default, which is a generic globe.
    badge: "/icon-512.png",

    // A tag makes a re-delivered push REPLACE its earlier copy instead of
    // stacking a second identical notification. Push services retry, so without
    // this a parent can see the same message three times.
    tag: tag || undefined,

    // Only legal alongside a tag. Lets a replacement buzz again rather than
    // updating silently.
    renotify: Boolean(tag),

    // Urgent stays on screen until it is acknowledged. "School is closed
    // tomorrow" must not vanish while the phone is in a pocket. Standard and
    // important auto-dismiss like normal notifications.
    requireInteraction: payload.priority === "urgent",

    // Read back by the click handler below. This is the only way to pass
    // anything from here to there.
    data: {
      linkUrl: payload.linkUrl || "/",
      notificationId: payload.notificationId || null,
      kind: payload.kind || "notice",
      priority: payload.priority || "standard",
    },
  };

  // waitUntil is not optional. The browser kills an idle worker within seconds,
  // and showNotification is asynchronous - without this the notification often
  // never appears at all, at random.
  //
  // The sign-out check runs FIRST and the drawing is chained behind it, so both
  // the question and the answer are covered by the same waitUntil.
  event.waitUntil(
    hasSignedInUser().then(function (signedIn) {
      if (!signedIn) return undefined;
      return self.registration.showNotification(title, options);
    })
  );
});

// -----------------------------------------------------------------------------
// THE USER TAPPED THE NOTIFICATION.
//
// Focus a tab that is already open rather than opening a second one, then send
// it to the right place. link_url on the notifications row is what makes
// "3 fees overdue" able to land on the fees page instead of the home page.
// -----------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  var data = event.notification.data || {};
  var linkUrl = data.linkUrl || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i += 1) {
          var client = clientList[i];
          if ("focus" in client) {
            if ("navigate" in client) {
              // Can reject if the tab is mid-navigation. Focusing still helps,
              // so swallow it rather than losing the tap entirely.
              client.navigate(linkUrl).catch(function () {});
            }
            return client.focus();
          }
        }
        // Nothing open - cold start the app.
        return self.clients.openWindow(linkUrl);
      })
  );
});