import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { insertTeamChatMessage, listTeamChatMessages } from "@/lib/teamChatDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

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
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as {
      text?: string;
      mentions?: string[];
    };
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const senderEmail = guard.actor.email;
    const senderName = guard.actor.displayName?.trim() || senderEmail;
    const message = await insertTeamChatMessage({
      text: body.text.trim(),
      senderEmail,
      senderName,
      senderPhoto: guard.actor.photoURL ?? null,
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
