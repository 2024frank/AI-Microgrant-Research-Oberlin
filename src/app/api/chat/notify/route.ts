import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://ai-microgrant-research-oberlin.vercel.app";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No email key" }, { status: 500 });

  const { text, senderName, mentions } = await req.json();
  if (!mentions?.length) return NextResponse.json({ ok: true });

  const resend = new Resend(apiKey);
  const chatUrl = `${getBaseUrl().replace(/\/$/, "")}/chat`;

  await Promise.allSettled(
    mentions.map((email: string) =>
      resend.emails.send({
        from: "Civic Calendar <noreply@uhurued.com>",
        to: [email],
        subject: `${senderName} mentioned you — Civic Calendar`,
        html: `
<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; border-radius: 8px; overflow: hidden;">
  <div style="background: #a6192e; padding: 20px 32px;">
    <h1 style="margin: 0; font-size: 16px; color: #fff;">Civic Calendar</h1>
  </div>
  <div style="padding: 28px 32px;">
    <p style="font-size: 14px; color: #999; margin: 0 0 12px;">
      <strong style="color: #fff;">${senderName}</strong> mentioned you in team chat:
    </p>
    <div style="background: #1a1a1a; border-left: 3px solid #a6192e; padding: 12px 16px; border-radius: 4px; margin: 0 0 20px;">
      <p style="font-size: 14px; color: #e8e8e8; margin: 0; line-height: 1.6;">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
    <a href="${chatUrl}" style="display: inline-block; background: #a6192e; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open Chat →</a>
  </div>
</div>`,
        text: `${senderName} mentioned you: "${text}"\n\nOpen chat: ${chatUrl}`,
      })
    )
  );

  return NextResponse.json({ ok: true });
}
