import { adminDb, serverTimestamp } from "./firebaseAdmin";

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
  startedAt: number;
  completedAt?: number;
  error?: string;
};

const COLLECTION = "pipelineJobs";

export async function createPipelineJob(
  sourceId: string,
  sourceName: string
): Promise<string> {
  const ref = adminDb.collection(COLLECTION).doc();
  const job: Omit<PipelineJob, "id"> = {
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
    startedAt: Date.now(),
  };
  await ref.set({ ...job, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updatePipelineJob(
  jobId: string,
  updates: Partial<Omit<PipelineJob, "id">>
): Promise<void> {
  await adminDb.collection(COLLECTION).doc(jobId).update(updates);
}

export async function getPipelineJob(
  jobId: string
): Promise<PipelineJob | null> {
  const snap = await adminDb.collection(COLLECTION).doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as PipelineJob;
}

export async function listPipelineJobs(
  maxResults = 50
): Promise<PipelineJob[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("startedAt", "desc")
    .limit(maxResults)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineJob));
}
