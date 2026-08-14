// components/attendance/ClassPicker.js
// The grid of class cards a teacher picks from before marking attendance.
//
// NOT a client component on purpose: it is a grid of links - no state, no
// handlers, nothing to hydrate. Each card is a plain <Link> carrying
// ?classId=<id>; the page re-renders on the server with that class loaded.
//
// Reused by the admin dashboard too (the cards there link to the drill-down
// page) - the basePath prop is the only difference.
//
// No hex values: every colour is a token from app/globals.css (UI rule 1).

import Link from "next/link";

/**
 * @param {object} props
 * @param {Array<{id:number, classNumber:number, section:string}>} props.classes
 * @param {string} props.basePath  e.g. "/teacher/attendance" - "?classId=" is appended
 */
export default function ClassPicker({ classes, basePath }) {
	if (!classes || classes.length === 0) {
		return (
			<div className="card mt-8 p-6">
				<p className="label-micro text-muted">CLASSES</p>
				<p className="mt-3 text-sm text-muted">No classes found.</p>
			</div>
		);
	}

	return (
		<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
			{classes.map((cls) => (
				<Link
					key={cls.id}
					href={`${basePath}?classId=${cls.id}`}
					className="card flex min-h-[76px] flex-col justify-center p-4 transition-colors duration-150 hover:bg-raised"
				>
					<span className="label-micro text-muted">CLASS</span>
					<span className="mt-1 text-xl">
						{cls.classNumber} {cls.section}
					</span>
				</Link>
			))}
		</div>
	);
}
