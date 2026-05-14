import { NextRequest, NextResponse } from "next/server";
import {
  listSourceBuilderSessions,
  runSourceBuilderAgent,
} from "@/lib/sourceBuilderAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const sessions = await listSourceBuilderSessions(20);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Source Builder runs" },
      { status: 500 }
    );
  }
}

/** Used only when the client sends acknowledgeEmptyPrompt (explicit human bypass in UI). */
const EMPTY_PROMPT_BYPASS_TEXT =
  "[Human bypass: empty brief] Run a concise audit of the current Oberlin Civic Calendar source setup and suggest the next integration step.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let prompt = String(body.prompt ?? "").trim();
    const acknowledgeEmptyPrompt = body.acknowledgeEmptyPrompt === true;
    if (!prompt) {
      if (!acknowledgeEmptyPrompt) {
        return NextResponse.json({ error: "prompt is required" }, { status: 400 });
      }
      prompt = EMPTY_PROMPT_BYPASS_TEXT;
    }

    const session = await runSourceBuilderAgent(prompt);
    return NextResponse.json({ session }, { status: session.status === "failed" ? 500 : 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Source Builder failed" },
      { status: 500 }
    );
  }
}
