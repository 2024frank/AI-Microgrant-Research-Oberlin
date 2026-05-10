import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LocalistEvent } from "./localist";

const MODEL = "gemini-2.5-flash";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
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

const EDITOR_PROMPT = `You are an editor agent for a civic community calendar. Events from this calendar are displayed on public screens in Oberlin, Ohio.

Your job is to write two display-ready descriptions for this event. These will appear on a community screen — NOT in an email or web page.

RULES:
- NO raw URLs, NO website links, NO "More info at:", NO "Register at:", NO "click here"
- NO clipboard-style text like "copy this link"
- Short description: 1-2 engaging sentences, max 200 characters. Hook the reader.
- Extended description: 3-5 informative sentences, max 1000 characters. Give rich context.
- Tone: warm, civic, public-facing — like a community bulletin board
- The writing should naturally reflect the event type (e.g., workshop/lecture/concert/exhibit)
- Do NOT mention the source or that this is from a calendar
- Write in present tense or future tense only

EVENT TITLE: {TITLE}
EVENT TYPE IDs: {POST_TYPE_IDS}
RAW DESCRIPTION: {RAW_DESCRIPTION}
LOCATION: {LOCATION}

Respond with ONLY valid JSON, no markdown:
{
  "description": "string (max 200 chars)",
  "extendedDescription": "string (max 1000 chars)"
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

  const result = await model.generateContent(prompt);
  const text = result.response.text();

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

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = parseJson<EditorResult>(text);
    parsed.description = parsed.description.slice(0, 200);
    parsed.extendedDescription = parsed.extendedDescription.slice(0, 1000);
    return parsed;
  } catch {
    const fallback = (rawEvent.description_text || rawEvent.description || "")
      .replace(/<[^>]*>/g, "")
      .replace(/More info:.*$/i, "")
      .trim()
      .slice(0, 200);
    return {
      description: fallback || extraction.title,
      extendedDescription: fallback || extraction.title,
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
