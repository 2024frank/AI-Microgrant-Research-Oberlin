import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { createUiChatSession, listUiChatSessions } from "@/lib/sourceBuilderUiChatsDb";
import { normalizeEmail } from "@/lib/userIds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  try {
    const email = req.nextUrl.searchParams.get("email");
    if (!email?.trim()) {
      return NextResponse.json({ error: "email query parameter is required" }, { status: 400 });
    }
    if (normalizeEmail(email.trim()) !== normalizeEmail(guard.actor.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const count = Number(req.nextUrl.searchParams.get("count") ?? 20);
    const sessions = await listUiChatSessions(email.trim(), count);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as { createdBy?: string; title?: string };
    if (!body.createdBy?.trim() || !body.title?.trim()) {
      return NextResponse.json({ error: "createdBy and title are required" }, { status: 400 });
    }
    if (normalizeEmail(body.createdBy.trim()) !== normalizeEmail(guard.actor.email)) {
      return NextResponse.json({ error: "createdBy must match signed-in user" }, { status: 403 });
    }
    const id = await createUiChatSession(body.createdBy.trim(), body.title.trim());
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create session" },
      { status: 500 }
    );
  }
}
