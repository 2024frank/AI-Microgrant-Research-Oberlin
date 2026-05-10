import { NextRequest, NextResponse } from "next/server";
import { saveFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, postTitle, decision, rejectionReason, postTypeId, eventType, aiConfidence, sourceName } = body;

    if (!postId || !decision) {
      return NextResponse.json({ error: "postId and decision are required" }, { status: 400 });
    }

    await saveFeedback({
      postId,
      postTitle: postTitle ?? "",
      decision,
      rejectionReason: rejectionReason || undefined,
      postTypeId: postTypeId ?? [],
      eventType: eventType ?? "ot",
      aiConfidence: aiConfidence ?? 0,
      sourceName: sourceName ?? "Unknown",
      reviewedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save feedback" },
      { status: 500 }
    );
  }
}
