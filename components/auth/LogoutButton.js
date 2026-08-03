"use client";

// Sign out of THIS device. Calls POST /api/auth/logout, which clears the
// session cookie. It deliberately does not log you out of your other devices -
// that only happens on a password change (session_epoch bump).

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the network call fails, send them to /login. The cookie may
      // survive, but the user is not left stuck on a page they wanted to leave.
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} disabled={busy} className="cta">
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}