import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { ensureDefaultSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  await ensureDefaultSources();
  return NextResponse.json({ success: true });
}
