// lib/mailer.js
// The ONLY place the app sends email from. Mirrors lib/sms.js on purpose:
// both export a single send function and both switch on a *_PROVIDER env var,
// so callers never know or care which channel is real.
//
// MAIL_PROVIDER=console  -> prints to the terminal, sends nothing (default)
// MAIL_PROVIDER=gmail    -> real delivery via a Gmail App Password
// MAIL_PROVIDER=smtp     -> real delivery via any SMTP host (production)

import nodemailer from "nodemailer";

const PROVIDER = (process.env.MAIL_PROVIDER || "console").toLowerCase();

// Google displays App Passwords as "abcd efgh ijkl mnop". People paste the
// spaces. Google rejects them. Strip whitespace rather than fail cryptically.
function cleanPassword(value) {
  return (value || "").replace(/\s+/g, "");
}

function fromAddress() {
  return (
    process.env.MAIL_FROM ||
    process.env.MAIL_USER ||
    "Greenwood School <no-reply@localhost>"
  );
}

// Building an SMTP transport opens a connection pool. Next.js hot-reloads
// modules on every save in dev, so without this guard you would leak a new
// pool on each keystroke. Same trick lib/db.js uses for the pg Pool.
function getTransport() {
  if (globalThis.__schoolAppMailer) {
    return globalThis.__schoolAppMailer;
  }

  let transport;

  if (PROVIDER === "gmail") {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      throw new Error(
        "MAIL_PROVIDER=gmail but MAIL_USER or MAIL_PASS is missing from .env.local"
      );
    }
    transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: cleanPassword(process.env.MAIL_PASS),
      },
    });
  } else if (PROVIDER === "smtp") {
    if (!process.env.MAIL_HOST) {
      throw new Error("MAIL_PROVIDER=smtp but MAIL_HOST is missing");
    }
    transport = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: String(process.env.MAIL_SECURE || "false") === "true",
      auth: process.env.MAIL_USER
        ? {
            user: process.env.MAIL_USER,
            pass: cleanPassword(process.env.MAIL_PASS),
          }
        : undefined,
    });
  } else {
    throw new Error(`Unknown MAIL_PROVIDER: ${PROVIDER}`);
  }

  globalThis.__schoolAppMailer = transport;
  return transport;
}

/**
 * Send one email.
 *
 * Returns { delivered, provider, messageId }. It NEVER throws on a delivery
 * failure - it logs and reports delivered:false. Callers must not leak
 * delivery success back to the browser anyway: telling a stranger "that email
 * bounced" tells them the address is not registered, which is exactly the
 * account enumeration we blocked on the login route.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to || !subject || !text) {
    throw new Error("sendMail requires to, subject and text");
  }

  if (PROVIDER === "console") {
    console.log("\n========== EMAIL (console provider) ==========");
    console.log("To:      ", to);
    console.log("From:    ", fromAddress());
    console.log("Subject: ", subject);
    console.log("----------------------------------------------");
    console.log(text);
    console.log("==============================================\n");
    return { delivered: true, provider: "console", messageId: null };
  }

  try {
    const info = await getTransport().sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
    });
    return {
      delivered: true,
      provider: PROVIDER,
      messageId: info.messageId || null,
    };
  } catch (err) {
    // Log the real reason for us; return a flag for the caller.
    console.error("[mailer] delivery failed", err);
    return { delivered: false, provider: PROVIDER, messageId: null };
  }
}

export function mailProvider() {
  return PROVIDER;
}