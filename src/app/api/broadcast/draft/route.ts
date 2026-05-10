import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No Gemini key" }, { status: 500 });

  const { prompt } = await req.json();
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent(`You are an admin for the Civic Calendar platform at Oberlin College. The Civic Calendar is an AI-powered community event management system that ingests events from Oberlin's calendar, processes them through AI agents, and publishes them to the Community Hub for public display on screens around the city.

Write a professional team announcement email based on this request:

"${prompt}"

Requirements:
- Warm, professional tone — you're writing to your team of reviewers and admins
- Clear and concise
- If announcing a new feature, explain what it does and how to use it
- Sign off as "The Civic Calendar Team"

Respond with ONLY valid JSON:
{
  "subject": "short email subject line",
  "body": "the email body text (use \\n for line breaks, no HTML)"
}`);

  const text = result.response.text();
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
