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
  const loginUrl = `${getBaseUrl().replace(/\/$/, "")}/login`;
  const name = body.displayName || body.to;

  if (body.type === "access-approved") {
    return {
      subject: "Your Civic Calendar access has been approved",
      text: `Hello ${name},\n\nYour Civic Calendar access has been approved. Sign in here: ${loginUrl}\n\nKwaku`,
      html: `<p>Hello ${name},</p><p>Your Civic Calendar access has been approved.</p><p><a href="${loginUrl}">Log in to Civic Calendar</a></p><p>Kwaku</p>`,
    };
  }

  return {
    subject: "You’ve been invited to Civic Calendar",
    text: `Hello ${name},\n\nYou have been invited to Civic Calendar as ${body.role}. Sign in with Google here: ${loginUrl}\n\nKwaku`,
    html: `<p>Hello ${name},</p><p>You have been invited to Civic Calendar as <strong>${body.role}</strong>.</p><p><a href="${loginUrl}">Log in to Civic Calendar</a></p><p>Kwaku</p>`,
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
