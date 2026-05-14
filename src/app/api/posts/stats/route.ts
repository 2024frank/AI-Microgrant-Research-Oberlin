import { NextResponse } from "next/server";
import { getReviewPostStats } from "@/lib/reviewStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getReviewPostStats();
  return NextResponse.json(stats);
}
