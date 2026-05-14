import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import { listPipelineJobs } from "@/lib/pipelineJobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "viewer");
  if (!guard.ok) return guard.response;

  const maxResults = Number(req.nextUrl.searchParams.get("maxResults") ?? 50);
  const jobs = await listPipelineJobs(Math.max(1, Math.min(maxResults, 100)));
  return NextResponse.json({ jobs });
}
