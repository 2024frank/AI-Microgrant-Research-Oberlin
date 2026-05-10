import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await adminDb.collection("reviewPosts").limit(500).get();
    const posts = snap.docs.map((d) => d.data());
    posts.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    return NextResponse.json({ posts, total: posts.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load posts" },
      { status: 500 }
    );
  }
}
