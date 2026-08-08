// components/BackLink.js
// The "← BACK" link at the top of any sub-page.
//
// LIVES AT THE components/ ROOT, next to ThemeToggle.js, because it is not a
// notifications thing. Attendance, Fees, Marks and every other feature's
// sub-pages will import this same file. Do NOT write another back arrow.
//
// WHY A LINK AND NOT router.back()
//   router.back() would force this to be a client component, and worse, it
//   replays browser history. If the user arrived here straight from a push
//   notification or a typed URL, "back" could throw them out of the app
//   entirely, or bounce them to /login. An explicit href always lands on a
//   real page inside the portal. Predictable beats clever.
//
// TOUCH TARGET: the text is 10px (.label-micro), which is far too small to tap
// on a phone. min-h-11 forces the invisible hit area to 44px, per ui-context.
// The negative left margin cancels the padding so the text still lines up with
// the breadcrumb underneath it.

import Link from "next/link";

export default function BackLink({ href, label = "BACK" }) {
  return (
    <Link
      href={href}
      className="label-micro -ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-muted transition-colors duration-150 hover:text-body"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label}
    </Link>
  );
}