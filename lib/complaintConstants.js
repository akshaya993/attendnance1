// lib/complaintConstants.js
// SHARED BY THE BROWSER AND THE SERVER. Zero imports on purpose - a client
// component may never import anything that reaches the database (the same
// rule lib/notificationConstants.js follows). The complaint form and the
// complaint routes must agree on these limits, so they live here exactly once.

export const SUBJECT_MAX = 150;
export const DESCRIPTION_MAX = 5000;
export const REPLY_MAX = 5000;
export const COPILOT_NOTES_MAX = 2000;

/** The three legal statuses, matching the CHECK constraint in the schema. */
export const COMPLAINT_STATUSES = ["unread", "read", "resolved"];

/** Human labels for the chips (the database words, in friendly casing). */
export const STATUS_LABELS = {
	unread: "Pending",
	read: "Read",
	resolved: "Resolved",
};
