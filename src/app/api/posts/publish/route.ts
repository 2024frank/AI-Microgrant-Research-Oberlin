import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getReviewPost, updateReviewPost } from "@/lib/reviewStore";
import { submitToCommunityHub } from "@/lib/communityHub";

const ADMIN_EMAIL = "frankkusiap@gmail.com";

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
      return NextResponse.json(
        { error: result.error ?? "Community Hub submission failed" },
        { status: 502 }
      );
    }

    await updateReviewPost(postId, {
      status: "published",
      communityHubPostId: result.id,
    });

    return NextResponse.json({ success: true, communityHubPostId: result.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: 500 }
    );
  }
}
