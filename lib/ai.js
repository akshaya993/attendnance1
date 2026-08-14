// lib/ai.js
// -----------------------------------------------------------------------------
// THE AI HELPER. One job today: draft a polite complaint reply from the
// admin's rough notes. (Feature 07's marks insights will reuse this file.)
//
// PROVIDER-AGNOSTIC ON PURPOSE. It speaks to ANY OpenAI-compatible
// chat-completions endpoint, chosen entirely by env vars:
//   AI_BASE_URL  e.g. http://localhost:11434/v1 (Ollama, self-hosted, free)
//                    or a hosted provider's base URL
//   AI_API_KEY   optional for local Ollama, required by hosted providers
//   AI_MODEL     e.g. "llama3.1" / "gpt-4o-mini" / whatever the provider hosts
//
// GRACEFULLY OFF WHEN UNCONFIGURED (owner's decision): with no env vars the
// school app must work perfectly without AI. aiStatus() reports why, and
// draftReply() returns { ok:false } instead of throwing - the copilot button
// shows a polite "not configured" note and everything else keeps working.
//
// SERVER ONLY - it reads secrets and calls the network. Never import from a
// "use client" file.
// -----------------------------------------------------------------------------

const SYSTEM_PROMPT =
	"Rephrase the admin's rough notes into a highly polite, professional " +
	"school administrator response addressed to a parent. Return only the " +
	"reply text - no greeting, no sign-off, no explanation.";

/** Is the AI provider configured, and if not, why not? */
export function aiStatus() {
	const missing = [];
	if (!process.env.AI_BASE_URL) missing.push("AI_BASE_URL");
	if (!process.env.AI_MODEL) missing.push("AI_MODEL");
	// AI_API_KEY is intentionally optional: local Ollama needs no key.
	if (missing.length > 0) {
		return {
			configured: false,
			reason: `missing from .env.local: ${missing.join(", ")} (restart the dev server after adding them)`,
		};
	}
	return { configured: true, reason: "ready" };
}

/**
 * Draft a reply. NEVER THROWS.
 *
 * @param {string} notes    the admin's rough notes (required)
 * @param {object} [context] optional { subject, description } of the complaint,
 *                           so the draft addresses the actual issue
 * @returns {Promise<{ok:true, draft:string}|{ok:false, reason:string}>}
 */
export async function draftReply(notes, context = {}) {
	const status = aiStatus();
	if (!status.configured) {
		return { ok: false, reason: status.reason };
	}

	const cleanNotes = String(notes ?? "").trim();
	if (!cleanNotes) {
		return { ok: false, reason: "Write a few rough notes first" };
	}

	const userContent =
		(context.subject || context.description
			? `The parent's complaint:\nSubject: ${context.subject ?? ""}\nDetails: ${context.description ?? ""}\n\n`
			: "") + `The admin's rough notes:\n${cleanNotes}`;

	try {
		const baseUrl = String(process.env.AI_BASE_URL).replace(/\/+$/, "");
		const headers = { "Content-Type": "application/json" };
		if (process.env.AI_API_KEY) {
			headers.Authorization = `Bearer ${process.env.AI_API_KEY}`;
		}

		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				model: process.env.AI_MODEL,
				messages: [
					{ role: "system", content: SYSTEM_PROMPT },
					{ role: "user", content: userContent },
				],
				temperature: 0.4,
			}),
			// A slow model must never hang the admin's screen forever.
			signal: AbortSignal.timeout(30000),
		});

		if (!response.ok) {
			console.error("[ai] provider answered", response.status);
			return { ok: false, reason: `The AI provider answered with an error (${response.status})` };
		}

		const payload = await response.json();
		const draft = payload?.choices?.[0]?.message?.content?.trim();
		if (!draft) {
			return { ok: false, reason: "The AI provider returned an empty draft" };
		}
		return { ok: true, draft };
	} catch (err) {
		// Timeout, DNS failure, provider down - all land here.
		console.error("[ai] draft failed:", err.message);
		return { ok: false, reason: "Could not reach the AI provider" };
	}
}
