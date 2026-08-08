// components/notifications/BroadcastTabs.js
// -----------------------------------------------------------------------------
// Compose | Sent, on one screen. The email metaphor you asked for.
//
// WHY THIS FILE EXISTS: the two broadcast pages are Server Components, and a
// Server Component cannot hold "which tab is open" - that is browser state.
// This is the smallest possible client wrapper: it owns one string and picks
// which child to show. All the real work stays in BroadcastComposer and
// SentList.
//
// `role` is passed straight through to the composer, which uses it to decide
// which audiences to offer. It is a HINT FOR THE UI ONLY. The real wall is
// canUseAudience() running on the server for every send.
//
// The Sent tab needs no role prop at all - the API decides what it returns from
// the signed cookie.
// -----------------------------------------------------------------------------

"use client";

import { useState } from "react";
import BroadcastComposer from "./BroadcastComposer";
import SentList from "./SentList";

const TABS = [
	{ value: "compose", label: "COMPOSE" },
	{ value: "sent", label: "SENT" },
];

export default function BroadcastTabs({ role }) {
	const [tab, setTab] = useState("compose");

	return (
		<div className="mt-8">
			<div
				role="tablist"
				aria-label="Broadcast"
				className="flex items-center gap-1 border-b border-line"
			>
				{TABS.map((entry) => {
					const active = tab === entry.value;
					return (
						<button
							key={entry.value}
							type="button"
							role="tab"
							aria-selected={active}
							onClick={() => setTab(entry.value)}
							className={`label-micro -mb-px border-b-2 px-4 py-3 transition-colors duration-150 ${
								active
									? "border-body text-body"
									: "border-transparent text-muted hover:text-body"
							}`}
						>
							{entry.label}
						</button>
					);
				})}
			</div>

			{/* Both are mounted only when selected. Switching to Sent therefore
			    re-fetches, which is what you want: the read counts move as people
			    open their bells. */}
			{tab === "compose" ? <BroadcastComposer role={role} /> : <SentList />}
		</div>
	);
}