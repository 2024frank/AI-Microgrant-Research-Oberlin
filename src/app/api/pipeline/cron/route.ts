import { NextRequest, NextResponse, after } from "next/server";
import { getSourcesDue } from "@/lib/sources";
import { createPipelineJob } from "@/lib/pipelineJobs";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const dueSources = await getSourcesDue();

    if (dueSources.length === 0) {
      return NextResponse.json({ message: "No sources due", triggered: 0 });
    }

    const triggered: string[] = [];

    for (const source of dueSources) {
      const jobId = await createPipelineJob(source.id, source.name);
      const sid = source.id;
      after(async () => {
        await runPipeline(jobId, sid);
      });
      triggered.push(jobId);
    }

    return NextResponse.json({ message: "Triggered", triggered });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron error" },
      { status: 500 }
    );
  }
}
