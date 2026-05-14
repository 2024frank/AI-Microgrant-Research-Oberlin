import { NextRequest, NextResponse } from "next/server";
import { insertTeamChatMessage, listTeamChatMessages } from "@/lib/teamChatDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const rows = await listTeamChatMessages(limit);
    return NextResponse.json({ messages: rows.slice().reverse() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      text?: string;
      senderEmail?: string;
      senderName?: string;
      senderPhoto?: string | null;
      mentions?: string[];
    };
    if (!body.text?.trim() || !body.senderEmail?.trim()) {
      return NextResponse.json({ error: "text and senderEmail are required" }, { status: 400 });
    }
    const message = await insertTeamChatMessage({
      text: body.text.trim(),
      senderEmail: body.senderEmail.trim(),
      senderName: body.senderName?.trim() || body.senderEmail.trim(),
      senderPhoto: body.senderPhoto ?? null,
      mentions: Array.isArray(body.mentions) ? body.mentions : [],
    });
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send message" },
      { status: 500 }
    );
  }
}
