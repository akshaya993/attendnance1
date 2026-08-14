"use client";

// components/complaints/ComplaintForm.js
// The parent's "raise a complaint" form: a subject line and a description.
// Deliberately text-only (no emoji picker, no file uploads, no rich text) -
// the prompt's choice: professional tone, light database.
//
// After a successful submit the form clears and router.refresh() re-runs the
// server page, so "My Past Complaints" below updates immediately with the new
// entry on top.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DESCRIPTION_MAX, SUBJECT_MAX } from "@/lib/complaintConstants";

export default function ComplaintForm() {
	const router = useRouter();
	const [subject, setSubject] = useState("");
	const [description, setDescription] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const canSubmit =
		subject.trim().length > 0 &&
		description.trim().length > 0 &&
		subject.length <= SUBJECT_MAX &&
		description.length <= DESCRIPTION_MAX &&
		!busy;

	async function handleSubmit(event) {
		event.preventDefault();
		if (!canSubmit) return;
		setBusy(true);
		setError("");
		setSent(false);

		try {
			const res = await fetch("/api/complaints", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					subject: subject.trim(),
					description: description.trim(),
				}),
			});
			const payload = await res.json().catch(() => null);

			if (!res.ok || !payload?.ok) {
				setError(payload?.error || "Something went wrong. Please try again.");
				return;
			}

			setSubject("");
			setDescription("");
			setSent(true);
			router.refresh();
		} catch {
			setError("Cannot reach the server. Check your connection and try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="card mt-4 p-6">
			<p className="label-micro">NEW COMPLAINT</p>

			{sent ? (
				<p className="mt-3 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">
					Complaint submitted. The office has been notified.
				</p>
			) : null}
			{error ? (
				<p role="alert" className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
					{error}
				</p>
			) : null}

			<label className="mt-4 block">
				<span className="text-sm text-muted">Subject</span>
				<input
					type="text"
					value={subject}
					maxLength={SUBJECT_MAX}
					onChange={(event) => setSubject(event.target.value)}
					placeholder="e.g. Bus running late this week"
					disabled={busy}
					className="field mt-1.5 w-full"
				/>
			</label>

			<label className="mt-4 block">
				<span className="text-sm text-muted">Description</span>
				<textarea
					value={description}
					rows={4}
					maxLength={DESCRIPTION_MAX}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Describe what happened, when, and anything the office should know."
					disabled={busy}
					className="field mt-1.5 w-full resize-y"
				/>
				<span className="label-micro mt-1 block text-right">
					{description.length} / {DESCRIPTION_MAX}
				</span>
			</label>

			<button type="submit" disabled={!canSubmit} className="cta mt-3 w-full">
				{busy ? "Submitting..." : "Submit complaint"}
			</button>
		</form>
	);
}
