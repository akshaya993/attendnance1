// app/api/auth/otp/send/route.js
// Sends a 6-digit code by email (default) or SMS.
//
// ANTI-ENUMERATION IS THE WHOLE DESIGN OF THIS FILE. Once the request SHAPE is
// valid, the response is identical whether the account exists, does not exist,
// is inside its resend cooldown, or has used up its yearly allowance. Nothing
// about the outcome reaches the caller.

import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

import {
  findAuthProfileByPhone,
  countOtpsInLastYear,
  createOtp,
  otpCooldownRemaining,
  OTP_MAX_PER_YEAR,
  OTP_TTL_MINUTES,
} from "@/lib/repos/authRepo";
import { sendMail } from "@/lib/mailer";
import { sendSms } from "@/lib/sms";

const VALID_PURPOSES = new Set(["reset", "first_login"]);
const VALID_CHANNELS = new Set(["email", "phone"]);

const GENERIC_OK = "If an account exists, a code has been sent.";

// crypto.randomInt, never Math.random. Math.random is predictable enough that
// a determined attacker could shrink the guess space.
function generateCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
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
    const purpose = String(body?.purpose ?? "reset");
    const requestedChannel = String(body?.channel ?? "email");

    // ---------- shape errors are honest 400s ----------
    // These describe the REQUEST, not any account, so they leak nothing.
    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid 10-digit phone number" },
        { status: 400 }
      );
    }
    if (!VALID_PURPOSES.has(purpose) || !VALID_CHANNELS.has(requestedChannel)) {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    // Every remaining path returns EXACTLY this, byte for byte.
    const identicalResponse = NextResponse.json({
      ok: true,
      data: {
        message: GENERIC_OK,
        // The channel that was ASKED for, never the one actually used.
        // Echoing the real channel would reveal which accounts have an email.
        channel: requestedChannel,
        expiresInMinutes: OTP_TTL_MINUTES,
      },
    });

    const profile = await findAuthProfileByPhone(phoneNumber);

    if (!profile) {
      // Burn comparable CPU so the response TIME does not give away the answer
      // that the response BODY is carefully hiding.
      await bcrypt.hash(generateCode(), 10);
      return identicalResponse;
    }

    // ---------- resend cooldown ----------
    // Silent on purpose. Replying "wait 45 seconds" could only ever be true for
    // a real account, so it would hand anyone a way to test whether a phone
    // number is enrolled at this school. The browser runs the visible timer.
    //
    // Because we return before createOtp, no row is written, the yearly
    // allowance is untouched, and the code already sent STAYS VALID -- exactly
    // what someone waiting on a slow email needs.
    const waitSeconds = await otpCooldownRemaining(phoneNumber, purpose);
    if (waitSeconds > 0) {
      console.warn(
        `[otp/send] COOLDOWN: ${phoneNumber} must wait ${waitSeconds}s more`
      );
      return identicalResponse;
    }

    // ---------- yearly allowance ----------
    const used = await countOtpsInLastYear(phoneNumber);
    if (used >= OTP_MAX_PER_YEAR) {
      console.warn(
        `[otp/send] BLOCKED: ${phoneNumber} has used ${used}/${OTP_MAX_PER_YEAR} codes this year`
      );
      return identicalResponse;
    }

    // ---------- create and deliver ----------
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    await createOtp({ phoneNumber, codeHash, purpose });

    // Email is the default channel for every role. An account with no email on
    // file quietly falls back to SMS; the response does not mention it.
    const useEmail = requestedChannel === "email" && Boolean(profile.email);

    if (useEmail) {
      await sendMail({
        to: profile.email,
        subject: "Greenwood School verification code",
        text:
          `Your Greenwood School verification code is:\n\n` +
          `${code}\n\n` +
          `It expires in ${OTP_TTL_MINUTES} minutes and can be used only once.\n\n` +
          `If you did not request this, you can ignore this email - your account\n` +
          `has not been changed.\n\n` +
          `- Greenwood School`,
      });
    } else {
      await sendSms({
        to: phoneNumber,
        message:
          `Greenwood School: your verification code is ${code}. ` +
          `Valid for ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.`,
      });
    }

    return identicalResponse;
  } catch (err) {
    console.error("[auth/otp/send] unexpected failure", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}