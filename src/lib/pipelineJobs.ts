import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  orderBy,
  query,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";

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
  startedAt: number;
  completedAt?: number;
  error?: string;
};

const COLLECTION = "pipelineJobs";

export async function createPipelineJob(
  sourceId: string,
  sourceName: string
): Promise<string> {
  const ref = doc(collection(firebaseDb, COLLECTION));
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
    startedAt: Date.now(),
  };
  await setDoc(ref, { ...job, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updatePipelineJob(
  jobId: string,
  updates: Partial<Omit<PipelineJob, "id">>
): Promise<void> {
  const ref = doc(firebaseDb, COLLECTION, jobId);
  await updateDoc(ref, updates as Record<string, unknown>);
}

export async function getPipelineJob(
  jobId: string
): Promise<PipelineJob | null> {
  const ref = doc(firebaseDb, COLLECTION, jobId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PipelineJob;
}

export async function listPipelineJobs(
  maxResults = 50
): Promise<PipelineJob[]> {
  const q = query(
    collection(firebaseDb, COLLECTION),
    orderBy("startedAt", "desc"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineJob));
}
