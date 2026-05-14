import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LocalistEvent } from "./localist";
import type { ReviewPost } from "./postTypes";

const MODEL = "gemini-2.5-flash";
const ADMIN_EMAIL = "fkusiapp@oberlin.edu";

let quotaAlertSent = false;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource exhausted")
    || msg.includes("429") || msg.includes("too many requests");
}

async function sendQuotaAlertEmail(agentName: string, errorMessage: string) {
  if (quotaAlertSent) return;
  quotaAlertSent = true;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://ai-microgrant-research-oberlin.vercel.app").replace(/\/$/, "");

    await resend.emails.send({
      from: "Civic Calendar <noreply@uhurued.com>",
      to: [ADMIN_EMAIL],
      subject: "Gemini API quota exceeded — Pipeline paused",
      html: `
<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e8e8e8; background: #111; border-radius: 8px; overflow: hidden;">
  <div style="background: #dc2626; padding: 20px 32px;">
    <h1 style="margin: 0; font-size: 16px; color: #fff;">Civic Calendar — Alert</h1>
  </div>
  <div style="padding: 28px 32px;">
    <h2 style="margin: 0 0 12px; font-size: 18px; color: #fca5a5;">Gemini API Quota Exceeded</h2>
    <p style="font-size: 14px; color: #ccc; line-height: 1.6; margin: 0 0 16px;">
      The <strong style="color: #fff;">${agentName}</strong> hit the Gemini API rate limit. The pipeline will skip AI processing for remaining events until the quota resets.
    </p>
    <div style="background: #1a1a1a; border-left: 3px solid #dc2626; padding: 12px 16px; border-radius: 4px; margin: 0 0 20px;">
      <p style="font-size: 13px; color: #999; margin: 0; font-family: monospace; word-break: break-all;">${errorMessage.replace(/</g, "&lt;").slice(0, 300)}</p>
    </div>
    <p style="font-size: 14px; color: #999; line-height: 1.6; margin: 0 0 20px;">
      <strong style="color: #e8e8e8;">What to do:</strong><br>
      • Wait for the quota to reset (usually within an hour)<br>
      • Check your Google AI Studio billing/quota page<br>
      • Re-run the pipeline after the quota resets
    </p>
    <a href="${baseUrl}/sources" style="display: inline-block; background: #a6192e; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">View Sources →</a>
  </div>
  <div style="border-top: 1px solid #222; padding: 16px 32px; text-align: center;">
    <p style="margin: 0; font-size: 11px; color: #444;">Civic Calendar · Oberlin, Ohio</p>
  </div>
</div>`,
      text: `Gemini API Quota Exceeded\n\nThe ${agentName} hit the rate limit.\nError: ${errorMessage.slice(0, 300)}\n\nWait for the quota to reset, then re-run the pipeline.\n\n${baseUrl}/sources`,
    });
  } catch { /* don't fail pipeline over email */ }
}

export class GeminiQuotaError extends Error {
  constructor(agentName: string, originalError: string) {
    super(`Gemini quota exceeded in ${agentName}: ${originalError}`);
    this.name = "GeminiQuotaError";
  }
}

export type ExtractionResult = {
  eventType: "ot" | "an";
  title: string;
  postTypeId: number[];
  isAthletic: boolean;
  sponsors: string[];
  locationType: "ph2" | "on" | "bo" | "ne";
  location: string | null;
  urlLink: string | null;
  sessions: { startTime: number; endTime: number }[];
  website: string | null;
  image_cdn_url: string | null;
  calendarSourceName: string;
  calendarSourceUrl: string;
  confidence: number;
};

export type EditorResult = {
  description: string;
  extendedDescription: string;
};

export type CorrectionResult = EditorResult & {
  notes: string;
};

const EXTRACTION_PROMPT = `You are an extraction agent for a civic calendar admin tool. Given this raw event from Oberlin College's Localist calendar, normalize it into a structured Community Hub post.

POST TYPE IDs — choose the most fitting (you may select multiple, return as array):
0=City Government
1=Ecolympics or Environmental
2=Exhibit
3=Fair, Festival, or Public Celebration
4=Film
5=Music Performance
6=Networking Event
7=Participatory Sport or Game
8=Presentation or Lecture
9=Spectator Sport
10=Theatre or Dance
11=Tour, Walking Tours or Open House
12=Volunteer Opportunity
13=Workshop or Class
14=Other

LOCATION TYPES:
"ph2" = physical location only (address provided, no online link)
"on" = online only (zoom/stream link, no physical address)
"bo" = both physical and online (hybrid)
"ne" = neither (announcement with no venue)

EVENT TYPE:
"ot" = a time-bound event with a specific start time
"an" = an announcement or news item (use same startTime and endTime)

RULES:
- isAthletic=true if event_types or title include athletic/varsity/sport/fitness keywords
- sponsors: use departments from filters, default to ["Oberlin College"] if empty
- sessions: convert ISO-8601 dates to Unix epoch in SECONDS (not milliseconds)
- if endTime is null, set endTime = startTime + 7200 (2 hours)
- calendarSourceName is always "Oberlin College Calendar"
- calendarSourceUrl is always the event URL from the data
- confidence: 0.0-1.0 score reflecting how certain you are about the classification
- title: use the event title as-is (do not rewrite it)
- Do not invent sponsors, times, locations, or links that are not clearly supported by the raw event text or structured fields.

RAW EVENT:
{EVENT_JSON}

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "eventType": "ot",
  "title": "string",
  "postTypeId": [8],
  "isAthletic": false,
  "sponsors": ["Oberlin College"],
  "locationType": "ph2",
  "location": "string or null",
  "urlLink": "string or null",
  "sessions": [{"startTime": 1714492800, "endTime": 1714500000}],
  "website": "string or null",
  "image_cdn_url": "string or null",
  "calendarSourceName": "Oberlin College Calendar",
  "calendarSourceUrl": "https://calendar.oberlin.edu/event/12345",
  "confidence": 0.92
}`;

const EDITOR_PROMPT = `You are a careful copy editor for a civic community calendar. Events appear on public screens in Oberlin, Ohio.

Your job is to produce an extended description with MINIMAL departure from the organizer's wording. Prefer selecting useful original sentences, trimming clutter, and preserving meaning over rewriting.
For the short description, you MUST use the exact event title. Do not invent or summarize for the short description, just return the title verbatim.

FAITHFULNESS (critical):
- Stay anchored to the RAW DESCRIPTION facts; do not invent details, anecdotes, "moments," emotional beats, or narrative flourishes.
- Use the RAW DESCRIPTION's own phrases and sentences whenever they are clear enough.
- If you must edit a sentence, make the smallest possible edit for length, grammar, or removing links.
- Do not speculate about audience experience, impact, or why someone should attend unless the raw text already says so plainly.
- Preserve the organizer's voice and level of formality when reasonable.
- If the raw description is thin, keep the copy short and factual rather than padding with generic hype.
- Avoid hype words like "don't miss," "incredible," "thrilling," "unique opportunity," "join us for an unforgettable," unless those exact claims appear in the original description.

STYLE RULES:
- NO raw URLs, NO website links, NO "More info at:", NO "Register at:", NO "click here"
- NO clipboard-style text like "copy this link"
- Short description: MUST be EXACTLY the event title provided as {TITLE}. Max 200 chars.
- Extended description: up to 4 sentences, max 1000 characters. Add structure only where it clarifies information already implied by the raw text.
- Tone: warm, civic, public-facing — but restrained, not promotional fiction
- Reflect the event type lightly (workshop/lecture/concert) without overwriting specifics
- Do NOT mention the source or that this is from a calendar
- Write in present tense or future tense only

EVENT TITLE: {TITLE}
EVENT TYPE IDs: {POST_TYPE_IDS}
RAW DESCRIPTION: {RAW_DESCRIPTION}
LOCATION: {LOCATION}

Respond with ONLY valid JSON, no markdown:
{
  "description": "exact event title here (max 200 chars)",
  "extendedDescription": "string (max 1000 chars)"
}`;

const CORRECTION_PROMPT = `You are correcting a civic calendar post after a human reviewer found a problem.

Your task is to revise ONLY the short and extended descriptions. Do not change the title, dates, source, location, sponsors, or category.

HUMAN REVIEWER FEEDBACK:
{REASON}

STRICT RULES:
- Stay truthful to the original description.
- Prefer lifting useful sentences or phrases from ORIGINAL DESCRIPTION.
- Remove invented claims, hype, exaggeration, and unsupported specificity.
- If the reviewer says the copy is too spicy/promotional, make it plain and factual.
- Short description: max 200 characters.
- Extended description: max 1000 characters.
- No raw URLs, "click here", "register at", or source/calendar mentions.

CURRENT SHORT DESCRIPTION:
{CURRENT_DESCRIPTION}

CURRENT EXTENDED DESCRIPTION:
{CURRENT_EXTENDED_DESCRIPTION}

ORIGINAL DESCRIPTION:
{ORIGINAL_DESCRIPTION}

TITLE:
{TITLE}

Respond with ONLY valid JSON:
{
  "description": "string",
  "extendedDescription": "string",
  "notes": "brief explanation of what changed"
}`;

function parseJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as T;
}

export async function runExtractionAgent(
  event: LocalistEvent
): Promise<ExtractionResult> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });

  const prompt = EXTRACTION_PROMPT.replace(
    "{EVENT_JSON}",
    JSON.stringify(event, null, 2)
  );

  let text: string;
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text();
  } catch (err) {
    if (isQuotaError(err)) {
      await sendQuotaAlertEmail("Extraction Agent", err instanceof Error ? err.message : String(err));
      throw new GeminiQuotaError("Extraction Agent", err instanceof Error ? err.message : String(err));
    }
    throw err;
  }

  try {
    const parsed = parseJson<ExtractionResult>(text);
    parsed.calendarSourceName = "Oberlin College Calendar";
    parsed.calendarSourceUrl =
      event.url || `https://calendar.oberlin.edu/event/${event.id}`;
    return parsed;
  } catch {
    return {
      eventType: "ot",
      title: event.title,
      postTypeId: [14],
      isAthletic: false,
      sponsors: ["Oberlin College"],
      locationType: event.address ? "ph2" : "ne",
      location: event.address || null,
      urlLink: event.ticket_url || null,
      sessions: (event.event_instances ?? []).slice(0, 1).map((inst) => ({
        startTime: Math.floor(
          new Date(inst.event_instance.start).getTime() / 1000
        ),
        endTime: inst.event_instance.end
          ? Math.floor(new Date(inst.event_instance.end).getTime() / 1000)
          : Math.floor(
              new Date(inst.event_instance.start).getTime() / 1000
            ) + 7200,
      })),
      website: event.url || null,
      image_cdn_url: event.photo_url || null,
      calendarSourceName: "Oberlin College Calendar",
      calendarSourceUrl:
        event.url || `https://calendar.oberlin.edu/event/${event.id}`,
      confidence: 0.4,
    };
  }
}

export async function runEditorAgent(
  extraction: ExtractionResult,
  rawEvent: LocalistEvent
): Promise<EditorResult> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });
  const shortDescription = extraction.title.trim().slice(0, 200);

  const { COMMUNITY_HUB_POST_TYPES } = await import("./postTypes");
  const typeLabels = extraction.postTypeId
    .map((id) => COMMUNITY_HUB_POST_TYPES[id] ?? "Other")
    .join(", ");

  const prompt = EDITOR_PROMPT.replace("{TITLE}", extraction.title)
    .replace("{POST_TYPE_IDS}", typeLabels)
    .replace(
      "{RAW_DESCRIPTION}",
      rawEvent.description_text || rawEvent.description || "No description provided."
    )
    .replace("{LOCATION}", extraction.location || "No physical location");

  let text: string;
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text();
  } catch (err) {
    if (isQuotaError(err)) {
      await sendQuotaAlertEmail("Editor Agent", err instanceof Error ? err.message : String(err));
      throw new GeminiQuotaError("Editor Agent", err instanceof Error ? err.message : String(err));
    }
    throw err;
  }

  try {
    const parsed = parseJson<EditorResult>(text);
    parsed.description = shortDescription;
    parsed.extendedDescription = parsed.extendedDescription.slice(0, 1000);
    return parsed;
  } catch {
    const fallback = (rawEvent.description_text || rawEvent.description || "")
      .replace(/<[^>]*>/g, "")
      .replace(/More info:.*$/i, "")
      .trim()
      .slice(0, 1000);
    return {
      description: shortDescription,
      extendedDescription: fallback || shortDescription,
    };
  }
}

export type DedupCheckResult = {
  isDuplicate: boolean;
  matchedTitle: string | null;
  matchedId: string | null;
  reason: string;
  confidence: number;
};

const DEDUP_PROMPT = `You are a duplicate detection agent for a civic community calendar in Oberlin, Ohio.

Given a NEW EVENT and a list of EXISTING EVENTS already published on the Community Hub, determine if the new event is a duplicate of any existing event.

Two events are duplicates if they are essentially the same event, even if the titles or descriptions differ slightly. Consider:
- Same event with different wording (e.g. "Piano Recital" vs "Piano Concert")
- Same event with slightly different times (within a few hours)
- Same recurring event on the same date
- Same event posted by different departments

They are NOT duplicates if:
- They are different sessions of a recurring event on different dates
- They are genuinely different events at the same venue
- They have similar names but are clearly different events

NEW EVENT:
{NEW_EVENT}

EXISTING COMMUNITY HUB EVENTS (showing title, startTime, location):
{EXISTING_EVENTS}

Respond with ONLY valid JSON:
{
  "isDuplicate": true/false,
  "matchedTitle": "title of the matching existing event or null",
  "matchedId": "id of the matching existing event or null",
  "reason": "brief explanation",
  "confidence": 0.0-1.0
}`;

export async function runDedupAgent(
  newEvent: { title: string; startTime?: number; location?: string; description?: string },
  existingEvents: Array<{ id: string; title: string; startTime?: number; location?: string }>
): Promise<DedupCheckResult> {
  if (existingEvents.length === 0) {
    return { isDuplicate: false, matchedTitle: null, matchedId: null, reason: "No existing events to compare", confidence: 1.0 };
  }

  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });

  const newEventStr = JSON.stringify({
    title: newEvent.title,
    startTime: newEvent.startTime ? new Date(newEvent.startTime * 1000).toISOString() : null,
    location: newEvent.location ?? null,
    description: (newEvent.description ?? "").slice(0, 300),
  });

  const existingStr = JSON.stringify(
    existingEvents.slice(0, 100).map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime ? new Date(e.startTime * 1000).toISOString() : null,
      location: e.location ?? null,
    }))
  );

  const prompt = DEDUP_PROMPT
    .replace("{NEW_EVENT}", newEventStr)
    .replace("{EXISTING_EVENTS}", existingStr);

  let text: string;
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text();
  } catch (err) {
    if (isQuotaError(err)) {
      await sendQuotaAlertEmail("Dedup Agent", err instanceof Error ? err.message : String(err));
      throw new GeminiQuotaError("Dedup Agent", err instanceof Error ? err.message : String(err));
    }
    throw err;
  }

  try {
    return parseJson<DedupCheckResult>(text);
  } catch {
    return { isDuplicate: false, matchedTitle: null, matchedId: null, reason: "Failed to parse AI response", confidence: 0 };
  }
}

export async function runCorrectionAgent(
  post: ReviewPost,
  reviewerReason: string
): Promise<CorrectionResult> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL });
  const original =
    post.originalDescription || post.extendedDescription || post.description || post.title;

  const prompt = CORRECTION_PROMPT.replace("{REASON}", reviewerReason)
    .replace("{CURRENT_DESCRIPTION}", post.description || "")
    .replace("{CURRENT_EXTENDED_DESCRIPTION}", post.extendedDescription || "")
    .replace("{ORIGINAL_DESCRIPTION}", original)
    .replace("{TITLE}", post.title);

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = parseJson<CorrectionResult>(text);
    return {
      description: parsed.description.slice(0, 200),
      extendedDescription: parsed.extendedDescription.slice(0, 1000),
      notes:
        parsed.notes?.slice(0, 500) ||
        "AI revised the descriptions from reviewer feedback.",
    };
  } catch {
    return {
      description: post.description,
      extendedDescription: post.extendedDescription || post.description,
      notes: "AI correction failed to parse; original descriptions were kept.",
    };
  }
}

export async function runAgentsBatch(
  events: LocalistEvent[]
): Promise<
  Array<{ extraction: ExtractionResult; editor: EditorResult } | null>
> {
  const BATCH_SIZE = 5;
  const results: Array<{
    extraction: ExtractionResult;
    editor: EditorResult;
  } | null> = [];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (event) => {
        try {
          const extraction = await runExtractionAgent(event);
          const editor = await runEditorAgent(extraction, event);
          return { extraction, editor };
        } catch {
          return null;
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}
