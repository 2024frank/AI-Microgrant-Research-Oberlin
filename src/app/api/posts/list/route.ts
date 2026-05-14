import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { listReviewPosts } from "@/lib/reviewStore";
import type { ReviewStatus } from "@/lib/postTypes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  try {
    const status = req.nextUrl.searchParams.get("status") as ReviewStatus | null;
    const maxResults = Number(req.nextUrl.searchParams.get("maxResults") ?? 500);
    const posts = await listReviewPosts({
      status: status ?? undefined,
      maxResults: Math.max(1, Math.min(maxResults, 500)),
    });
    return NextResponse.json({ posts, total: posts.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load posts" },
      { status: 500 }
    );
  }
}
