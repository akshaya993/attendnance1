// components/notifications/SentList.js
// -----------------------------------------------------------------------------
// The Sent tab. A record of broadcasts, with delivery and read counts.
//
// WHO SEES WHAT IS NOT DECIDED HERE. The browser cannot be trusted with that.
// /api/notifications/sent reads the role off the signed cookie and returns
// either just your own messages or the whole school's. This component only
// renders whatever it is handed, and uses the `scope` value the API echoes back
// to label itself correctly.
//
// WHY NO COLOURED PILLS HERE: NotificationItem.js already owns the bell's colour
// vocabulary (amber = important, red = urgent, green = reminder). Copying those
// maps into a second file would mean a future colour change has to be made
// twice, and one of them would eventually be forgotten. A Sent log is a record,
// not an alert, so plain mono micro-labels are the right treatment anyway.
// If a later feature genuinely needs those colours in two places, lift the maps
// into lib/notificationConstants.js and have BOTH files import them.
//
// TIME FORMAT: the bell shows "3m ago" because there you only care how fresh
// something is. An outbox shows the exact moment, because there you care when
// it actually went out.
// -----------------------------------------------------------------------------

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 20;

function sentAt(value) {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toLocaleString("en-IN", {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}

function readPercent(readCount, recipientCount) {
	if (!recipientCount) return 0;
	return Math.round((readCount / recipientCount) * 100);
}

export default function SentList() {
	const [items, setItems] = useState([]);
	const [scope, setScope] = useState("own");
	const [cursor, setCursor] = useState(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState("");

	// Guards against setting state after the tab has been switched away.
	const aliveRef = useRef(true);
	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, []);

	const fetchPage = useCallback(async (before) => {
		const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
		if (before) params.set("before", String(before));

		const response = await fetch(`/api/notifications/sent?${params.toString()}`);
		const payload = await response.json();

		if (!response.ok || !payload.ok) {
			throw new Error(payload.error || "Could not load your sent messages");
		}
		return payload.data;
	}, []);

	// First page, on mount.
	useEffect(() => {
		let cancelled = false;

		(async () => {
			try {
				const data = await fetchPage(null);
				if (cancelled || !aliveRef.current) return;
				setItems(data.items);
				setScope(data.scope);
				setCursor(data.nextCursor);
			} catch (err) {
				if (cancelled || !aliveRef.current) return;
				setError(err.message);
			} finally {
				if (!cancelled && aliveRef.current) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [fetchPage]);

	async function handleLoadMore() {
		if (!cursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const data = await fetchPage(cursor);
			if (!aliveRef.current) return;
			setItems((current) => [...current, ...data.items]);
			setCursor(data.nextCursor);
		} catch (err) {
			if (aliveRef.current) setError(err.message);
		} finally {
			if (aliveRef.current) setLoadingMore(false);
		}
	}

	if (loading) {
		return (
			<p className="label-micro text-muted mt-8">LOADING SENT MESSAGES</p>
		);
	}

	if (error) {
		return (
			<div className="card mt-8 p-6">
				<p className="text-danger text-sm">{error}</p>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="card mt-8 p-6">
				<p className="label-micro text-muted">SENT</p>
				<p className="mt-3 text-sm text-muted">
					Nothing sent yet. Messages you broadcast will be listed here with how
					many people received them and how many have read them.
				</p>
			</div>
		);
	}

	return (
		<div className="mt-8">
			<p className="label-micro text-muted">
				{scope === "all"
					? `EVERY BROADCAST IN THE SCHOOL / ${items.length} SHOWN`
					: `YOUR SENT MESSAGES / ${items.length} SHOWN`}
			</p>

			<div className="card mt-3 overflow-hidden">
				{items.map((item) => {
					const percent = readPercent(item.readCount, item.recipientCount);
					const isUrgent = item.priority === "urgent";

					return (
						<div
							key={item.id}
							className="border-b border-soft px-5 py-4 last:border-b-0"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="label-micro text-muted">
									{item.kind === "reminder" ? "REMINDER" : "NOTIFICATION"}
								</span>
								<span
									className={`label-micro ${isUrgent ? "text-danger" : "text-muted"}`}
								>
									{item.priority.toUpperCase()}
								</span>
								<span className="label-micro text-muted ml-auto">
									{sentAt(item.createdAt)}
								</span>
							</div>

							<p className="mt-2 text-sm">{item.title}</p>
							<p className="mt-1 text-sm text-muted">{item.body}</p>

							<div className="mt-3 flex flex-wrap items-center gap-2">
								<span className="label-micro text-muted">
									{item.recipientCount} DELIVERED
								</span>
								<span className="label-micro text-muted">/</span>
								<span className="label-micro text-ok">
									{item.readCount} READ ({percent}%)
								</span>

								{/* Only the school-wide view needs a sender name - in your own
								    outbox every single row was sent by you. */}
								{scope === "all" && item.sentBy ? (
									<span className="label-micro text-muted ml-auto">
										BY {item.sentBy.toUpperCase()}
									</span>
								) : null}
							</div>
						</div>
					);
				})}
			</div>

			{cursor ? (
				<button
					type="button"
					onClick={handleLoadMore}
					disabled={loadingMore}
					className="label-micro text-muted mt-4 rounded-lg border border-line bg-raised px-4 py-3 transition-colors duration-150 hover:text-body disabled:opacity-50"
				>
					{loadingMore ? "LOADING" : "LOAD OLDER"}
				</button>
			) : null}
		</div>
	);
}