"use client";

// components/fees/CopyNamesButton.js
// The "Copy Names" button on the unpaid-students page: one tap puts the list
// of names on the admin's clipboard (one per line, ready to paste into a
// message or a register).
//
// Client component because the clipboard only exists in the browser. Shows a
// short "Copied" confirmation so the admin is never left guessing.

import { useState } from "react";

export default function CopyNamesButton({ names }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(names.join("\n"));
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard blocked (some browsers in insecure contexts) - tell the
			// user honestly instead of pretending.
			setCopied(false);
			alert("Could not copy. Long-press and select the names manually.");
		}
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			disabled={names.length === 0}
			className="cta"
		>
			{copied ? "Copied!" : `Copy names (${names.length})`}
		</button>
	);
}
