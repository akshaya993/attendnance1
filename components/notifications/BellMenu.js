"use client";

// components/notifications/BellMenu.js
// The bell in the shared header. Mounted ONCE in app/layout.js, so it appears
// on every page for every role automatically - admin, teacher, parent and bus.
// Do NOT mount a second copy inside a role page.
//
// OWNS: the unread badge, the 30-second poll, the slide-out panel, paging,
// and optimistic read marking. It never touches SQL - everything goes through
// /api/notifications, which scopes every query to the session's profile id.

import { useCallback, useEffect, useRef, useState } from "react";
import NotificationItem from "./NotificationItem";

// How often the badge refreshes. 30s is the figure agreed in the feature-09
// plan. It is the single largest recurring server cost in the app, so it is
// deliberately gated three ways: one shared interval per tab, skipped entirely
// while the tab is hidden, and answered by a count-only query that rides the
// partial index idx_notif_unread.
const POLL_MS = 30000;

// One page of the list. Matches DEFAULT_LIMIT in app/api/notifications/route.js.
const PAGE_SIZE = 20;

export default function BellMenu() {
	const [open, setOpen] = useState(false);
	const [unread, setUnread] = useState(0);
	const [items, setItems] = useState([]);
	const [cursor, setCursor] = useState(null);
	const [loading, setLoading] = useState(false);
	const [loaded, setLoaded] = useState(false);

	// Guards against a slow response landing after the component unmounts.
	const aliveRef = useRef(true);
	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, []);

	/**
	 * Refresh the badge only. One indexed count, no join, no rows returned.
	 * Silently gives up on network errors - a phone in a lift should not throw
	 * an error banner into the header.
	 */
	const refreshCount = useCallback(async () => {
		if (typeof document !== "undefined" && document.hidden) return;
		try {
			const res = await fetch("/api/notifications?count_only=true");
			if (!res.ok) return;
			const payload = await res.json();
			if (aliveRef.current && payload.ok) {
				setUnread(payload.data.unreadCount);
			}
		} catch {
			// offline - the next tick will pick it up
		}
	}, []);

	/**
	 * THE POLL. One interval for the whole tab, created once.
	 *
	 * document.hidden gating is not a micro-optimisation: a parent with the tab
	 * open in the background all day would otherwise cost 2,880 requests. With
	 * 10,000 users that is the difference between a busy server and a melting
	 * one. Coming back to the tab triggers an immediate refresh so the badge is
	 * never stale on screen.
	 */
	useEffect(() => {
		// The zero-timeout defers the first poll out of the effect's synchronous
		// body - React's lint rules forbid calling a state-setting function
		// synchronously inside an effect. Interval/visibility callbacks are fine.
		const boot = setTimeout(refreshCount, 0);
		const timer = setInterval(refreshCount, POLL_MS);

		function onVisibilityChange() {
			if (!document.hidden) refreshCount();
		}
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			clearTimeout(boot);
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [refreshCount]);

	/**
	 * Fetch one page of rows.
	 * @param {string|null} before - keyset cursor, null for the first page
	 */
	const loadPage = useCallback(async (before) => {
		setLoading(true);
		try {
			const url = before
				? `/api/notifications?limit=${PAGE_SIZE}&before=${before}`
				: `/api/notifications?limit=${PAGE_SIZE}`;
			const res = await fetch(url);
			if (!res.ok) return;
			const payload = await res.json();
			if (!aliveRef.current || !payload.ok) return;

			setItems((current) =>
				before ? [...current, ...payload.data.items] : payload.data.items
			);
			setCursor(payload.data.nextCursor);
			setLoaded(true);
		} catch {
			// offline - the panel keeps whatever it already had
		} finally {
			if (aliveRef.current) setLoading(false);
		}
	}, []);

	// Rows are fetched when the panel is FIRST opened, never on page load.
	// A user who never opens the bell costs one count query every 30s and
	// nothing else.
	function togglePanel() {
		const next = !open;
		setOpen(next);
		if (next && !loaded) loadPage(null);
	}

	// Escape closes the panel, matching every other menu on the web.
	useEffect(() => {
		if (!open) return;
		function onKeyDown(event) {
			if (event.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open]);

	/**
	 * Optimistic read marking: the row greys out instantly, then the request
	 * goes out. If the server rejects it, both the row and the badge snap back
	 * to exactly what they were. Never leave the UI showing a state the
	 * database does not agree with.
	 */
	async function handleMarkRead(id) {
		const previousItems = items;
		const previousUnread = unread;

		setItems((current) =>
			current.map((row) => (row.id === id ? { ...row, isRead: true } : row))
		);
		setUnread((current) => Math.max(0, current - 1));

		try {
			const res = await fetch(`/api/notifications/${id}/read`, {
				method: "PUT",
			});
			if (!res.ok) throw new Error("mark read failed");
		} catch {
			if (aliveRef.current) {
				setItems(previousItems);
				setUnread(previousUnread);
			}
		}
	}

	/** Mark everything read. Same optimistic-then-revert contract as above. */
	async function handleMarkAll() {
		if (unread === 0) return;

		const previousItems = items;
		const previousUnread = unread;

		setItems((current) => current.map((row) => ({ ...row, isRead: true })));
		setUnread(0);

		try {
			const res = await fetch("/api/notifications/read-all", { method: "PUT" });
			if (!res.ok) throw new Error("mark all failed");
		} catch {
			if (aliveRef.current) {
				setItems(previousItems);
				setUnread(previousUnread);
			}
		}
	}

	/** Infinite scroll: load the next page when the list nears the bottom. */
	function handleScroll(event) {
		if (loading || !cursor) return;
		const el = event.currentTarget;
		if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
			loadPage(cursor);
		}
	}

	// A three-digit badge would stretch the header, so it caps.
	const badge = unread > 99 ? "99+" : String(unread);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={togglePanel}
				aria-label={
					unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
				}
				aria-expanded={open}
				className="relative icon-button"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
					stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
					strokeLinejoin="round" aria-hidden="true">
					<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
					<path d="M13.73 21a2 2 0 0 1-3.46 0" />
				</svg>

				{unread > 0 && (
					<span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-page">
						{badge}
					</span>
				)}
			</button>

			{open && (
				<>
					{/* Backdrop: click anywhere outside to dismiss. */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setOpen(false)}
						aria-hidden="true"
					/>

					{/* Panel. Full-width sheet on mobile (~360px first), anchored
					    dropdown from sm upwards. */}
					<div
						role="dialog"
						aria-label="Notifications"
						className="fixed inset-x-2 top-16 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-13 sm:w-[380px]"
					>
						<div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
							<span className="label-micro">
								Notifications{unread > 0 ? ` / ${unread} unread` : ""}
							</span>
							<button
								type="button"
								onClick={handleMarkAll}
								disabled={unread === 0}
								title="Mark all as read"
								aria-label="Mark all as read"
								className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:text-body disabled:opacity-35"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
									stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
									strokeLinejoin="round" aria-hidden="true">
									<path d="M2 12.5 6 16.5 13 9.5" />
									<path d="M11 12.5 15 16.5 22 9.5" />
								</svg>
							</button>
						</div>

						<div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
							{!loaded && loading && (
								<p className="label-micro px-3.5 py-6 text-center">Loading</p>
							)}

							{loaded && items.length === 0 && (
								<p className="label-micro px-3.5 py-8 text-center">
									Nothing yet
								</p>
							)}

							{items.map((item) => (
								<NotificationItem
									key={item.id}
									item={item}
									onMarkRead={handleMarkRead}
								/>
							))}

							{loaded && loading && items.length > 0 && (
								<p className="label-micro px-3.5 py-3 text-center">Loading</p>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}