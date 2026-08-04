// app/api/auth/otp/send/route.js
// Issue a one-time code for a password reset or a forced first login.
//
// PUBLIC ROUTE (listed in proxy.js). A locked-out user has no session - that
// is the entire reason this flow exists.
//
// ANTI-ENUMERATION: this route ALWAYS returns 200 with the same message,
// whether the phone number exists, does not exist, or has exhausted its
// 30-codes-per-year allowance. It also burns an equivalent amount of CPU in
// the "no such account" branch so response times cannot be used to tell the
// cases apart.

import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

import {
  findAuthProfileByPhone,
  countOtpsInLastYear,
  createOtp,
  OTP_MAX_PER_YEAR,
  OTP_TTL_MINUTES,
} from "@/lib/repos/authRepo";
import { sendMail } from "@/lib/mailer";
import { sendSms } from "@/lib/sms";

const VALID_PURPOSES = new Set(["reset", "first_login"]);
const VALID_CHANNELS = new Set(["email", "phone"]);

// The ONLY message this route ever returns on the happy path or the
// "account does not exist" path or the "rate limited" path.
const GENERIC_OK = "If an account exists, a code has been sent.";

// crypto.randomInt is cryptographically secure. Math.random is NOT - its
// output is predictable from previous values, which would let an attacker
// compute the next person's reset code.
function generateCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

function emailBody(code) {
  return (
    `Your Greenwood School verification code is:\n\n` +
    `    ${code}\n\n` +
    `It expires in ${OTP_TTL_MINUTES} minutes and can be used only once.\n\n` +
    `If you did not request this, you can ignore this email - your account\n` +
    `has not been changed.\n\n` +
    `- Greenwood School`
  );
}

function smsBody(code) {
  return (
    `Greenwood School: your verification code is ${code}. ` +
    `Valid for ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.`
  );
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    const phoneNumber = String(body?.phoneNumber ?? "").trim();
    const purpose = String(body?.purpose ?? "reset").trim();
    const requestedChannel = String(body?.channel ?? "email").trim();

    // Shape validation is safe to report honestly - it reveals nothing about
    // who does or does not have an account.
    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid 10-digit phone number" },
        { status: 400 }
      );
    }

    if (!VALID_PURPOSES.has(purpose)) {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    if (!VALID_CHANNELS.has(requestedChannel)) {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    // From here on, every exit path returns the SAME 200 response.
    const genericResponse = NextResponse.json({
      ok: true,
      data: {
        message: GENERIC_OK,
        // Deliberately the channel that was ASKED FOR, not the one used.
        // Reporting the real one would reveal which accounts lack an email.
        channel: requestedChannel,
        expiresInMinutes: OTP_TTL_MINUTES,
      },
    });

    const profile = await findAuthProfileByPhone(phoneNumber);

    if (!profile) {
      // Spend roughly the same CPU as the real path so the two cannot be
      // distinguished by response time.
      await bcrypt.hash(generateCode(), 10);
      return genericResponse;
    }

    // The single rate limit: 30 codes per phone per rolling 365 days.
    const used = await countOtpsInLastYear(phoneNumber);
    if (used >= OTP_MAX_PER_YEAR) {
      console.warn(
        `[otp/send] BLOCKED: ${phoneNumber} has used ${used}/${OTP_MAX_PER_YEAR} codes in the last 365 days`
      );
      return genericResponse;
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);

    // Stores the hash and retires any older unconsumed code for this
    // phone + purpose, so only the newest code can be redeemed.
    await createOtp({ phoneNumber, codeHash, purpose });

    // Email is the default channel. An account with no email on file falls
    // back to SMS - the response does not admit this happened.
    const useEmail = requestedChannel === "email" && Boolean(profile.email);

    if (useEmail) {
      await sendMail({
        to: profile.email,
        subject: "Greenwood School verification code",
        text: emailBody(code),
      });
    } else {
      await sendSms({ to: profile.phoneNumber, message: smsBody(code) });
    }

    return genericResponse;
  } catch (err) {
    console.error("[auth/otp/send] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}