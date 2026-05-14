import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { saveFeedback } from "@/lib/feedback";
import { getReviewPost } from "@/lib/reviewStore";
import { validatePost } from "@/lib/postValidation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();
    const { postId, postTitle, decision, rejectionReason, postTypeId, eventType, aiConfidence, sourceName, learningSignal } = body;

    if (!postId || !decision) {
      return NextResponse.json({ error: "postId and decision are required" }, { status: 400 });
    }

    const post = await getReviewPost(postId);
    const validation = post ? validatePost(post) : null;

    await saveFeedback({
      postId,
      postTitle: postTitle ?? post?.title ?? "",
      decision,
      rejectionReason: rejectionReason || undefined,
      postTypeId: postTypeId ?? post?.postTypeId ?? [],
      eventType: eventType ?? post?.eventType ?? "ot",
      aiConfidence: aiConfidence ?? post?.aiConfidence ?? 0,
      sourceName: sourceName ?? post?.sourceName ?? "Unknown",
      postSnapshot: post ?? undefined,
      missingFields: validation?.missingFields,
      validationErrors: validation?.errors,
      learningSignal,
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
