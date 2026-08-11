// lib/notificationConstants.js
// SHARED BY THE BROWSER AND THE SERVER. This file must NEVER import anything -
// no database, no pg, no Node modules. The moment it imports lib/db.js, every
// client component that uses it will fail to build.
//
// WHY IT EXISTS: the broadcast form runs in the browser and lib/notify.js runs
// on the server, but they must agree exactly on the character limits and on
// who is allowed to send to whom. Two copies would eventually drift - the form
// would allow 150 characters while the server still rejected at 120.

export const PRIORITIES = ["standard", "important", "urgent"];
export const KINDS = ["notice", "reminder"];
export const AUDIENCES = ["all", "parents", "teachers", "classes"];
export const CLASS_AUDIENCES = ["parents", "teachers", "both"];

export const TITLE_MAX = 120;
export const BODY_MAX = 1000;

/**
 * WHO CAN SEND TO WHOM. This is the entire admin/teacher difference.
 *
 *   admin   - anything in the branch
 *   teacher - specific classes only, never the whole school
 *
 * Why teachers are capped: there are 20 teachers and 400 parents. One annoyed
 * teacher, or one stolen teacher password, must not be able to message the
 * entire school. Admins are few and every broadcast they send is audited.
 *
 * CALLED FROM TWO PLACES ON PURPOSE:
 *   - the form, to decide which options to DRAW  (convenience)
 *   - lib/notify.js, to decide whether to ACCEPT (the real boundary)
 * Hiding a radio button stops nobody - anyone can post directly from the
 * browser console. The server call is what actually protects you.
 */
export function canUseAudience(role, audience) {
  if (role === "admin") return true;
  if (role === "teacher") return audience === "classes";
  return false;
}

/** The audience radio buttons, in display order. */
export const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Users", hint: "Everyone with a login" },
  { value: "parents", label: "All Parents", hint: "Every parent in the school" },
  { value: "teachers", label: "All Teachers", hint: "Every teacher in the school" },
  { value: "classes", label: "Specific class(es)", hint: "Pick the classes below" },
];

/** The second choice, shown once specific classes are selected. */
export const CLASS_AUDIENCE_OPTIONS = [
  { value: "parents", label: "Parents only" },
  { value: "teachers", label: "Teachers only" },
  { value: "both", label: "Both" },
];

export const PRIORITY_OPTIONS = [
  { value: "standard", label: "Standard", hint: "Ordinary information" },
  { value: "important", label: "Important", hint: "Needs attention soon" },
  { value: "urgent", label: "Urgent", hint: "Buzzes phones, even when the app is closed" },,
];

export const KIND_OPTIONS = [
  { value: "notice", label: "Notification", hint: "Something that happened" },
  { value: "reminder", label: "Reminder", hint: "Something they must do" },
];