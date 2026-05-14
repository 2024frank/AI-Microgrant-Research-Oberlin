import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { getReviewPostStats } from "@/lib/reviewStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  const stats = await getReviewPostStats();
  return NextResponse.json(stats);
}
