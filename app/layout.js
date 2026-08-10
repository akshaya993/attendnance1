// app/layout.js
// App shell — created in Feature 13, made session-aware and installable in
// Feature 09.
// Owns: <html data-theme>, page metadata, the PWA manifest link, the top bar,
// the theme toggle, the compose button, the notification bell and the
// push-permission prompt.
// Feature 11 mounts <ProfileIcon/> into the same <header> below, to the RIGHT
// of the theme toggle. Do NOT recreate this file in a later feature.
//
// HEADER ICON ORDER (left to right): push prompt, compose, bell, theme, profile.
// The push prompt sits leftmost because it is TEMPORARY - it removes itself for
// good once the user answers - leaving the permanent order compose, bell, theme,
// profile. Compose stays left of the bell so the bell remains immediately LEFT
// of the profile icon, which is what the Feature 11 note below requires.

import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import BellMenu from "@/components/notifications/BellMenu";
import ComposeButton from "@/components/notifications/ComposeButton";
import PushSetup from "@/components/notifications/PushSetup";
import { getActiveSession } from "@/lib/guard";

export const metadata = {
  title: "Greenwood School",
  description: "Greenwood High School portal",

  // PWA. Next.js turns this into <link rel="manifest" href="/manifest.json">.
  // Do not hand-write that tag - declaring it here keeps it in one place and
  // out of the <head> markup.
  manifest: "/manifest.json",

  // iOS DOES NOT READ THE MANIFEST for the home-screen icon or for hiding the
  // address bar. Safari needs its own two hints, or an iPhone parent who adds
  // the app to their home screen gets a blurry screenshot thumbnail instead of
  // the school logo, inside a normal browser window.
  appleWebApp: {
    capable: true,
    title: "Greenwood",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icon-512.png",
  },
};

// The hardcoded hex here is the documented exception to the "never hardcode a
// colour" rule in app/globals.css. The phone paints its status bar from this
// value before any CSS exists, so a variable is impossible. IT MUST STAY
// IDENTICAL to "theme_color" and "background_color" in public/manifest.json,
// otherwise the status bar is a slightly different shade from the app.
export const viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

// Runs before the browser paints anything, so a light-theme user never
// sees a dark flash (and vice versa). Must stay tiny and synchronous.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

// WHY THIS LAYOUT IS async
//   The bell must not appear on /login, /first-login or /forgot-password -
//   there is nobody to notify yet, and rendering it there would fire a 401 on
//   every visit. getActiveSession() answers "is somebody signed in" on the
//   server, so signed-out pages ship no bell at all.
//
//   The same session gives us the ROLE, which is how the compose button knows
//   whether to draw itself. No extra query.
//
//   The push prompt is gated the same way, for a stronger reason: a push
//   subscription is stored against a profile id, so asking permission before
//   sign-in would produce a subscription belonging to nobody.
//
//   COST: getActiveSession() is wrapped in React cache(), so the layout and
//   the page below it share ONE database round trip per request, not two. On
//   signed-out pages there is no cookie, so it returns null without touching
//   PostgreSQL at all.
//
//   SIDE EFFECT: reading cookies makes every route dynamic. /login and friends
//   now build as `ƒ` instead of `○`. That is expected, not a regression.
export default async function RootLayout({ children }) {
  const active = await getActiveSession();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="label-micro">GREENWOOD / PORTAL</span>

          <div className="flex items-center gap-2">
            {active ? <PushSetup /> : null}
            {active ? <ComposeButton role={active.profile.role} /> : null}
            {active ? <BellMenu /> : null}
            <ThemeToggle />
            {/* Feature 11: mount <ProfileIcon/> HERE, to the RIGHT of the
                theme toggle, so the bell stays to the LEFT of the profile. */}
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}