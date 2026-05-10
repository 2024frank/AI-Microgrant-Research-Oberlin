import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Part, type FunctionCallPart, type Tool } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Source Builder AI for Civic Calendar, an event management platform at Oberlin College, Ohio. You help admins add new data sources to the pipeline.

CURRENT ARCHITECTURE:
- Sources feed events into a pipeline: Fetch → Extraction Agent (Gemini) → Editor Agent (Gemini) → Dedup Agent (Gemini) → Review Queue
- Events are normalized into: id, title, description, startTime, endTime, location, url, image, category
- The pipeline runs on Vercel serverless functions with auto-continuation for long runs
- Events go to Community Hub (oberlin.communityhub.cloud) after admin approval

YOUR CAPABILITIES:
1. Help users identify and configure new event sources (REST APIs, RSS feeds, iCal feeds, complex scrapers)
2. Probe URLs using the probe_url tool — call it immediately when you have a candidate URL
3. Generate source configs (JSON) OR custom TypeScript fetcher code — whichever fits the source
4. Suggest testing the config/code (user clicks Test button) to verify it pulls real events
5. Deploy working sources — saves to Firestore AND commits files to GitHub automatically

WHEN TO USE CUSTOM CODE vs JSON CONFIG:
- Use JSON config for: clean REST APIs with JSON, RSS feeds, iCal (.ics) feeds
- Use CUSTOM CODE for: HTML scraping, complex auth, unusual data formats, multi-step fetching, sources that need real JavaScript logic
- When in doubt or when the probe shows HTML/unusual format: write custom code

CUSTOM CODE FORMAT:
Write the function body (not the function signature) as a TypeScript/JavaScript async block.
The code has access to: fetch, URL, URLSearchParams, JSON, Date, maxEvents (number)
The code MUST return an array of objects with this shape:
  { id, title, description, startTime (unix seconds), endTime?, location?, url?, image?, category?, sourceName, sourceUrl }

Example custom code for an HTML page with events:
\`\`\`typescript
const res = await fetch("https://example.com/events", {
  headers: { "User-Agent": "CivicCalendar/1.0" }
});
const html = await res.text();

// Extract events with regex or string parsing
const events = [];
const matches = html.matchAll(/<div class="event"[^>]*>.*?<h2>(.*?)<\/h2>.*?<time[^>]*datetime="([^"]+)"[^>]*>.*?<\/div>/gs);
for (const [, title, dateStr] of matches) {
  events.push({
    id: title.toLowerCase().replace(/\s+/g, "-"),
    title: title.trim(),
    description: "",
    startTime: Math.floor(new Date(dateStr).getTime() / 1000),
    endTime: null,
    location: null,
    url: "https://example.com/events",
    image: null,
    category: null,
    sourceName: "Example Events",
    sourceUrl: "https://example.com/events",
  });
}
return events.slice(0, maxEvents);
\`\`\`

Then include a JSON config block with type "custom_code":
\`\`\`json
{
  "id": "example-events",
  "name": "Example Events",
  "description": "Events from example.com",
  "type": "custom_code",
  "schedule": "daily",
  "scheduleHour": 6
}
\`\`\`

PROBING STRATEGY — BE PROACTIVE:
- When someone mentions a source by name, immediately try likely URLs. Don't ask the user to go find it.
- For libraries: try /events, /calendar, /events.rss, /calendar.ics patterns on the main domain
- For city/gov sites: try /events, /calendar, then look for Municode, CivicPlus, or Granicus platforms
- For universities: try /events, /calendar, /news, or look for 25Live, Localist, Trumba patterns
- Common iCal feeds: URLs ending in .ics or /feed/ical
- Common RSS: /feed, /rss, /events.rss, /news.rss
- Try 2-3 URL patterns before asking the user to provide one
- If a probe returns an error, try a different URL variation — don't give up after one try

WHEN HELPING WITH A NEW SOURCE:
1. User mentions a source name → immediately call probe_url on 1-3 likely URLs
2. Based on probe results, generate a source config with correct field mappings
3. Present the config and tell the user to click "Test" to verify
4. If test looks good, tell them to click "Deploy"

SOURCE CONFIG FORMAT:
{
  "id": "kebab-case-id",
  "name": "Human readable name",
  "description": "What this source provides",
  "type": "rest_api" | "ical" | "rss",
  "enabled": true,
  "url": "https://api.example.com/events",
  "method": "GET",
  "headers": {},
  "params": { "limit": "100" },
  "pagination": { "type": "page", "paramName": "page", "startValue": 0, "increment": 1, "maxPages": 5 },
  "responsePath": "data.events",
  "fieldMappings": {
    "id": "id",
    "title": "title",
    "description": "description",
    "startTime": "start_date",
    "endTime": "end_date",
    "location": "venue.name",
    "url": "url",
    "image": "photo_url",
    "category": "event_type"
  },
  "filters": { "excludePatterns": ["athletic", "varsity"] },
  "schedule": "daily",
  "scheduleHour": 6
}

The responsePath uses dot notation to navigate JSON to find the events array.
The fieldMappings use dot notation to extract values from each event object.
For iCal/RSS sources, omit responsePath and fieldMappings — they are parsed natively.

EXISTING SOURCE: Localist (calendar.oberlin.edu) - already integrated.

Be concise and action-oriented. Probe first, ask questions later.`;

// Probe a URL server-side (same logic as /api/source-builder/probe)
async function executeProbe(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json, text/html, application/rss+xml, text/calendar" },
      signal: AbortSignal.timeout(8000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const status = res.status;

    if (!res.ok) {
      return { status, contentType, error: `HTTP ${status}`, body: (await res.text()).slice(0, 500) };
    }

    if (contentType.includes("json")) {
      const data = await res.json() as unknown;
      const sample = JSON.stringify(data, null, 2).slice(0, 2000);
      const keys = typeof data === "object" && data !== null ? Object.keys(data as object) : [];
      return { status, contentType: "json", topLevelKeys: keys, sample };
    }

    if (contentType.includes("xml") || contentType.includes("rss") || contentType.includes("atom") || url.includes("rss") || url.includes("feed")) {
      const text = await res.text();
      const hasItems = text.includes("<item>") || text.includes("<entry>");
      return { status, contentType: "rss/xml", hasItems, sample: text.slice(0, 1500) };
    }

    if (contentType.includes("calendar") || url.endsWith(".ics")) {
      const text = await res.text();
      const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
      return { status, contentType: "ical", eventCount, sample: text.slice(0, 1000) };
    }

    const text = await res.text();
    // Look for feed links in HTML
    const icalLink = text.match(/href="([^"]*\.ics[^"]*)"/)?.[1];
    const rssLink = text.match(/type="application\/rss\+xml"[^>]*href="([^"]*)"/)?.[1];
    return { status, contentType: "html", icalLink, rssLink, note: "HTML page — look for icalLink or rssLink", sample: text.slice(0, 800) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Probe failed" };
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No Gemini key" }, { status: 500 });

  const { messages, sessionId } = await req.json();
  if (!messages?.length) return NextResponse.json({ error: "Messages required" }, { status: 400 });

  const client = new GoogleGenerativeAI(apiKey);

  const tools: Tool[] = [
    {
      functionDeclarations: [
        {
          name: "probe_url",
          description: "Probe a URL to discover what kind of API, RSS feed, or iCal it serves. Call this proactively when you have a candidate URL — try multiple patterns if needed.",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              url: {
                type: SchemaType.STRING,
                description: "The URL to probe",
                nullable: false,
              } as never,
            },
            required: ["url"],
          },
        },
      ],
    },
  ];

  const model = client.getGenerativeModel({ model: "gemini-2.5-flash", tools });

  const chatHistory = messages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const lastMsg = chatHistory.pop();

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "I'm ready to help you add a new data source. Tell me what source you want — I'll probe it and build the config." }] },
      ...chatHistory,
    ],
  });

  // Function-calling loop — Gemini may call probe_url one or more times before giving a text reply
  const probeResults: Array<{ url: string; result: Record<string, unknown> }> = [];
  let response = await chat.sendMessage(lastMsg.parts[0].text);

  for (let round = 0; round < 5; round++) {
    const parts: Part[] = response.response.candidates?.[0]?.content?.parts ?? [];
    const functionCalls = parts.filter((p): p is FunctionCallPart => "functionCall" in p && p.functionCall != null);

    if (functionCalls.length === 0) break; // No more function calls — we have the final text reply

    // Execute all function calls in parallel
    const functionResponses = await Promise.all(
      functionCalls.map(async (part) => {
        const call = part.functionCall;
        if (call.name === "probe_url") {
          const url = (call.args as { url: string }).url;
          const result = await executeProbe(url);
          probeResults.push({ url, result });
          return {
            functionResponse: {
              name: "probe_url",
              response: result,
            },
          };
        }
        return null;
      })
    );

    const validResponses = functionResponses.filter(Boolean);
    if (validResponses.length === 0) break;

    // Send function results back to Gemini
    response = await chat.sendMessage(validResponses as Parameters<typeof chat.sendMessage>[0]);
  }

  const text = response.response.text();

  // Extract JSON config
  let generatedConfig = null;
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      generatedConfig = JSON.parse(jsonMatch[1]);
    } catch { /* not valid json */ }
  }

  // Extract custom TypeScript/JavaScript code block
  let generatedCode: string | null = null;
  const codeMatch = text.match(/```(?:typescript|javascript|ts|js)\s*([\s\S]*?)```/);
  if (codeMatch) {
    generatedCode = codeMatch[1].trim();
  }

  // If code was generated, mark the config as custom_code type
  if (generatedCode && generatedConfig) {
    generatedConfig.type = "custom_code";
  }

  return NextResponse.json({
    reply: text,
    generatedConfig,
    generatedCode,
    probeResults,
    sessionId,
  });
}
