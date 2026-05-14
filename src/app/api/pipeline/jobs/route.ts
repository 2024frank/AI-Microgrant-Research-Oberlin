import { NextRequest, NextResponse } from "next/server";
import { listPipelineJobs } from "@/lib/pipelineJobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const maxResults = Number(req.nextUrl.searchParams.get("maxResults") ?? 50);
  const jobs = await listPipelineJobs(Math.max(1, Math.min(maxResults, 100)));
  return NextResponse.json({ jobs });
}
