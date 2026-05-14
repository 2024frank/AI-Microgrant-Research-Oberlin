import { NextRequest, NextResponse } from "next/server";
import { updatePipelineJob } from "@/lib/pipelineJobs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    await updatePipelineJob(jobId, {
      status: "failed",
      completedAt: Date.now(),
      error: "Cancelled by admin",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
