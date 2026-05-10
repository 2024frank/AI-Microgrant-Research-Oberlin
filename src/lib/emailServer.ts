import { Resend } from "resend";

const FROM = "Civic Calendar <noreply@uhurued.com>";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://ai-microgrant-research-oberlin.vercel.app";
}

export async function sendPipelineCompleteEmail(opts: {
  to: string[];
  queued: number;
  rejected: number;
  duplicates: number;
  sourceName: string;
  totalPending: number;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || opts.to.length === 0) return;

  const resend = new Resend(apiKey);
  const queueUrl = `${getBaseUrl().replace(/\/$/, "")}/posts`;

  const subject = `${opts.queued} new event${opts.queued !== 1 ? "s" : ""} queued for review — Civic Calendar`;

  const html = `
<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; padding: 32px; border-radius: 8px;">
  <h2 style="margin: 0 0 8px; font-size: 20px; color: #fff;">Pipeline run complete</h2>
  <p style="margin: 0 0 24px; color: #999; font-size: 14px;">Source: <strong style="color: #e8e8e8;">${opts.sourceName}</strong></p>

  <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
    <tr style="border-bottom: 1px solid #222;">
      <td style="padding: 10px 0; color: #999;">New events queued for review</td>
      <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #5eead4;">${opts.queued}</td>
    </tr>
    <tr style="border-bottom: 1px solid #222;">
      <td style="padding: 10px 0; color: #999;">Auto-rejected (athletics / ineligible)</td>
      <td style="padding: 10px 0; text-align: right; color: #fca5a5;">${opts.rejected}</td>
    </tr>
    <tr style="border-bottom: 1px solid #222;">
      <td style="padding: 10px 0; color: #999;">Flagged as potential duplicates</td>
      <td style="padding: 10px 0; text-align: right; color: #fcd34d;">${opts.duplicates}</td>
    </tr>
    <tr>
      <td style="padding: 10px 0; color: #999;">Total pending review in queue</td>
      <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #fff;">${opts.totalPending}</td>
    </tr>
  </table>

  <a href="${queueUrl}" style="display: inline-block; background: #a6192e; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600;">
    Review Queue →
  </a>

  <p style="margin: 24px 0 0; font-size: 12px; color: #555;">
    All events were fetched from ${opts.sourceName} and processed by the Gemini AI extraction and editor agents before being queued.
  </p>
</div>`;

  const text = `Pipeline run complete — ${opts.sourceName}\n\nNew events queued: ${opts.queued}\nAuto-rejected: ${opts.rejected}\nDuplicates flagged: ${opts.duplicates}\nTotal pending review: ${opts.totalPending}\n\nReview queue: ${queueUrl}`;

  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject,
    html,
    text,
  });
}

export async function sendPublishConfirmationEmail(opts: {
  to: string;
  eventTitle: string;
  communityHubPostId: string;
  sourceUrl?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const baseUrl = getBaseUrl();
  const chUrl = `https://oberlin.communityhub.cloud`;

  const subject = `Published: "${opts.eventTitle}" — Civic Calendar`;

  const html = `
<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; padding: 32px; border-radius: 8px;">
  <h2 style="margin: 0 0 16px; font-size: 20px; color: #5eead4;">✓ Event Published to Community Hub</h2>
  <p style="font-size: 16px; font-weight: 600; color: #fff; margin: 0 0 8px;">${opts.eventTitle}</p>
  <p style="color: #999; font-size: 14px; margin: 0 0 24px;">This event has been approved and submitted to Oberlin Community Hub.</p>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
    <tr style="border-bottom: 1px solid #222;">
      <td style="padding: 10px 0; color: #999;">Community Hub Post ID</td>
      <td style="padding: 10px 0; text-align: right; color: #fff; font-family: monospace;">${opts.communityHubPostId}</td>
    </tr>
    ${opts.sourceUrl ? `<tr>
      <td style="padding: 10px 0; color: #999;">Original Source</td>
      <td style="padding: 10px 0; text-align: right;"><a href="${opts.sourceUrl}" style="color: #5eead4;">${opts.sourceUrl}</a></td>
    </tr>` : ""}
  </table>
  <a href="${chUrl}" style="display: inline-block; background: #5eead4; color: #111; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-right: 12px;">
    View on Community Hub
  </a>
  <a href="${baseUrl}/archive" style="display: inline-block; background: #222; color: #e8e8e8; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; border: 1px solid #333;">
    View in Archive
  </a>
</div>`;

  const text = `Published: "${opts.eventTitle}"\n\nThis event has been submitted to Oberlin Community Hub.\nPost ID: ${opts.communityHubPostId}\n\nView on Community Hub: ${chUrl}\nView in Archive: ${baseUrl}/archive`;

  await resend.emails.send({
    from: FROM,
    to: [opts.to],
    subject,
    html,
    text,
  });
}
