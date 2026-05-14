import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { getSourceBuilderSession } from "@/lib/sourceBuilderAgent";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const session = await getSourceBuilderSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ session });
}
