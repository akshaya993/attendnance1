"use client";

// Forced password change. Two ways in:
//   1. must_change_password = true (an admin issued a temporary password)
//   2. an admin whose password is older than 30 days
// proxy.js already requires a session for this route, and change-password
// re-checks the session and the current password server-side.

import { useState } from "react";
import { useRouter } from "next/navigation";

import PasswordField from "@/components/auth/PasswordField";

export default function FirstLoginPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.ok !== true) {
        // A 401 here means the session died, not that the password was wrong.
        if (res.status === 401 && payload?.error !== "Your current password is incorrect") {
          router.replace("/login");
          return;
        }
        setError(payload?.error || "Something went wrong. Please try again.");
        return;
      }

      // The cookie was re-minted at the new epoch, so this device stays signed
      // in. refresh() makes the server re-read the profile, which now has
      // must_change_password cleared - so it will not bounce us back here.
      router.replace(payload?.data?.redirectTo || "/");
      router.refresh();
    } catch {
      setError("Cannot reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-page flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="label-micro text-muted">GREENWOOD</p>
        <h1 className="mt-2 text-2xl">Choose a new password</h1>

        <div className="card mt-6 p-6">
          {error ? (
            <div
              role="alert"
              className="bg-danger-soft text-danger border-line mb-4 rounded border px-3 py-2 text-sm"
            >
              {error}
            </div>
          ) : null}

          <p className="text-muted mb-4 text-sm">
            Your password needs to be updated before you continue. Use at least 8
            characters, including a letter and a number.
          </p>

          <form onSubmit={handleSubmit}>
            <PasswordField
              id="currentPassword"
              name="currentPassword"
              label="CURRENT PASSWORD"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={busy}
              autoComplete="current-password"
            />

            <div className="mt-4">
              <PasswordField
                id="newPassword"
                name="newPassword"
                label="NEW PASSWORD"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
            </div>

            <div className="mt-4">
              <PasswordField
                id="confirmPassword"
                name="confirmPassword"
                label="CONFIRM NEW PASSWORD"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !currentPassword || !newPassword || !confirmPassword}
              className="cta mt-6 w-full"
            >
              {busy ? "Saving..." : "Save and continue"}
            </button>
          </form>
        </div>

        <p className="text-muted mt-6 text-center text-sm">
          Changing your password signs you out on your other devices.
        </p>
      </div>
    </div>
  );
}