"use client";

// The interactive part of /login. Client component because it needs useState
// and event handlers. It only ever talks to /api/auth/login - no SQL, no DB,
// no session logic lives here (the code standards doc: pages never touch
// the database).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PasswordField from "./PasswordField";

export default function LoginForm() {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Strip anything that is not a digit and cap at 10. Parents paste numbers
  // with +91, spaces and dashes - silently cleaning it beats scolding them.
  function handlePhoneChange(event) {
    const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(digitsOnly);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    setError("");

    // Client-side checks are for speed and kindness only. The API re-validates
    // everything - never trust the browser.
    if (!/^\d{10}$/.test(phoneNumber)) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    if (!password) {
      setError("Enter your password");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, password }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.ok) {
        // Show the server's message verbatim. It is already written to be
        // safe: the same generic text for a wrong password and an unknown
        // number, and the plain-English lockout notice.
        setError(payload?.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      // The session cookie is already set by the response headers.
      // replace() so the back button cannot return to the login screen.
      router.replace(payload.data.redirectTo || "/");
      // refresh() re-runs server components so they see the new cookie.
      router.refresh();
      // Deliberately NOT clearing `submitting` - we are navigating away, and
      // re-enabling the button invites a double submit.
    } catch {
      setError("Cannot reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? (
        <div
          role="alert"
          className="bg-danger-soft text-danger border-line mb-5 rounded-md border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="mb-5">
        <label htmlFor="phoneNumber" className="label-micro text-muted block mb-2">
          Phone number
        </label>
        <input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          placeholder="10-digit mobile number"
          value={phoneNumber}
          onChange={handlePhoneChange}
          disabled={submitting}
          className="field w-full"
        />
      </div>

      <div className="mb-6">
        <PasswordField
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          placeholder="Your password"
        />
      </div>

      <button type="submit" disabled={submitting} className="cta w-full">
        {submitting ? "Signing in..." : "Sign in"}
      </button>

      <p className="mt-5 text-center text-sm">
        <Link href="/forgot-password" className="text-muted hover:text-body underline">
         Forgot password?
        </Link>
      </p>
    </form>
  );
}