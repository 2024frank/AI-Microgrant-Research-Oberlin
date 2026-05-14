import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { ensureDefaultSources, getSource, updateSource } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  await ensureDefaultSources();
  const source = await getSource(id);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ source });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const updates = await req.json();
  await updateSource(id, updates);
  return NextResponse.json({ success: true });
}
