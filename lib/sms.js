// lib/sms.js
// The ONLY place the app sends SMS from. Deliberately the same shape as
// lib/mailer.js.
//
// SMS_PROVIDER=console -> prints to the terminal, sends nothing (default,
//                         and the ONLY working provider today)
// SMS_PROVIDER=msg91   -> real delivery. BLOCKED until TRAI DLT registration
//                         is complete. See the OTP and auth spec in context/
//                         (search the docs for "TRAI DLT").
//
// WHY NO REAL SMS YET: India requires every commercial sender to register
// with a TRAI DLT platform (roughly Rs 5,000 in one-off fees) and to get each
// message template pre-approved. Unregistered SMS is simply not delivered.
// Email is our default OTP channel precisely because it is free and instant.

const PROVIDER = (process.env.SMS_PROVIDER || "console").toLowerCase();

/**
 * Send one SMS.
 *
 * Returns { delivered, provider }. Like sendMail, it does not throw on a
 * delivery failure - the caller must not reveal delivery outcomes to the
 * browser.
 */
export async function sendSms({ to, message }) {
  if (!to || !message) {
    throw new Error("sendSms requires to and message");
  }

  if (PROVIDER === "console") {
    console.log("\n========== SMS (console provider) ==========");
    console.log("To:      ", to);
    console.log("Sender:  ", process.env.SMS_SENDER_ID || "(none set)");
    console.log("--------------------------------------------");
    console.log(message);
    console.log("============================================\n");
    return { delivered: true, provider: "console" };
  }

  if (PROVIDER === "msg91") {
    // Intentionally not implemented. Wiring this up before DLT registration
    // would produce silent non-delivery, which is worse than a loud error.
    console.error(
      "[sms] SMS_PROVIDER=msg91 but no real provider is wired up yet. " +
        "Complete TRAI DLT registration first - see the OTP and auth spec in context/"
    );
    return { delivered: false, provider: PROVIDER };
  }

  console.error(`[sms] Unknown SMS_PROVIDER: ${PROVIDER}`);
  return { delivered: false, provider: PROVIDER };
}

export function smsProvider() {
  return PROVIDER;
}