import { NextRequest, NextResponse } from "next/server";
import { getSourcesDue } from "@/lib/sources";

export const dynamic = "force-dynamic";

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

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ai-microgrant-research-oberlin.vercel.app").replace(/\/$/, "");

    // Fire-and-forget: POST to /api/pipeline/trigger for each due source.
    // We don't await the pipeline — the trigger endpoint manages its own lifecycle.
    const triggered: string[] = [];
    const errors: string[] = [];

    await Promise.all(
      dueSources.map(async (source) => {
        try {
          const res = await fetch(`${baseUrl}/api/pipeline/trigger`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceId: source.id, sourceName: source.name }),
          });
          if (res.ok) {
            const data = await res.json() as { jobId?: string };
            if (data.jobId) triggered.push(data.jobId);
          } else {
            errors.push(`${source.name}: HTTP ${res.status}`);
          }
        } catch (e) {
          errors.push(`${source.name}: ${e instanceof Error ? e.message : "fetch failed"}`);
        }
      })
    );

    return NextResponse.json({
      message: "Cron complete",
      triggered: triggered.length,
      jobIds: triggered,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron error" },
      { status: 500 }
    );
  }
}
