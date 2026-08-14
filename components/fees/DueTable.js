// components/fees/DueTable.js
// -----------------------------------------------------------------------------
// THE ONE TABLE OF THE FEES MODULE. Class dues, unpaid students and today's
// transactions are all the same shape - columns + rows - so they share this
// file (the prompt's rule: do not build a table per page).
//
// CLICKABLE ROWS WITHOUT ANY CLIENT JAVASCRIPT: when a row has an href, every
// cell wraps its content in a block-level <Link> to the same target, so the
// whole row is clickable AND the HTML stays valid (an <a> can never be a
// direct child of <tr>). Keyboard- and right-click-friendly for free.
//
// Styling follows the UI context: mono uppercase column headers, soft row
// dividers, generous row height, mono right-aligned money column.
// -----------------------------------------------------------------------------

import Link from "next/link";

/**
 * @param {object} props
 * @param {Array<{key:string, label:string, align?:"left"|"right"}>} props.columns
 * @param {Array<object>} props.rows   plain objects; cells read by column key
 * @param {(row:object)=>string|undefined} [props.rowHref]  per-row link target
 * @param {string} [props.emptyText]   shown when there are no rows
 */
export default function DueTable({ columns, rows, rowHref, emptyText = "No records yet" }) {
	if (!rows || rows.length === 0) {
		return (
			<div className="card mt-3 p-6">
				<p className="text-sm text-muted">{emptyText}</p>
			</div>
		);
	}

	return (
		<div className="card mt-3 overflow-x-auto p-0">
			<table className="w-full min-w-[420px] border-collapse text-sm">
				<thead>
					<tr className="border-b border-line">
						{columns.map((col) => (
							<th
								key={col.key}
								className={`label-micro px-4 py-3 font-normal ${
									col.align === "right" ? "text-right" : "text-left"
								}`}
							>
								{col.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, index) => {
						const href = rowHref ? rowHref(row) : undefined;
						return (
							<tr
								key={row.id ?? index}
								className="border-b border-soft transition-colors duration-150 last:border-b-0 hover:bg-raised"
							>
								{columns.map((col) => {
									const alignClass =
										col.align === "right"
											? "text-right font-mono text-[13px]"
											: "text-left";
									return (
										<td key={col.key} className={`${alignClass} p-0`}>
											{href ? (
												<Link
													href={href}
													tabIndex={col.key === columns[0].key ? 0 : -1}
													className="block px-4 py-3 text-inherit no-underline"
												>
													{row[col.key]}
												</Link>
											) : (
												<span className="block px-4 py-3">{row[col.key]}</span>
											)}
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
