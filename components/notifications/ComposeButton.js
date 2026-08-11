// components/notifications/ComposeButton.js
// The "+" in the top bar that opens the Broadcast Center.
//
// NOT a client component on purpose. It is a link and an SVG - there is no
// state, no click handler, nothing to hydrate. Shipping it as a server
// component keeps it out of the browser JavaScript bundle entirely.
//
// WHO SEES IT: admins and teachers. Parents and bus staff get nothing at all,
// because they cannot send. That decision is NOT re-written here - it reuses
// canUseAudience() from lib/notificationConstants.js, the exact same function
// the form and lib/notify.js call. One rule, one place. If the school ever
// lets, say, the office clerk broadcast, that function changes and this button
// follows automatically.
//
// HIDING IT IS NOT SECURITY. Anyone can type /admin/broadcast into the address
// bar. proxy.js (ROLE_PREFIXES) is what actually blocks them, and lib/notify.js
// is what refuses a teacher sending school-wide. This is only tidiness.
//
// STYLING: uses the shared .icon-button class in app/globals.css - the same
// 44px square as the bell, the theme switch and the alerts prompt. Restyle the
// header once, there, and all four follow. Nothing to keep in sync by hand.

import Link from "next/link";
import { canUseAudience } from "@/lib/notificationConstants";

// Each role composes from inside its own role-prefixed area so proxy.js can
// keep guarding it. There is no shared /broadcast route.
const COMPOSE_HREF = {
  admin: "/admin/broadcast",
  teacher: "/teacher/broadcast",
};

export default function ComposeButton({ role }) {
  // "classes" is the narrowest audience that exists. Anyone who cannot send
  // even to a single class cannot send at all, so they get no button.
  if (!canUseAudience(role, "classes")) return null;

  const href = COMPOSE_HREF[role];
  if (!href) return null;

  return (
    <Link
      href={href}
      aria-label="Send a notification"
      title="Send a notification"
      className="icon-button"
    >
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
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}