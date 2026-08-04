// app/api/dev/mail-test/route.js
//
// TEMPORARY. Delete this file at the end of Task 8B. It exists only to prove
// your Gmail App Password works before we build OTP logic on top of it.
//
// Two safety measures, because a "send an email to anyone" endpoint is a spam
// cannon if it escapes:
//   1. It returns 404 outside development.
//   2. proxy.js requires a session, so you must be signed in to reach it.

import { NextResponse } from "next/server";
import { sendMail, mailProvider } from "@/lib/mailer";
import { sendSms, smsProvider } from "@/lib/sms";

export async function GET(request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const to =
    request.nextUrl.searchParams.get("to") || process.env.MAIL_USER || "";

  if (!to) {
    return NextResponse.json(
      { ok: false, error: "No recipient. Add ?to=someone@example.com" },
      { status: 400 }
    );
  }

  const mail = await sendMail({
    to,
    subject: "Greenwood School - test email",
    text:
      "This is a test from your school app.\n\n" +
      "If you are reading this in a real inbox, nodemailer and your Gmail " +
      "App Password are working correctly.\n\n" +
      "- Greenwood School portal",
  });

  const sms = await sendSms({
    to: "9000000001",
    message: "Greenwood School: this is a test SMS.",
  });

  return NextResponse.json({
    ok: true,
    data: {
      mailProvider: mailProvider(),
      smsProvider: smsProvider(),
      sentTo: to,
      mailDelivered: mail.delivered,
      smsDelivered: sms.delivered,
      messageId: mail.messageId,
    },
  });
}