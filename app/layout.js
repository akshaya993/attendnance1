// app/layout.js
// App shell — created in Feature 13, made session-aware in Feature 09.
// Owns: <html data-theme>, page metadata, the top bar, the theme toggle,
// the compose button and the notification bell.
// Feature 11 mounts <ProfileIcon/> into the same <header> below, to the RIGHT
// of the theme toggle. Do NOT recreate this file in a later feature.
//
// HEADER ICON ORDER (left to right): compose, bell, theme, profile.
// Compose sits leftmost so the bell stays immediately LEFT of the profile
// icon, which is what the Feature 11 note below requires.

import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import BellMenu from "@/components/notifications/BellMenu";
import ComposeButton from "@/components/notifications/ComposeButton";
import { getActiveSession } from "@/lib/guard";

export const metadata = {
  title: "Greenwood School",
  description: "Greenwood High School portal",
};

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