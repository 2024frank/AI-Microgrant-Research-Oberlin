import { NextRequest, NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/adminAuthGuard";
import { clearProcessedEventIds, countProcessedEventIds } from "@/lib/reviewStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const count = await countProcessedEventIds();
    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to count processed ids" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const deleted = await clearProcessedEventIds();
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear processed ids" },
      { status: 500 }
    );
  }
}
