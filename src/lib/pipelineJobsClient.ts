"use client";

import type { PipelineJob } from "./pipelineJobs";
import { getClientBearerAuthHeader } from "./clientAuthHeaders";

export async function clientGetPipelineJob(jobId: string): Promise<PipelineJob | null> {
  const res = await fetch(`/api/pipeline/status?jobId=${encodeURIComponent(jobId)}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load pipeline job");
  return (await res.json()) as PipelineJob;
}

export async function clientListPipelineJobs(maxResults = 50): Promise<PipelineJob[]> {
  const res = await fetch(`/api/pipeline/jobs?maxResults=${maxResults}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to load pipeline jobs");
  const data = await res.json();
  return data.jobs as PipelineJob[];
}
