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
