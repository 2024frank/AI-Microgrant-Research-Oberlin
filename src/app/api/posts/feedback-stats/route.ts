import { NextResponse } from "next/server";
import { getFeedbackStats } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getFeedbackStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch feedback stats" },
      { status: 500 }
    );
  }
}
