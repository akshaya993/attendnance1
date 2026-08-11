"use client";

// components/notifications/NotificationItem.js
// One row inside the bell panel. Presentational only - it owns no data and
// no fetching. BellMenu passes the row in and passes a callback back out.
//
// TWO VISUAL AXES THAT MUST NEVER SHARE A COLOUR (see db/migrations/003):
//
//   priority -> "how urgent"     grey (line) / amber (warn) / red (danger)
//   kind     -> "what type"      green (ok) for reminder, muted for notice
//
// The first version of this file painted the reminder icon amber, which is
// the "important priority" colour. Two meanings, one colour - the panel
// became unreadable. Green is used for kind precisely because the priority
// axis never uses it. Do not "tidy" these into the same palette.
//
// Colour is also never the ONLY signal: every non-standard priority prints
// its word in a pill, and every kind prints its word in a label. Roughly 1
// man in 12 cannot separate the amber from the red.
//
// NEVER hardcode a hex value here (rule 1 of the UI context doc). Every
// colour below is an existing token from app/globals.css.

/**
 * Left accent stripe colour, keyed by priority.
 * Keys must match the notifications_priority_check constraint exactly.
 */
const PRIORITY_STRIPE = {
	standard: "bg-line",
	important: "bg-warn",
	urgent: "bg-danger",
};

/**
 * Pill printed next to the kind label. 'standard' deliberately has none -
 * most rows are standard, and a pill on every row would be noise.
 */
const PRIORITY_PILL = {
	standard: null,
	important: { label: "Important", className: "bg-warn-soft text-warn" },
	urgent: { label: "Urgent", className: "bg-danger-soft text-danger" },
};

/**
 * Kind styling. Keys must match the notifications_kind_check constraint.
 *
 * The database stores 'notice' but people read "Notification". That mismatch
 * is intentional and documented in migration 003: the column names the
 * question, the UI names the answer in human words.
 */
const KIND_STYLE = {
	notice: {
		label: "NOTIFICATION",
		tone: "text-muted",
		chip: "",
	},
	reminder: {
		label: "REMINDER",
		tone: "text-ok",
		chip: "rounded bg-ok-soft px-1.5 py-[3px]",
	},
};

/**
 * Human-friendly age of a notification.
 *
 * Deliberately hand-written rather than pulling in date-fns or dayjs: this is
 * about 12 lines and adding a dependency for it would breach the approved
 * package list in the code standards doc.
 *
 * Safe from hydration mismatches because this component only ever renders on
 * the client - the rows arrive from fetch(), never from the server render.
 *
 * @param {string|Date} value - createdAt from the API
 * @returns {string}
 */
function relativeTime(value) {
	const then = new Date(value).getTime();
	const seconds = Math.round((Date.now() - then) / 1000);

	if (seconds < 60) return "just now";

	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d ago`;

	return new Date(value).toLocaleDateString("en-IN", {
		day: "numeric",
		month: "short",
	});
}

/** Megaphone - a notice. Something that happened. */
function NoticeIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
			stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
			strokeLinejoin="round" aria-hidden="true">
			<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" />
			<path d="M16 8a5 5 0 0 1 0 8" />
		</svg>
	);
}

/** Clock - a reminder. Something you must do. */
function ReminderIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
			stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
			strokeLinejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</svg>
	);
}

/**
 * @param {object}   props
 * @param {object}   props.item       - one row from GET /api/notifications
 * @param {Function} props.onMarkRead - called with the id when the row is opened
 */
export default function NotificationItem({ item, onMarkRead }) {
	const stripe = PRIORITY_STRIPE[item.priority] ?? PRIORITY_STRIPE.standard;
	const pill = PRIORITY_PILL[item.priority] ?? null;
	const kind = KIND_STYLE[item.kind] ?? KIND_STYLE.notice;
	const isReminder = item.kind === "reminder";

	// Gmail behaviour, as agreed: a read row STAYS in the list and greys out.
	// There is no separate history tab.
	const unread = !item.isRead;

	function handleActivate() {
		if (unread) onMarkRead(item.id);
		if (item.linkUrl) window.location.href = item.linkUrl;
	}

	function handleKeyDown(event) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleActivate();
		}
	}

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={handleActivate}
			onKeyDown={handleKeyDown}
			className={`flex w-full gap-0 border-b border-soft text-left transition-colors duration-150 ${
				unread ? "bg-raised" : "bg-transparent"
			} hover:bg-raised`}
		>
			{/* Priority stripe. 3px wide, full height of the row. */}
			<span className={`w-[3px] shrink-0 ${stripe}`} aria-hidden="true" />

			<div className="min-w-0 flex-1 px-3.5 py-3">
				<div className="flex flex-wrap items-center gap-1.5">
					{/* KIND: icon + label, together in one chip so they read as
					    a single unit and never get separated by wrapping. */}
					<span
						className={`inline-flex items-center gap-1 ${kind.tone} ${kind.chip}`}
					>
						{isReminder ? <ReminderIcon /> : <NoticeIcon />}
						<span
							className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
						>
							{kind.label}
						</span>
					</span>

					{/* PRIORITY: the word, not just the stripe colour. */}
					{pill && <span className={`pill ${pill.className}`}>{pill.label}</span>}

					{/* Unread dot sits at the far right so the eye can scan one column. */}
					{unread && (
						<span
							className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
							aria-label="Unread"
						/>
					)}
				</div>

				<p
					className={`mt-1.5 text-sm leading-snug ${
						unread ? "font-semibold text-body" : "font-normal text-muted"
					}`}
				>
					{item.title}
				</p>

				<p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">
					{item.body}
				</p>

				<p className="label-micro mt-2">{relativeTime(item.createdAt)}</p>
			</div>
		</div>
	);
}