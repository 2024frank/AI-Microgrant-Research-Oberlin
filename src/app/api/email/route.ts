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
    }
  | {
      type: "normalization-report";
      to: string;
      summary: {
        events_read: number;
        unique_events: number;
        events_normalized: number;
        events_queued_for_review: number;
        duplicates_community_hub: number;
        duplicates_batch: number;
        duplicates_firestore: number;
        events_with_errors: number;
        firestore_writes_succeeded: number;
        average_confidence: number;
      };
      runTimestamp: string;
    };

const fromAddress = "Civic Calendar <noreply@uhurued.com>";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function getEmailContent(body: EmailRequest) {
  const loginUrl = `${getBaseUrl().replace(/\/$/, "")}/login`;

  if (body.type === "normalization-report") {
    const s = body.summary;
    const subject = `Oberlin Normalizer: ${s.events_normalized} events (${s.duplicates_community_hub} CH, ${s.duplicates_batch} batch dupes)`;
    const rows = [
      ["Events read (raw)", s.events_read],
      ["Unique events", s.unique_events],
      ["Events normalized", s.events_normalized],
      ["Queued for review", s.events_queued_for_review],
      ["Community Hub duplicates", s.duplicates_community_hub],
      ["Batch duplicates", s.duplicates_batch],
      ["Already queued (Firestore)", s.duplicates_firestore],
      ["Validation errors", s.events_with_errors],
      ["Firestore writes", s.firestore_writes_succeeded],
      ["Average confidence", s.average_confidence],
    ]
      .map(
        ([label, val]) =>
          `<tr><td style="padding:4px 12px">${label}</td><td><strong>${val}</strong></td></tr>`,
      )
      .join("");
    const html = `<h2>Oberlin Localist Normalization Report</h2><p><strong>Run at:</strong> ${body.runTimestamp}</p><table style="border-collapse:collapse">${rows}</table><p><a href="${loginUrl}">Open Civic Calendar</a></p>`;
    const text = `Oberlin Normalization Report\nRun: ${body.runTimestamp}\nNormalized: ${s.events_normalized} | Review: ${s.events_queued_for_review} | CH Dups: ${s.duplicates_community_hub}`;
    return { subject, html, text };
  }

  const name = body.displayName || body.to;

  if (body.type === "access-approved") {
    return {
      subject: "Your Civic Calendar access has been approved",
      text: `Hello ${name},\n\nYour Civic Calendar access has been approved. Sign in here: ${loginUrl}\n\nCivic Infrastructure Systems`,
      html: `<p>Hello ${name},</p><p>Your Civic Calendar access has been approved.</p><p><a href="${loginUrl}">Log in to Civic Calendar</a></p><p>Civic Infrastructure Systems</p>`,
    };
  }

  return {
    subject: "You've been invited to Civic Calendar",
    text: `Hello ${name},\n\nYou have been invited to Civic Calendar as ${body.role}. Sign in with Google here: ${loginUrl}\n\nCivic Infrastructure Systems`,
    html: `<p>Hello ${name},</p><p>You have been invited to Civic Calendar as <strong>${body.role}</strong>.</p><p><a href="${loginUrl}">Log in to Civic Calendar</a></p><p>Civic Infrastructure Systems</p>`,
  };
}

const supportedTypes = new Set(["access-approved", "invite-user", "normalization-report"]);

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json()) as Partial<EmailRequest>;

  if (!body.type || !body.to) {
    return NextResponse.json({ error: "Email type and recipient are required." }, { status: 400 });
  }

  if (!supportedTypes.has(body.type)) {
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
