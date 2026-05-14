import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import {
  appendUiChatMessage,
  getUiChatSession,
  updateUiChatTitle,
  type UiChatMsg,
} from "@/lib/sourceBuilderUiChatsDb";
import { normalizeEmail } from "@/lib/userIds";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const session = await getUiChatSession(id);
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (normalizeEmail(session.createdBy) !== normalizeEmail(guard.actor.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load session" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const existing = await getUiChatSession(id);
    if (!existing || normalizeEmail(existing.createdBy) !== normalizeEmail(guard.actor.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      action?: string;
      message?: UiChatMsg;
      title?: string;
    };

    if (body.action === "append" && body.message && typeof body.message.content === "string") {
      await appendUiChatMessage(id, body.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "title" && typeof body.title === "string") {
      await updateUiChatTitle(id, body.title);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action or payload" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update session" },
      { status: 500 }
    );
  }
}
