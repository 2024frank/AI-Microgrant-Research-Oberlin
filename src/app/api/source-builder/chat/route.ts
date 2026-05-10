import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Source Builder AI for Civic Calendar, an event management platform at Oberlin College, Ohio. You help admins add new data sources to the pipeline.

CURRENT ARCHITECTURE:
- Sources feed events into a pipeline: Fetch → Extraction Agent (Gemini) → Editor Agent (Gemini) → Dedup Agent (Gemini) → Review Queue
- Events are normalized into: id, title, description, startTime, endTime, location, url, image, category
- The pipeline runs on Vercel serverless functions with auto-continuation for long runs
- Events go to Community Hub (oberlin.communityhub.cloud) after admin approval

YOUR CAPABILITIES:
1. Help users identify and configure new event sources (REST APIs, RSS feeds, iCal feeds)
2. Probe URLs to understand their API structure
3. Generate source configurations with field mappings
4. Test configurations by fetching real data
5. Deploy working sources into the pipeline

WHEN HELPING WITH A NEW SOURCE:
1. Ask what source they want to add (URL, name, what kind of events)
2. Suggest probing the URL to discover the API structure
3. Based on the response, generate a source config with correct field mappings
4. Suggest testing the config to verify it works
5. If the test looks good, offer to deploy it

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

The responsePath uses dot notation to navigate the JSON response to find the events array.
The fieldMappings use dot notation to extract values from each event object.

EXISTING SOURCE: Localist (calendar.oberlin.edu) - already integrated as a hardcoded source.

Be concise and practical. When you have enough info, generate the config and suggest testing it. Don't ask too many questions — be proactive.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No Gemini key" }, { status: 500 });

  const { messages, sessionId } = await req.json();
  if (!messages?.length) return NextResponse.json({ error: "Messages required" }, { status: 400 });

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  const chatHistory = messages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  // The last message is the user's new message
  const lastMsg = chatHistory.pop();

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "I'm ready to help you add a new data source to Civic Calendar. What source would you like to integrate?" }] },
      ...chatHistory,
    ],
  });

  const result = await chat.sendMessage(lastMsg.parts[0].text);
  const text = result.response.text();

  // Check if the AI generated a source config (JSON block in response)
  let generatedConfig = null;
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      generatedConfig = JSON.parse(jsonMatch[1]);
    } catch { /* not valid json */ }
  }

  return NextResponse.json({
    reply: text,
    generatedConfig,
    sessionId,
  });
}
