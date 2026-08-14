"use client";

// Password reset: phone -> code -> new password, all on one URL.
// A client component, so no metadata export is possible here. That trade is
// deliberate: splitting three steps across three routes strands people the
// moment they refresh.

import { useEffect, useState } from "react";
import Link from "next/link";

import OtpInput from "@/components/auth/OtpInput";
import PasswordField from "@/components/auth/PasswordField";

const PURPOSE = "reset";

// LONGER than OTP_COOLDOWN_SECONDS (45) in lib/repos/authRepo.js, on purpose.
// The server refuses silently, so if this visible timer were the shorter of the
// two, a click at zero could produce no code and no error at all.
const CLIENT_COOLDOWN_SECONDS = 60;

// Where the browser remembers its own countdown across a page refresh.
const COOLDOWN_KEY = "otpCooldown";

function formatWait(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState("phone"); // phone | code | password | done
  const [channel, setChannel] = useState("email"); // email is the default
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Resend cooldown. Tracked against the phone number it belongs to, so
  // switching numbers is not punished by another account's timer. Per-number
  // enforcement still happens on the server regardless of what we show.
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [lastSentTo, setLastSentTo] = useState("");

  const coolingDown = secondsLeft > 0 && phoneNumber === lastSentTo;

  // Tick down once per second.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // Restore a countdown that was still running before a page refresh.
  // Without this, F5 unlocks the button while the SERVER is still refusing,
  // so the user would be told a code was sent and receive nothing.
  // This is only the browser remembering the user's OWN click -- the server is
  // never consulted, so nothing about any account is revealed.
  // The zero-timeout defers the restore out of the effect's synchronous body -
  // React's lint rules forbid calling setState directly inside an effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(COOLDOWN_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw);
        const left = Math.ceil((saved.until - Date.now()) / 1000);

        if (saved.phone && left > 0) {
          setPhoneNumber(saved.phone);
          setLastSentTo(saved.phone);
          setSecondsLeft(Math.min(left, CLIENT_COOLDOWN_SECONDS));
        }
      } catch {
        // Private browsing can block localStorage. Losing the timer is a small
        // annoyance; a crash on the reset screen would not be.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    return { ok: res.ok && payload?.ok === true, payload };
  }

  async function sendCode(nextChannel = channel) {
    if (coolingDown) return;

    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { ok, payload } = await post("/api/auth/otp/send", {
        phoneNumber,
        purpose: PURPOSE,
        channel: nextChannel,
      });

      if (!ok) {
        // Only shape errors land here, e.g. a malformed phone number. An
        // unknown account still returns 200, so we never reveal who exists.
        setError(payload?.error || "Something went wrong. Please try again.");
        return;
      }

      setLastSentTo(phoneNumber);
      setSecondsLeft(CLIENT_COOLDOWN_SECONDS);

      // Stored as an absolute DEADLINE, not a remaining count, so reloading
      // twenty seconds later shows 0:40 instead of starting again at 1:00.
      try {
        window.localStorage.setItem(
          COOLDOWN_KEY,
          JSON.stringify({
            phone: phoneNumber,
            until: Date.now() + CLIENT_COOLDOWN_SECONDS * 1000,
          })
        );
      } catch {
        // Storage unavailable - the in-memory timer still works this session.
      }

      setCode("");
      setStep("code");
      setNotice(
        payload?.data?.message || "If an account exists, a code has been sent."
      );
    } catch {
      setError("Cannot reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { ok, payload } = await post("/api/auth/otp/verify", {
        phoneNumber,
        code,
        purpose: PURPOSE,
      });

      if (!ok) {
        setError(payload?.error || "Something went wrong. Please try again.");
        setCode("");
        return;
      }

      setStep("password");
    } catch {
      setError("Cannot reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setError("");
    setBusy(true);
    try {
      const { ok, payload } = await post("/api/auth/reset-password", {
        password,
        confirmPassword,
      });

      if (!ok) {
        setError(payload?.error || "Something went wrong. Please try again.");
        return;
      }

      // The reset is finished, so the countdown is no longer meaningful.
      try {
        window.localStorage.removeItem(COOLDOWN_KEY);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }

      setStep("done");
    } catch {
      setError("Cannot reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const otherChannel = channel === "email" ? "phone" : "email";

  return (
    <div className="bg-page flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="label-micro text-muted">GREENWOOD</p>
        <h1 className="mt-2 text-2xl">Reset your password</h1>

        <div className="card mt-6 p-6">
          {error ? (
            <div
              role="alert"
              className="bg-danger-soft text-danger border-line mb-4 rounded border px-3 py-2 text-sm"
            >
              {error}
            </div>
          ) : null}

          {/* ---------- step 1: phone ---------- */}
          {step === "phone" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
            >
              <label htmlFor="phoneNumber" className="label-micro text-muted">
                PHONE NUMBER
              </label>
              <input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="10-digit number"
                value={phoneNumber}
                disabled={busy}
                onChange={(e) =>
                  setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="field mt-2 w-full"
              />

              <p className="text-muted mt-4 text-sm">
                We will send a 6-digit code to your{" "}
                {channel === "email" ? "email address" : "phone by SMS"}. If your
                account has no email on file, the code is sent by SMS instead.
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => setChannel(otherChannel)}
                className="text-muted mt-2 text-sm underline"
              >
                {channel === "email" ? "Use SMS instead" : "Use email instead"}
              </button>

              <button
                type="submit"
                disabled={busy || coolingDown || phoneNumber.length !== 10}
                className="cta mt-6 w-full"
              >
                {busy
                  ? "Sending..."
                  : coolingDown
                    ? `Wait ${formatWait(secondsLeft)}`
                    : "Send code"}
              </button>

              {coolingDown ? (
                <p className="text-muted mt-3 text-sm">
                  A code was just sent to this number. You can request another
                  in {formatWait(secondsLeft)}. Check your email, and your spam
                  folder, while you wait.
                </p>
              ) : null}
            </form>
          ) : null}

          {/* ---------- step 2: code ---------- */}
          {step === "code" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyCode();
              }}
            >
              {notice ? (
                <p className="text-muted mb-4 text-sm">{notice}</p>
              ) : null}

              <p className="label-micro text-muted">ENTER THE 6-DIGIT CODE</p>
              <div className="mt-3">
                <OtpInput value={code} onChange={setCode} disabled={busy} />
              </div>

              <p className="text-muted mt-3 text-sm">
                The code expires in 5 minutes and can be used only once.
              </p>

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="cta mt-6 w-full"
              >
                {busy ? "Checking..." : "Verify code"}
              </button>

              <div className="mt-4 flex justify-between text-sm">
                {coolingDown ? (
                  <span className="text-muted">
                    New code in {formatWait(secondsLeft)}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => sendCode()}
                    className="text-muted underline"
                  >
                    Send a new code
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                    setError("");
                    setNotice("");
                  }}
                  className="text-muted underline"
                >
                  Change number
                </button>
              </div>

              <p className="text-muted mt-4 text-xs">
                Each account can request a limited number of codes per year, so
                please wait for the one already sent before asking for another.
              </p>
            </form>
          ) : null}

          {/* ---------- step 3: new password ---------- */}
          {step === "password" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                savePassword();
              }}
            >
              <p className="text-muted mb-4 text-sm">
                Code accepted. Choose a new password - at least 8 characters,
                including a letter and a number.
              </p>

              <PasswordField
                id="password"
                name="password"
                label="NEW PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />

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
                disabled={busy || !password || !confirmPassword}
                className="cta mt-6 w-full"
              >
                {busy ? "Saving..." : "Save new password"}
              </button>
            </form>
          ) : null}

          {/* ---------- step 4: done ---------- */}
          {step === "done" ? (
            <div>
              <p className="label-micro text-ok">PASSWORD CHANGED</p>
              <p className="mt-3 text-sm">
                You have been signed out everywhere for safety. Sign in with your
                new password.
              </p>
              <Link
                href="/login"
                className="cta mt-6 inline-block w-full text-center"
              >
                Go to sign in
              </Link>
            </div>
          ) : null}
        </div>

        {step !== "done" ? (
          <p className="mt-6 text-center">
            <Link href="/login" className="label-micro text-muted underline">
              BACK TO SIGN IN
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}