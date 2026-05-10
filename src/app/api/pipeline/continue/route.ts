import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { jobId, sourceId } = await req.json();
    if (!jobId || !sourceId) {
      return NextResponse.json({ error: "jobId and sourceId required" }, { status: 400 });
    }

    after(async () => {
      await runPipeline(jobId, sourceId);
    });

    return NextResponse.json({ ok: true, continued: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Continue failed" },
      { status: 500 }
    );
  }
}
