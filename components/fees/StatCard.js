// components/fees/StatCard.js
// The fees module's analytics card: mono micro label on top, big serif amount,
// small muted caption, 3px left accent. A sibling of the attendance module's
// percentage card - deliberately a separate file because this one is about
// MONEY (rupee amounts) and can be CLICKABLE with a soft press animation.
//
// SOFT PRESS: `active:scale-[0.98]` + a 150ms transition - the exact
// "presses gently when tapped" feel the fees prompt asks for, done in pure
// CSS (the UI context forbids animation libraries).
//
// Server-safe: when `href` is present the whole card is a Link, no client
// JavaScript needed for navigation.

import Link from "next/link";

/**
 * @param {object} props
 * @param {string}  props.label     mono micro label, e.g. "TUITION FEE DUE"
 * @param {string}  props.amount    pre-formatted, e.g. "₹12,500.00"
 * @param {string}  [props.caption] small muted line under the amount
 * @param {string}  [props.href]    makes the whole card a link (soft press)
 * @param {"line"|"warn"|"danger"|"ok"} [props.tone]  left-accent colour
 */
export default function StatCard({ label, amount, caption, href, tone = "line" }) {
	const edgeClass = {
		line: "border-l-line",
		warn: "border-l-warn",
		danger: "border-l-danger",
		ok: "border-l-ok",
	}[tone] ?? "border-l-line";

	const inner = (
		<>
			<p className="label-micro text-muted">{label}</p>
			<p className="mt-2 text-2xl">{amount}</p>
			{caption ? (
				<p className="label-micro mt-2 text-muted">{caption}</p>
			) : null}
		</>
	);

	const className = `card block border-l-[3px] ${edgeClass} p-5 transition-all duration-150 ${
		href ? "hover:bg-raised active:scale-[0.98]" : ""
	}`;

	return href ? (
		<Link href={href} className={className}>
			{inner}
		</Link>
	) : (
		<div className={className}>{inner}</div>
	);
}
