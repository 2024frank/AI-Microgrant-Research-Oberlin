import { randomUUID } from "crypto";
import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";

export type PipelineJobStatus = "running" | "completed" | "failed";

export type PipelineJob = {
  id: string;
  status: PipelineJobStatus;
  sourceId: string;
  sourceName: string;
  totalFetched: number;
  totalQueued: number;
  totalRejected: number;
  totalDuplicates: number;
  totalSkipped: number;
  progress: number;
  progressTotal: number;
  continuationIndex: number;
  currentPage?: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
};

const COLLECTION = "pipelineJobs";

export async function createPipelineJob(
  sourceId: string,
  sourceName: string
): Promise<string> {
  await ensureMysqlSchema();
  const id = randomUUID();
  const job: PipelineJob = {
    id,
    status: "running",
    sourceId,
    sourceName,
    totalFetched: 0,
    totalQueued: 0,
    totalRejected: 0,
    totalDuplicates: 0,
    totalSkipped: 0,
    progress: 0,
    progressTotal: 0,
    continuationIndex: 0,
    currentPage: 1,
    startedAt: Date.now(),
  };
  await getMysqlPool().execute(
    "INSERT INTO pipeline_jobs (id, data) VALUES (?, CAST(? AS JSON))",
    [id, json(job)]
  );
  return id;
}

export async function updatePipelineJob(
  jobId: string,
  updates: Partial<Omit<PipelineJob, "id">>
): Promise<void> {
  await ensureMysqlSchema();
  const existing = await getPipelineJob(jobId);
  if (!existing) return;
  const next = { ...existing, ...updates };
  await getMysqlPool().execute(
    "UPDATE pipeline_jobs SET data = CAST(? AS JSON) WHERE id = ?",
    [json(next), jobId]
  );
}

export async function getPipelineJob(
  jobId: string
): Promise<PipelineJob | null> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM pipeline_jobs WHERE id = ? LIMIT 1",
    [jobId]
  );
  if (!rows[0]) return null;
  return parseJson<PipelineJob>(rows[0].data, null as unknown as PipelineJob);
}

export async function listPipelineJobs(
  maxResults = 50
): Promise<PipelineJob[]> {
  await ensureMysqlSchema();
  const limit = Math.max(1, Math.min(Number(maxResults) || 50, 100));
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    `SELECT data FROM pipeline_jobs ORDER BY started_at DESC LIMIT ${limit}`
  );
  return rows.map((row) => parseJson<PipelineJob>(row.data, null as unknown as PipelineJob));
}
