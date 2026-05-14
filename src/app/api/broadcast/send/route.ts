import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { listAuthorizedUsersAdmin } from "@/lib/usersAdmin";

export const dynamic = "force-dynamic";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://ai-microgrant-research-oberlin.vercel.app";
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "admin");
  if (!guard.ok) return guard.response;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No email key" }, { status: 500 });

  const { subject, body, senderName } = await req.json();
  if (!subject || !body) {
    return NextResponse.json({ error: "Subject and body required" }, { status: 400 });
  }

  const users = await listAuthorizedUsersAdmin();
  const recipients = users
    .filter((u) => u.status === "active")
    .map((u) => u.email)
    .filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No active users to send to" }, { status: 400 });
  }

  const resend = new Resend(apiKey);
  const baseUrl = getBaseUrl().replace(/\/$/, "");

  const htmlBody = body.replace(/\n/g, "<br>");

  await Promise.allSettled(
    recipients.map((email) =>
      resend.emails.send({
        from: "Civic Calendar <noreply@uhurued.com>",
        to: [email],
        subject: `${subject} — Civic Calendar`,
        html: `
<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; border-radius: 8px; overflow: hidden;">
  <div style="background: #a6192e; padding: 24px 32px;">
    <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.02em;">Civic Calendar</h1>
    <p style="margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.7);">Team Announcement</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="margin: 0 0 16px; font-size: 20px; color: #fff;">${subject.replace(/</g, "&lt;")}</h2>
    <div style="font-size: 15px; color: #ccc; line-height: 1.7;">${htmlBody}</div>
    <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #222;">
      <a href="${baseUrl}/dashboard" style="display: inline-block; background: #a6192e; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open Dashboard →</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 12px; color: #555;">Sent by ${(senderName || "Admin").replace(/</g, "&lt;")} via Civic Calendar Admin Console</p>
  </div>
  <div style="border-top: 1px solid #222; padding: 16px 32px; text-align: center;">
    <p style="margin: 0; font-size: 11px; color: #444;">Civic Calendar · Oberlin, Ohio</p>
  </div>
</div>`,
        text: `${subject}\n\n${body}\n\n— ${senderName || "Admin"}\nCivic Calendar · ${baseUrl}/dashboard`,
      })
    )
  );

  return NextResponse.json({ ok: true, sentTo: recipients.length });
}
