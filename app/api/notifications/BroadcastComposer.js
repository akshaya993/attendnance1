"use client";

// components/notifications/BroadcastComposer.js
// The form an admin or a teacher fills in to send a notification.
//
// ONE COMPONENT, TWO PAGES. /admin/broadcast and /teacher/broadcast both
// render this file and pass the signed-in person's role. The role decides
// which audience options are DRAWN - it does not decide what is ALLOWED.
// Permission is enforced by canUseAudience() on the server, in lib/notify.js.
// Both sides call the SAME function from lib/notificationConstants.js, so the
// rule physically cannot drift apart.
//
// THE LIVE PREVIEW REUSES NotificationItem.js on purpose. It is not a copy of
// the bell row - it IS the bell row, fed a fake unsaved notification. What you
// see while typing is guaranteed to be what recipients actually get.
//
// NEVER hardcode a hex value here (context/ui-context.md rule 1).

import { useEffect, useMemo, useState } from "react";
import {
	AUDIENCE_OPTIONS,
	CLASS_AUDIENCE_OPTIONS,
	PRIORITY_OPTIONS,
	KIND_OPTIONS,
	TITLE_MAX,
	BODY_MAX,
	canUseAudience,
} from "@/lib/notificationConstants";
import NotificationItem from "@/components/notifications/NotificationItem";

export default function BroadcastComposer({ role }) {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [kind, setKind] = useState("notice");
	const [priority, setPriority] = useState("standard");

	// Defaults to 'classes' even for an admin. Making the widest possible
	// audience the default would be one mis-click away from messaging 423
	// people, so school-wide is always a deliberate choice.
	const [audience, setAudience] = useState("classes");
	const [classAudience, setClassAudience] = useState("both");
	const [classIds, setClassIds] = useState([]);

	const [classes, setClasses] = useState([]);
	const [loadingClasses, setLoadingClasses] = useState(true);

	const [previewCount, setPreviewCount] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const [sentCount, setSentCount] = useState(null);

	// Load the class list once. Reuses the EXISTING /api/classes route from
	// Feature 13, which already allows both admin and teacher and already
	// scopes to the caller's own branch. No new endpoint needed.
	useEffect(() => {
		let alive = true;

		async function loadClasses() {
			try {
				const response = await fetch("/api/classes");
				const json = await response.json();
				if (!alive) return;
				if (json.ok) setClasses(json.data);
			} catch {
				// Silent: the class picker just stays empty and the form
				// blocks submission. No need to shout at the user.
			} finally {
				if (alive) setLoadingClasses(false);
			}
		}

		loadClasses();
		return () => {
			alive = false;
		};
	}, []);

	// Only the audiences this role may actually use. Teachers never see the
	// school-wide options at all.
	const visibleAudiences = useMemo(
		() => AUDIENCE_OPTIONS.filter((option) => canUseAudience(role, option.value)),
		[role]
	);

	// Group 1A, 1B, 2A... into rows by class number, for a compact picker.
	const groupedClasses = useMemo(() => {
		const map = new Map();
		for (const cls of classes) {
			const key = cls.class_number;
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(cls);
		}
		return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
	}, [classes]);

	const needsClasses = audience === "classes";
	const canSubmit =
		title.trim().length > 0 &&
		body.trim().length > 0 &&
		title.length <= TITLE_MAX &&
		body.length <= BODY_MAX &&
		(!needsClasses || classIds.length > 0) &&
		!sending;

	function toggleClass(id) {
		setClassIds((previous) =>
			previous.includes(id)
				? previous.filter((value) => value !== id)
				: [...previous, id]
		);
	}

	function toggleWholeGrade(group) {
		const ids = group.map((cls) => cls.id);
		const allSelected = ids.every((id) => classIds.includes(id));
		setClassIds((previous) =>
			allSelected
				? previous.filter((id) => !ids.includes(id))
				: Array.from(new Set([...previous, ...ids]))
		);
	}

	/** Step 1: ask the server how many people this would reach. */
	async function handleReview() {
		setError("");
		setSending(true);
		try {
			const params = new URLSearchParams({
				preview_audience: audience,
				class_audience: classAudience,
			});
			if (classIds.length > 0) params.set("class_ids", classIds.join(","));

			const response = await fetch(`/api/notifications/broadcast?${params}`);
			const json = await response.json();

			if (!json.ok) {
				setError(json.error);
				return;
			}
			if (json.data.count === 0) {
				setError("Nobody matches that audience. Check your selection.");
				return;
			}

			setPreviewCount(json.data.count);
			setConfirming(true);
		} catch {
			setError("Could not reach the server. Check your connection.");
		} finally {
			setSending(false);
		}
	}

	/** Step 2: actually send. */
	async function handleSend() {
		setError("");
		setSending(true);
		try {
			const response = await fetch("/api/notifications/broadcast", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: title.trim(),
					body: body.trim(),
					kind,
					priority,
					audience,
					classIds,
					classAudience,
				}),
			});
			const json = await response.json();

			if (!json.ok) {
				setError(json.error);
				setConfirming(false);
				return;
			}

			setSentCount(json.data.recipientCount);
			setConfirming(false);
			setTitle("");
			setBody("");
			setClassIds([]);
			setPriority("standard");
			setKind("notice");
		} catch {
			setError("Could not reach the server. Nothing was sent.");
			setConfirming(false);
		} finally {
			setSending(false);
		}
	}

	// Fed to the real bell row component. id and isRead are placeholders -
	// nothing is saved until Send is confirmed.
	const previewItem = {
		id: "preview",
		title: title.trim() || "Your title appears here",
		body: body.trim() || "Your message appears here.",
		kind,
		priority,
		isRead: false,
		linkUrl: null,
		createdAt: new Date().toISOString(),
	};

	if (sentCount !== null) {
		return (
			<div className="card mt-8 p-6">
				<p className="label-micro text-ok">SENT</p>
				<p className="mt-3 text-lg">
					Delivered to {sentCount} {sentCount === 1 ? "person" : "people"}.
				</p>
				<p className="mt-2 text-sm text-muted">
					It is already visible in their bell.
				</p>
				<button
					type="button"
					className="cta mt-6"
					onClick={() => setSentCount(null)}
				>
					Send another
				</button>
			</div>
		);
	}

	return (
		<div className="mt-8 space-y-6">
			{/* ---------- MESSAGE ---------- */}
			<div className="card p-6">
				<p className="label-micro">MESSAGE</p>

				<label className="mt-4 block">
					<span className="text-sm text-muted">Title</span>
					<input
						type="text"
						value={title}
						maxLength={TITLE_MAX}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="School closed tomorrow"
						className="field mt-1.5 w-full"
					/>
					<span
						className={`label-micro mt-1 block text-right ${
							title.length > TITLE_MAX - 20 ? "text-warn" : ""
						}`}
					>
						{title.length} / {TITLE_MAX}
					</span>
				</label>

				<label className="mt-3 block">
					<span className="text-sm text-muted">Message</span>
					<textarea
						value={body}
						rows={4}
						maxLength={BODY_MAX}
						onChange={(event) => setBody(event.target.value)}
						placeholder="Heavy rainfall warning from the district office."
						className="field mt-1.5 w-full resize-y"
					/>
					<span
						className={`label-micro mt-1 block text-right ${
							body.length > BODY_MAX - 100 ? "text-warn" : ""
						}`}
					>
						{body.length} / {BODY_MAX}
					</span>
				</label>
			</div>

			{/* ---------- TYPE AND PRIORITY ---------- */}
			<div className="card p-6">
				<p className="label-micro">TYPE</p>
				<div className="mt-3 flex flex-wrap gap-2">
					{KIND_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setKind(option.value)}
							className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 ${
								kind === option.value
									? "border-line bg-raised text-body"
									: "border-soft text-muted hover:text-body"
							}`}
						>
							<span className="block font-medium">{option.label}</span>
							<span className="block text-[12px] text-muted">{option.hint}</span>
						</button>
					))}
				</div>

				<p className="label-micro mt-6">PRIORITY</p>
				<div className="mt-3 flex flex-wrap gap-2">
					{PRIORITY_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setPriority(option.value)}
							className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 ${
								priority === option.value
									? "border-line bg-raised text-body"
									: "border-soft text-muted hover:text-body"
							}`}
						>
							<span className="block font-medium">{option.label}</span>
							<span className="block text-[12px] text-muted">{option.hint}</span>
						</button>
					))}
				</div>

				{priority === "urgent" && (
					<p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
						Urgent will buzz every recipient&apos;s phone once push notifications
						are switched on. Use it only for genuine emergencies.
					</p>
				)}
			</div>

			{/* ---------- AUDIENCE ---------- */}
			<div className="card p-6">
				<p className="label-micro">SEND TO</p>

				<div className="mt-3 space-y-2">
					{visibleAudiences.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setAudience(option.value)}
							className={`block w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
								audience === option.value
									? "border-line bg-raised text-body"
									: "border-soft text-muted hover:text-body"
							}`}
						>
							<span className="block text-sm font-medium">{option.label}</span>
							<span className="block text-[12px] text-muted">{option.hint}</span>
						</button>
					))}
				</div>

				{role === "teacher" && (
					<p className="mt-3 text-[12px] text-muted">
						Teachers can message any class. School-wide messages are sent by the
						office.
					</p>
				)}

				{needsClasses && (
					<>
						<p className="label-micro mt-6">CLASSES</p>
						{loadingClasses ? (
							<p className="mt-3 text-sm text-muted">Loading classes...</p>
						) : (
							<div className="mt-3 space-y-2">
								{groupedClasses.map(([classNumber, group]) => (
									<div key={classNumber} className="flex flex-wrap items-center gap-2">
										<button
											type="button"
											onClick={() => toggleWholeGrade(group)}
											className="label-micro w-16 shrink-0 text-left hover:text-body"
										>
											CLASS {classNumber}
										</button>
										{group.map((cls) => (
											<button
												key={cls.id}
												type="button"
												onClick={() => toggleClass(cls.id)}
												className={`min-h-9 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150 ${
													classIds.includes(cls.id)
														? "border-line bg-raised text-body"
														: "border-soft text-muted hover:text-body"
												}`}
											>
												{cls.section}
											</button>
										))}
									</div>
								))}
							</div>
						)}

						<p className="label-micro mt-6">WITHIN THOSE CLASSES</p>
						<div className="mt-3 flex flex-wrap gap-2">
							{CLASS_AUDIENCE_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setClassAudience(option.value)}
									className={`rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ${
										classAudience === option.value
											? "border-line bg-raised text-body"
											: "border-soft text-muted hover:text-body"
									}`}
								>
									{option.label}
								</button>
							))}
						</div>

						{classIds.length > 0 && (
							<p className="mt-3 text-[12px] text-muted">
								{classIds.length} class{classIds.length === 1 ? "" : "es"} selected
							</p>
						)}
					</>
				)}
			</div>

			{/* ---------- PREVIEW ---------- */}
			<div className="card overflow-hidden p-0">
				<p className="label-micro px-6 pt-6">PREVIEW</p>
				<p className="px-6 pb-3 pt-1 text-[12px] text-muted">
					Exactly how it will look in their bell.
				</p>
				<div className="border-t border-line">
					<NotificationItem item={previewItem} onMarkRead={() => {}} />
				</div>
			</div>

			{/* ---------- ERRORS AND SEND ---------- */}
			{error && (
				<p
					role="alert"
					className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"
				>
					{error}
				</p>
			)}

			{confirming ? (
				<div className="card border-line p-6">
					<p className="label-micro text-warn">CONFIRM</p>
					<p className="mt-3 text-lg">
						Send to {previewCount} {previewCount === 1 ? "person" : "people"}?
					</p>
					<p className="mt-2 text-sm text-muted">
						This cannot be undone. It appears in their bell immediately.
					</p>
					<div className="mt-6 flex flex-wrap gap-3">
						<button
							type="button"
							className="cta"
							onClick={handleSend}
							disabled={sending}
						>
							{sending ? "Sending..." : "Yes, send it"}
						</button>
						<button
							type="button"
							className="min-h-11 px-4 text-sm text-muted hover:text-body"
							onClick={() => setConfirming(false)}
							disabled={sending}
						>
							Go back
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					className="cta w-full"
					onClick={handleReview}
					disabled={!canSubmit}
				>
					{sending ? "Checking..." : "Review and send"}
				</button>
			)}
		</div>
	);
}