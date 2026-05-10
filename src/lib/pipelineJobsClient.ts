"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { PipelineJob } from "./pipelineJobs";

const COLLECTION = "pipelineJobs";

export async function clientGetPipelineJob(jobId: string): Promise<PipelineJob | null> {
  const snap = await getDoc(doc(firebaseDb, COLLECTION, jobId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PipelineJob;
}

export async function clientListPipelineJobs(maxResults = 50): Promise<PipelineJob[]> {
  const q = query(
    collection(firebaseDb, COLLECTION),
    orderBy("startedAt", "desc"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineJob));
}
