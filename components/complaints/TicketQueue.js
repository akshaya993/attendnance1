"use client";

// components/complaints/TicketQueue.js
// The admin's complaints inbox: queue on the left, the open ticket on the
// right (stacked full-screen on phones - the office mostly uses a desktop).
//
// QUEUE MECHANICS: unread tickets sit on top in bold, newest first; opening
// one marks it 'read' on the server and it settles into the read section.
// Resolved tickets sink to the bottom, greyed. The flag icon is the admin's
// personal "needs attention" marker, with a "flagged only" filter on top.
//
// LIFECYCLE (owner's rules): reply != resolved. Sending a reply keeps the
// ticket open. "Mark Resolved" only works after a reply exists, and the
// button says so when it's disabled. Resolved is final - no reopen.
//
// THE AI COPILOT NEVER SENDS. "AI Draft" fills the reply box with a polished
// draft; the admin reads, edits, and only then presses Send Reply. When no AI
// provider is configured, the button shows the server's polite 503 reason.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateIst } from "@/lib/format";

const STATUS_CHIP = {
	unread: "bg-warn-soft text-warn",
	read: "bg-raised text-muted",
	resolved: "bg-ok-soft text-ok",
};
const STATUS_LABEL = { unread: "Pending", read: "Read", resolved: "Resolved" };

export default function TicketQueue() {
	const [queue, setQueue] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState("");
	const [flaggedOnly, setFlaggedOnly] = useState(false);

	// The open ticket
	const [activeId, setActiveId] = useState(null);
	const [active, setActive] = useState(null); // { complaint, children }
	const [children, setChildren] = useState([]);
	const [profileOpen, setProfileOpen] = useState(false);

	// Reply box
	const [replyText, setReplyText] = useState("");
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState("");
	const [aiBusy, setAiBusy] = useState(false);
	const [aiNote, setAiNote] = useState("");

	const aliveRef = useRef(true);
	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, []);

	/** Load the queue (optionally flagged-only). */
	const loadQueue = useCallback(async (flagged) => {
		try {
			const url = flagged ? "/api/complaints?flagged=1" : "/api/complaints";
			const res = await fetch(url);
			const payload = await res.json().catch(() => null);
			if (!aliveRef.current) return;
			if (!res.ok || !payload?.ok) {
				setLoadError(payload?.error || "Could not load complaints.");
				return;
			}
			setQueue(payload.data.complaints);
			setLoadError("");
		} catch {
			if (aliveRef.current) setLoadError("Cannot reach the server.");
		} finally {
			if (aliveRef.current) setLoading(false);
		}
	}, []);

	useEffect(() => {
		// Initial load and filter changes. The zero-timeout defers the fetch
		// out of the effect's synchronous body - React's lint rules forbid
		// calling a state-setting function synchronously inside an effect.
		const timer = setTimeout(() => {
			loadQueue(flaggedOnly);
		}, 0);
		return () => clearTimeout(timer);
	}, [flaggedOnly, loadQueue]);

	/** Open a ticket: fetch its detail, and mark it read if it was unread. */
	async function openTicket(item) {
		setActiveId(item.id);
		setActive(null);
		setChildren([]);
		setProfileOpen(false);
		setReplyText(item.adminReply ?? "");
		setActionError("");
		setAiNote("");

		try {
			const res = await fetch(`/api/complaints/${item.id}`);
			const payload = await res.json().catch(() => null);
			if (!aliveRef.current) return;
			if (res.ok && payload?.ok) {
				setActive(payload.data.complaint);
				setChildren(payload.data.children);
			}
		} catch {
			// The detail pane shows a soft empty state; the queue still works.
		}

		if (item.status === "unread") {
			// Opening IS the acknowledgement. Optimistic local update, server
			// PATCH behind it; a failed PATCH just means the next reload shows
			// the truth.
			setQueue((current) =>
				current.map((row) =>
					row.id === item.id ? { ...row, status: "read" } : row
				)
			);
			setActive((current) =>
				current && current.id === item.id
					? { ...current, status: "read" }
					: current
			);
			fetch(`/api/complaints/${item.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "read" }),
			}).catch(() => {});
		}
	}

	/** One PATCH action against the active ticket, then resync. */
	async function patchActive(action, extra = {}) {
		if (!activeId || busy) return;
		setBusy(true);
		setActionError("");
		try {
			const res = await fetch(`/api/complaints/${activeId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action, ...extra }),
			});
			const payload = await res.json().catch(() => null);
			if (!aliveRef.current) return;
			if (!res.ok || !payload?.ok) {
				setActionError(payload?.error || "Something went wrong.");
				return;
			}
			await loadQueue(flaggedOnly);
			// Resync the open ticket with the server's truth.
			const detailRes = await fetch(`/api/complaints/${activeId}`);
			const detail = await detailRes.json().catch(() => null);
			if (aliveRef.current && detailRes.ok && detail?.ok) {
				setActive(detail.data.complaint);
				setReplyText(detail.data.complaint.adminReply ?? "");
			}
		} catch {
			if (aliveRef.current) setActionError("Cannot reach the server.");
		} finally {
			if (aliveRef.current) setBusy(false);
		}
	}

	async function handleAiDraft() {
		if (aiBusy) return;
		setAiBusy(true);
		setAiNote("");
		try {
			const res = await fetch("/api/complaints/copilot", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					notes: replyText,
					complaintId: activeId,
				}),
			});
			const payload = await res.json().catch(() => null);
			if (!aliveRef.current) return;
			if (!res.ok || !payload?.ok) {
				setAiNote(payload?.error || "AI drafting is unavailable right now.");
				return;
			}
			setReplyText(payload.data.draft);
		} catch {
			if (aliveRef.current) setAiNote("AI drafting is unavailable right now.");
		} finally {
			if (aliveRef.current) setAiBusy(false);
		}
	}

	async function handleFlag(event, item) {
		event.stopPropagation();
		// Optimistic flip; the server's response carries the real value.
		const next = !item.isFlagged;
		setQueue((current) =>
			current.map((row) =>
				row.id === item.id ? { ...row, isFlagged: next } : row
			)
		);
		try {
			const res = await fetch(`/api/complaints/${item.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "flag" }),
			});
			const payload = await res.json().catch(() => null);
			if (!aliveRef.current || !res.ok || !payload?.ok) return;
			const real = payload.data.isFlagged;
			setQueue((current) => {
				const updated = current.map((row) =>
					row.id === item.id ? { ...row, isFlagged: real } : row
				);
				// Inside the "flagged only" filter, an unflagged ticket leaves.
				return flaggedOnly && !real
					? updated.filter((row) => row.id !== item.id)
					: updated;
			});
		} catch {
			// A lost flag flip self-corrects on the next load.
		}
	}

	// -------------------------------------------------- render --------------------------------------------------

	if (loading) {
		return <p className="label-micro mt-8 text-muted">LOADING COMPLAINTS</p>;
	}
	if (loadError) {
		return (
			<div className="card mt-8 p-6">
				<p className="text-sm text-danger">{loadError}</p>
			</div>
		);
	}

	const queueList = (
		<div className="card overflow-hidden p-0">
			{/* Filter row */}
			<div className="flex items-center justify-between border-b border-line px-4 py-2.5">
				<span className="label-micro text-muted">
					{queue.length} {queue.length === 1 ? "ticket" : "tickets"}
				</span>
				<button
					type="button"
					onClick={() => {
						setLoading(true);
						setFlaggedOnly((v) => !v);
					}}
					aria-pressed={flaggedOnly}
					className={`label-micro rounded-md px-2 py-1.5 transition-colors duration-150 ${
						flaggedOnly ? "bg-raised text-body" : "text-muted hover:text-body"
					}`}
				>
					Flagged only
				</button>
			</div>

			{queue.length === 0 ? (
				<p className="px-4 py-8 text-center text-sm text-muted">
					{flaggedOnly ? "No flagged tickets." : "No complaints. Quiet day."}
				</p>
			) : (
				queue.map((item) => {
					const isActive = item.id === activeId;
					return (
						<div
							key={item.id}
							role="button"
							tabIndex={0}
							onClick={() => openTicket(item)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									openTicket(item);
								}
							}}
							className={`flex w-full cursor-pointer items-start gap-3 border-b border-soft px-4 py-3.5 text-left transition-colors duration-150 last:border-b-0 ${
								isActive ? "bg-raised" : "hover:bg-raised"
							} ${item.status === "resolved" ? "opacity-60" : ""}`}
						>
							<div className="min-w-0 flex-1">
								<p
									className={`truncate text-sm ${
										item.status === "unread"
											? "font-semibold text-body"
											: "text-muted"
									}`}
								>
									{item.subject}
								</p>
								<p className="label-micro mt-1 text-muted">
									{item.parentName} · {formatDateIst(item.createdAt)} ·{" "}
									{STATUS_LABEL[item.status] ?? item.status}
								</p>
							</div>
							<button
								type="button"
								onClick={(event) => handleFlag(event, item)}
								aria-label={item.isFlagged ? "Unflag" : "Flag"}
								aria-pressed={item.isFlagged}
								className={`shrink-0 rounded-md p-2 transition-colors duration-150 ${
									item.isFlagged ? "text-warn" : "text-muted hover:text-body"
								}`}
							>
								<svg width="14" height="14" viewBox="0 0 24 24"
									fill={item.isFlagged ? "currentColor" : "none"}
									stroke="currentColor" strokeWidth="1.8"
									strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
									<line x1="4" y1="22" x2="4" y2="15" />
								</svg>
							</button>
						</div>
					);
				})
			)}
		</div>
	);

	const detail = (
		<div className="card p-6">
			{!activeId ? (
				<p className="py-10 text-center text-sm text-muted">
					Select a ticket to read it.
				</p>
			) : !active ? (
				<p className="label-micro py-10 text-center text-muted">LOADING</p>
			) : (
				<>
					{/* header */}
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="text-lg font-medium">{active.subject}</p>
							<p className="label-micro mt-1 text-muted">
								{active.parentName} · {formatDateIst(active.createdAt)} ·{" "}
								{STATUS_LABEL[active.status] ?? active.status}
							</p>
						</div>
						<div className="relative">
							<button
								type="button"
								onClick={() => setProfileOpen((v) => !v)}
								className="label-micro rounded-lg border border-line bg-raised px-3 py-2 text-muted transition-colors duration-150 hover:text-body"
							>
								View profile
							</button>
							{profileOpen ? (
								<div className="card absolute right-0 top-full z-50 mt-2 w-72 p-4 text-left">
									<p className="label-micro text-muted">PARENT</p>
									<p className="mt-1.5 text-sm">{active.parentName}</p>
									<p className="text-sm text-muted">{active.parentPhone}</p>
									{active.parentEmail ? (
										<p className="text-sm text-muted">{active.parentEmail}</p>
									) : null}
									<p className="label-micro mt-3 text-muted">CHILDREN</p>
									{children.length === 0 ? (
										<p className="mt-1.5 text-sm text-muted">None linked.</p>
									) : (
										children.map((child) => (
											<p key={child.id} className="mt-1.5 text-sm">
												{child.fullName}{" "}
												<span className="text-muted">
													(Class {child.classNumber} {child.section})
												</span>
											</p>
										))
									)}
								</div>
							) : null}
						</div>
					</div>

					{/* body */}
					<p className="mt-4 whitespace-pre-wrap text-sm">{active.description}</p>

					{/* existing reply */}
					{active.adminReply ? (
						<div className="mt-5 rounded-lg border-l-[3px] border-l-ok bg-raised px-4 py-3">
							<p className="label-micro text-ok">
								REPLIED{active.repliedByName ? ` BY ${active.repliedByName.toUpperCase()}` : ""}
							</p>
							<p className="mt-1.5 whitespace-pre-wrap text-sm">{active.adminReply}</p>
						</div>
					) : null}

					{/* reply box - hidden once resolved (resolved is final) */}
					{active.status !== "resolved" ? (
						<div className="mt-6 border-t border-line pt-4">
							<label className="block">
								<span className="label-micro text-muted">REPLY TO PARENT</span>
								<textarea
									value={replyText}
									rows={4}
									onChange={(event) => setReplyText(event.target.value)}
									placeholder="Write the reply, or rough notes and let the AI polish them."
									disabled={busy || aiBusy}
									className="field mt-2 w-full resize-y"
								/>
							</label>

							{aiNote ? (
								<p role="status" className="mt-2 text-sm text-warn">
									{aiNote}
								</p>
							) : null}
							{actionError ? (
								<p role="alert" className="mt-2 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
									{actionError}
								</p>
							) : null}

							<div className="mt-4 flex flex-wrap gap-3">
								<button
									type="button"
									onClick={() => patchActive("reply", { text: replyText })}
									disabled={busy || aiBusy || replyText.trim().length === 0}
									className="cta"
								>
									{busy ? "Sending..." : "Send reply"}
								</button>
								<button
									type="button"
									onClick={handleAiDraft}
									disabled={busy || aiBusy || replyText.trim().length === 0}
									className="rounded-lg border border-line bg-raised px-4 py-2.5 text-sm text-muted transition-colors duration-150 hover:text-body"
								>
									{aiBusy ? "Drafting..." : "AI draft solution"}
								</button>
								<button
									type="button"
									onClick={() => patchActive("resolve")}
									disabled={busy || aiBusy || !active.adminReply}
									title={
										active.adminReply
											? "Close this complaint"
											: "Send a reply first - the parent deserves an answer before closure"
									}
									className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors duration-150 enabled:hover:text-body disabled:opacity-40"
								>
									Mark resolved
								</button>
							</div>
							{!active.adminReply ? (
								<p className="label-micro mt-2 text-muted">
									A reply is required before resolving
								</p>
							) : null}
						</div>
					) : (
						<p className="label-micro mt-6 border-t border-line pt-4 text-ok">
							RESOLVED - this ticket is closed and cannot be reopened
						</p>
					)}
				</>
			)}
		</div>
	);

	return (
		<div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,2fr)_3fr]">
			{/* On phones the detail replaces the list once a ticket is open. */}
			<div className={activeId ? "hidden lg:block" : ""}>{queueList}</div>
			<div className={activeId ? "" : "hidden lg:block"}>
				{activeId ? (
					<button
						type="button"
						onClick={() => setActiveId(null)}
						className="label-micro mb-3 inline-flex min-h-11 items-center gap-2 px-2 text-muted hover:text-body lg:hidden"
					>
						&larr; Back to the queue
					</button>
				) : null}
				{detail}
			</div>
		</div>
	);
}
