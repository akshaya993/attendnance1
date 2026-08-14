// components/attendance/AttendanceStatCard.js
// The big attendance-percentage card. Used on the parent screen (one child)
// and the admin screen (the whole school today).
//
// Follows the UI context's stat-card pattern: mono uppercase label on top,
// big serif number, thin progress bar, tiny muted caption, 3px left accent in
// the status colour.
//
// COLOUR THRESHOLDS (a deliberate, documented choice):
//   >= 90%  green  (ok)      - healthy
//   >= 75%  amber  (warn)    - slipping
//   <  75%  red    (danger)  - needs attention
//   null    muted            - no attendance recorded yet
//
// Presentational only: no state, no fetch. NOT a client component, so server
// pages can render it without shipping any JavaScript for it.

const TONES = {
	ok: { bar: "bg-ok", edge: "border-l-[3px] border-l-ok", text: "text-ok" },
	warn: { bar: "bg-warn", edge: "border-l-[3px] border-l-warn", text: "text-warn" },
	danger: { bar: "bg-danger", edge: "border-l-[3px] border-l-danger", text: "text-danger" },
	muted: { bar: "bg-line", edge: "border-l-[3px] border-l-line", text: "text-muted" },
};

function toneFor(percentage) {
	if (percentage === null || percentage === undefined) return "muted";
	if (percentage >= 90) return "ok";
	if (percentage >= 75) return "warn";
	return "danger";
}

/**
 * @param {object} props
 * @param {string} props.label          mono micro label, e.g. "THIS YEAR"
 * @param {number|null} props.percentage 0-100 with 1 decimal, or null = no data
 * @param {string} [props.caption]      small line under the number
 * @param {string} [props.emptyText]    shown instead of the number when null
 */
export default function AttendanceStatCard({
	label,
	percentage,
	caption,
	emptyText = "No attendance recorded yet",
}) {
	const tone = TONES[toneFor(percentage)];
	const hasValue = percentage !== null && percentage !== undefined;
	const width = hasValue ? Math.max(0, Math.min(100, percentage)) : 0;

	return (
		<div className={`card p-6 ${tone.edge}`}>
			<p className="label-micro text-muted">{label}</p>

			{hasValue ? (
				<>
					<p className="mt-3 text-4xl">
						{percentage}
						<span className="text-xl text-muted">%</span>
					</p>
					<div
						className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-raised"
						role="progressbar"
						aria-valuenow={percentage}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={label}
					>
						<div
							className={`h-full rounded-full ${tone.bar}`}
							style={{ width: `${width}%` }}
						/>
					</div>
				</>
			) : (
				<p className="mt-3 text-sm text-muted">{emptyText}</p>
			)}

			{caption ? (
				<p className="label-micro mt-3 text-muted">{caption}</p>
			) : null}
		</div>
	);
}
