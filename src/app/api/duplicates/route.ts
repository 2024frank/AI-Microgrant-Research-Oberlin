import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { listDuplicateGroups, updateDuplicateGroup } from "@/lib/reviewStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  const groups = await listDuplicateGroups();
  return NextResponse.json({ groups });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await updateDuplicateGroup(body.id, body.updates ?? {});
  return NextResponse.json({ success: true });
}
