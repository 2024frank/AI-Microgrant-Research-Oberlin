import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createPipelineJob } from "@/lib/pipelineJobs";
import { runPipeline } from "@/lib/pipeline";
import { ensureDefaultSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sourceId = body.sourceId ?? "localist-oberlin";
    const sourceName = body.sourceName ?? "Localist – Oberlin College Calendar";

    await ensureDefaultSources();

    const jobId = await createPipelineJob(sourceId, sourceName);

    // after() keeps the serverless function alive after the response is sent
    // so Vercel doesn't kill the pipeline mid-run
    after(async () => {
      await runPipeline(jobId, sourceId);
    });

    return NextResponse.json({ jobId, status: "running" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start pipeline" },
      { status: 500 }
    );
  }
}
