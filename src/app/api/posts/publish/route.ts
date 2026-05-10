import { NextRequest, NextResponse } from "next/server";
import { getReviewPost, updateReviewPost } from "@/lib/reviewStore";
import { submitToCommunityHub } from "@/lib/communityHub";
import { sendPublishConfirmationEmail } from "@/lib/emailServer";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "fkusiapp@oberlin.edu";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId } = body;

    if (!postId) {
      return NextResponse.json({ error: "postId is required" }, { status: 400 });
    }

    const post = await getReviewPost(postId);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved posts can be published" },
        { status: 400 }
      );
    }

    const result = await submitToCommunityHub(post, ADMIN_EMAIL);

    if (!result.success) {
      // Strip HTML from error pages returned by Community Hub
      const raw = result.error ?? "Community Hub submission failed";
      const clean = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
      return NextResponse.json(
        { error: clean || "Community Hub returned an error. Check required fields." },
        { status: 502 }
      );
    }

    await updateReviewPost(postId, {
      status: "published",
      communityHubPostId: result.id,
    });

    // Send confirmation email to account holder
    sendPublishConfirmationEmail({
      to: ADMIN_EMAIL,
      eventTitle: post.title,
      communityHubPostId: result.id ?? "",
      sourceUrl: post.sourceUrl,
    }).catch(() => {/* non-blocking */});

    return NextResponse.json({ success: true, communityHubPostId: result.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: 500 }
    );
  }
}
