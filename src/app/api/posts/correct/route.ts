import { NextRequest, NextResponse } from "next/server";
import { runCorrectionAgent } from "@/lib/gemini";
import { saveAiLearningEvent, saveFeedback } from "@/lib/feedback";
import { getReviewPost, updateReviewPost } from "@/lib/reviewStore";
import { validatePost } from "@/lib/postValidation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const postId = String(body.postId ?? "");
    const reason = String(body.reason ?? "").trim();

    if (!postId || !reason) {
      return NextResponse.json(
        { error: "postId and reason are required" },
        { status: 400 }
      );
    }

    const post = await getReviewPost(postId);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const validation = validatePost(post);
    await saveFeedback({
      postId,
      postTitle: post.title,
      decision: "needs_correction",
      rejectionReason: reason,
      postTypeId: post.postTypeId,
      eventType: post.eventType,
      aiConfidence: post.aiConfidence ?? 0,
      sourceName: post.sourceName,
      postSnapshot: post,
      missingFields: validation.missingFields,
      validationErrors: validation.errors,
      learningSignal: "human_requested_correction",
      reviewedAt: Date.now(),
    });

    const correction = await runCorrectionAgent(post, reason);
    const nextMetadata = {
      ...post.extractedMetadata,
      notes: [
        post.extractedMetadata.notes,
        `Correction feedback: ${reason}`,
        `Gemini correction: ${correction.notes}`,
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const updates = {
      description: correction.description,
      extendedDescription: correction.extendedDescription,
      status: "pending" as const,
      rejectionReason: "",
      extractedMetadata: nextMetadata,
    };

    await updateReviewPost(postId, updates);
    const updated = await getReviewPost(postId);

    await saveAiLearningEvent({
      postId,
      postTitle: post.title,
      signal: "ai_corrected_and_requeued",
      reason,
      sourceName: post.sourceName,
      aiConfidence: post.aiConfidence,
      before: post,
      after: updated ?? updates,
      missingFields: validation.missingFields,
      validationErrors: validation.errors,
    });

    return NextResponse.json({ post: updated, correction });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Correction failed" },
      { status: 500 }
    );
  }
}
