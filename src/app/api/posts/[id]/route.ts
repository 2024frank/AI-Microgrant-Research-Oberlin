import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import {
  deleteReviewPost,
  getReviewPost,
  saveReviewPost,
  updateReviewPost,
} from "@/lib/reviewStore";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const post = await getReviewPost(id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const updates = await req.json();
  await updateReviewPost(id, updates);
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  const post = await req.json();
  if (!post?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await saveReviewPost(post);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  await deleteReviewPost(id);
  return NextResponse.json({ success: true });
}
