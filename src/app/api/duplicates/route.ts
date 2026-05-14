import { NextRequest, NextResponse } from "next/server";
import { listDuplicateGroups, updateDuplicateGroup } from "@/lib/reviewStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await listDuplicateGroups();
  return NextResponse.json({ groups });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await updateDuplicateGroup(body.id, body.updates ?? {});
  return NextResponse.json({ success: true });
}
