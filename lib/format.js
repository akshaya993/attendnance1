// lib/format.js
// -----------------------------------------------------------------------------
// SHARED DISPLAY FORMATTING. Zero imports on purpose - this file is safe for
// BOTH server components and "use client" components (same reason
// lib/notificationConstants.js exists: a client component may never import
// anything that reaches the database).
//
// Money arrives from PostgreSQL as NUMERIC strings ("25500.00"). It is only
// ever CONVERTED TO A NUMBER HERE, at display time, for formatting - never for
// arithmetic. All money maths happens in SQL.
// -----------------------------------------------------------------------------

/** The four fee categories, in display order. Keys match the database CHECK. */
export const FEE_CATEGORIES = ["tuition", "bus", "books", "dress"];

export function feeCategoryLabel(category) {
	const labels = {
		tuition: "Tuition",
		bus: "Bus",
		books: "Books",
		dress: "Dress",
	};
	return labels[category] ?? category;
}

/**
 * "25500" / "25500.00" / 25500 -> "Rs 25,500.00" style Indian grouping with
 * the rupee symbol: "₹25,500.00". Owner's chosen format (04 feature Q&A).
 */
export function formatMoney(value) {
	const num = Number(value ?? 0);
	const safe = Number.isFinite(num) ? num : 0;
	return (
		"₹" +
		new Intl.NumberFormat("en-IN", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(safe)
	);
}

/** "13 Aug 2026" in IST, regardless of the server machine's timezone. */
export function formatDateIst(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("en-IN", {
		timeZone: "Asia/Kolkata",
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

/** "13 Aug 2026, 4:32 PM" in IST. */
export function formatDateTimeIst(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const datePart = new Intl.DateTimeFormat("en-IN", {
		timeZone: "Asia/Kolkata",
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
	const timePart = new Intl.DateTimeFormat("en-IN", {
		timeZone: "Asia/Kolkata",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(date);
	return `${datePart}, ${timePart}`;
}
