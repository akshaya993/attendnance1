"use client";

// components/attendance/StudentAttendanceList.js
// The tap-to-toggle marking sheet, shared by the teacher screen and the
// admin's edit screen.
//
// ONE TAP = ONE ABSENTEE. Every student starts "Present" (green); tapping the
// row flips them to "Absent" (red). Present students are never sent to the
// server - the payload is the absent list only.
//
// THREE MODES, driven by props (functions cannot be passed from server
// components, so the endpoint and payload shape arrive as plain strings):
//   teacher, first submission  -> POST /api/attendance/submit
//   teacher, the ONE edit      -> POST /api/attendance/modify
//   admin correction           -> POST /api/attendance/admin-summary { action: "override" }
//
// REVIEW MODE: when attendance was already submitted, the saved list renders
// read-only with an "Edit" button (teachers get exactly one; admins unlimited).
//
// After a successful save: router.refresh() re-runs the server page, so what
// is on screen is what is in the database - never a stale local copy.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentAttendanceList({
	classId,
	students,
	initialAbsentIds,
	submitted,
	canEdit,
	mode,
	markedByName,
	modifiedCount,
}) {
	const router = useRouter();
	const [absentIds, setAbsentIds] = useState(() => new Set(initialAbsentIds));
	const [editing, setEditing] = useState(!submitted);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [savedNote, setSavedNote] = useState("");

	const total = students.length;
	const absentCount = absentIds.size;
	const presentCount = total - absentCount;

	function toggle(studentId) {
		if (!editing || busy) return;
		setAbsentIds((current) => {
			const next = new Set(current);
			if (next.has(studentId)) next.delete(studentId);
			else next.add(studentId);
			return next;
		});
	}

	async function handleSave() {
		if (busy) return;
		setBusy(true);
		setError("");
		setSavedNote("");

		// The three modes differ only in WHERE the absent list is posted.
		const endpoint =
			mode === "admin"
				? "/api/attendance/admin-summary"
				: submitted
					? "/api/attendance/modify"
					: "/api/attendance/submit";
		const body =
			mode === "admin"
				? { action: "override", classId, absentStudentIds: [...absentIds] }
				: { classId, absentStudentIds: [...absentIds] };

		try {
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const payload = await res.json().catch(() => null);

			if (!res.ok || !payload?.ok) {
				setError(payload?.error || "Something went wrong. Please try again.");
				// A 409/403 means the saved state changed underneath us - pull the
				// server's truth so the screen matches the database.
				if (res.status === 409 || res.status === 403) router.refresh();
				return;
			}

			setEditing(false);
			setSavedNote(
				`Saved - ${absentCount} absent, ${presentCount} present.`
			);
			router.refresh();
		} catch {
			setError("Cannot reach the server. Check your connection and try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div>
			{/* ---------------- STATUS LINE ---------------- */}
			{submitted && !editing ? (
				<p className="label-micro text-muted">
					Submitted{markedByName ? ` by ${markedByName}` : ""}
					{modifiedCount > 0 ? " - edited once" : ""}
				</p>
			) : null}

			{savedNote ? (
				<p className="mt-3 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">
					{savedNote}
				</p>
			) : null}

			{error ? (
				<p
					role="alert"
					className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"
				>
					{error}
				</p>
			) : null}

			{/* ---------------- THE ROSTER ---------------- */}
			<div className="card mt-4 overflow-hidden p-0">
				{students.map((student) => {
					const absent = absentIds.has(student.id);
					const rowBody = (
						<>
							{/* 3px status edge on the left (UI context rule). */}
							<span
								className={`w-[3px] shrink-0 ${absent ? "bg-danger" : "bg-transparent"}`}
								aria-hidden="true"
							/>
							<span className="label-micro w-8 shrink-0 text-muted">
								{student.rollNumber}
							</span>
							<span className="min-w-0 flex-1 truncate text-sm">
								{student.fullName}
							</span>
							<span
								className={`pill shrink-0 ${
									absent
										? "bg-danger-soft text-danger"
										: "bg-ok-soft text-ok"
								}`}
							>
								{absent ? "Absent" : "Present"}
							</span>
						</>
					);

					return editing ? (
						<button
							key={student.id}
							type="button"
							onClick={() => toggle(student.id)}
							disabled={busy}
							aria-pressed={absent}
							className={`flex min-h-12 w-full items-center gap-3 border-b border-soft px-3.5 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${
								absent ? "bg-danger-soft" : "hover:bg-raised"
							}`}
						>
							{rowBody}
						</button>
					) : (
						<div
							key={student.id}
							className={`flex min-h-12 items-center gap-3 border-b border-soft px-3.5 py-2.5 last:border-b-0 ${
								absent ? "bg-danger-soft" : ""
							}`}
						>
							{rowBody}
						</div>
					);
				})}
			</div>

			{/* ---------------- ACTION BAR ---------------- */}
			{editing ? (
				<div className="sticky bottom-0 mt-4 rounded-xl border border-line bg-surface p-3">
					<button
						type="button"
						onClick={handleSave}
						disabled={busy}
						className="cta w-full"
					>
						{busy
							? "Saving..."
							: `${submitted || mode === "admin" ? "Save" : "Submit"} (${absentCount} absent / ${presentCount} present)`}
					</button>
					{mode !== "admin" && submitted ? (
						<p className="label-micro mt-2 text-center text-muted">
							Only one edit is allowed per day
						</p>
					) : null}
				</div>
			) : (
				<div className="mt-4">
					{canEdit || mode === "admin" ? (
						<button
							type="button"
							onClick={() => {
								setError("");
								setSavedNote("");
								setEditing(true);
							}}
							className="cta w-full"
						>
							{mode === "admin" ? "Admin edit" : "Edit (1 change allowed)"}
						</button>
					) : (
						<p className="label-micro text-center text-muted">
							Already edited once - contact the office for more changes
						</p>
					)}
				</div>
			)}
		</div>
	);
}
