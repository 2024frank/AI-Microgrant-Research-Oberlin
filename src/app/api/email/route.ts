import { NextResponse } from "next/server";
import { Resend } from "resend";

type EmailRequest =
  | {
      type: "access-approved";
      to: string;
      displayName?: string | null;
    }
  | {
      type: "invite-user";
      to: string;
      role: string;
      displayName?: string | null;
    };

const fromAddress = "Civic Calendar <noreply@uhurued.com>";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://ai-microgrant-research-oberlin.vercel.app";
}

function getEmailContent(body: EmailRequest) {
  const base = getBaseUrl().replace(/\/$/, "");
  const loginUrl = `${base}/login?email=${encodeURIComponent(body.to)}`;
  const name = body.displayName || body.to;

  if (body.type === "access-approved") {
    return {
      subject: "Your Civic Calendar access has been approved",
      text: `Hello ${name},\n\nYour access to the Civic Calendar Admin Console has been approved. You can now sign in and start reviewing community events.\n\nSign in: ${loginUrl}\n\n— The Civic Calendar Team\nOberlin, Ohio`,
      html: `
<div style="font-family: ‘Helvetica Neue’, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; border-radius: 8px; overflow: hidden;">
  <div style="background: #a6192e; padding: 24px 32px;">
    <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.02em;">Civic Calendar</h1>
    <p style="margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.7);">Admin Console</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="margin: 0 0 16px; font-size: 20px; color: #5eead4;">Access Approved</h2>
    <p style="font-size: 15px; color: #e8e8e8; line-height: 1.6; margin: 0 0 8px;">Hello ${name},</p>
    <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 24px;">Your access to the Civic Calendar Admin Console has been approved. You can now sign in to review, edit, and publish community events for Oberlin.</p>
    <a href="${loginUrl}" style="display: inline-block; background: #a6192e; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">Sign In to Get Started →</a>
    <p style="margin: 32px 0 0; font-size: 12px; color: #555; line-height: 1.5;">
      If you did not request access, you can safely ignore this email.
    </p>
  </div>
  <div style="border-top: 1px solid #222; padding: 16px 32px; text-align: center;">
    <p style="margin: 0; font-size: 11px; color: #444;">Civic Calendar · Oberlin, Ohio</p>
  </div>
</div>`,
    };
  }

  const roleLabel = body.role.charAt(0).toUpperCase() + body.role.slice(1);

  return {
    subject: "You’re invited to join Civic Calendar",
    text: `Hello ${name},\n\nYou’ve been invited to join the Civic Calendar Admin Console as a ${roleLabel}.\n\nCivic Calendar is Oberlin’s AI-powered community event management platform. As a ${roleLabel}, you’ll help review and curate events before they’re published to Oberlin’s Community Hub.\n\nSign in with Google: ${loginUrl}\n\n— The Civic Calendar Team\nOberlin, Ohio`,
    html: `
<div style="font-family: ‘Helvetica Neue’, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; border-radius: 8px; overflow: hidden;">
  <div style="background: #a6192e; padding: 24px 32px;">
    <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.02em;">Civic Calendar</h1>
    <p style="margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.7);">Admin Console</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="margin: 0 0 16px; font-size: 20px; color: #fff;">You’re Invited</h2>
    <p style="font-size: 15px; color: #e8e8e8; line-height: 1.6; margin: 0 0 8px;">Hello ${name},</p>
    <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 16px;">You’ve been invited to join the Civic Calendar Admin Console as a <strong style="color: #fff;">${roleLabel}</strong>.</p>
    <p style="font-size: 14px; color: #999; line-height: 1.6; margin: 0 0 24px;">Civic Calendar is Oberlin’s AI-powered community event management platform. You’ll help review, curate, and publish events sourced from Oberlin’s calendar to the Community Hub.</p>

    <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #666;">Your Role</p>
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #5eead4;">${roleLabel}</p>
    </div>

    <a href="${loginUrl}" style="display: inline-block; background: #a6192e; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">Accept Invitation →</a>
    <p style="margin: 16px 0 0; font-size: 13px; color: #666;">Sign in with your Google account to get started.</p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #555; line-height: 1.5;">
      If you did not expect this invitation, you can safely ignore this email.
    </p>
  </div>
  <div style="border-top: 1px solid #222; padding: 16px 32px; text-align: center;">
    <p style="margin: 0; font-size: 11px; color: #444;">Civic Calendar · Oberlin, Ohio</p>
  </div>
</div>`,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json()) as Partial<EmailRequest>;

  if (!body.type || !body.to) {
    return NextResponse.json({ error: "Email type and recipient are required." }, { status: 400 });
  }

  if (body.type !== "access-approved" && body.type !== "invite-user") {
    return NextResponse.json({ error: "Unsupported email type." }, { status: 400 });
  }

  const resend = new Resend(apiKey);
  const content = getEmailContent(body as EmailRequest);

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: [body.to],
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (error) {
    return NextResponse.json({ error: "Unable to send email right now." }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id ?? null });
}
