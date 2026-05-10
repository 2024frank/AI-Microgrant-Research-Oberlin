import { adminDb, serverTimestamp } from "./firebaseAdmin";

export type SourceSchedule = "off" | "daily" | "weekly" | "biweekly";

export type Source = {
  id: string;
  name: string;
  type: "localist";
  baseUrl: string;
  schedule: SourceSchedule;
  lastRun?: number;
  nextRun?: number;
  lastJobId?: string;
  enabled: boolean;
  createdAt?: number;
};

const COLLECTION = "sources";

const SCHEDULE_INTERVALS: Record<SourceSchedule, number> = {
  off: 0,
  daily: 86400000,
  weekly: 604800000,
  biweekly: 1209600000,
};

const DEFAULT_SOURCE = {
  id: "localist-oberlin",
  name: "Localist – Oberlin College Calendar",
  type: "localist" as const,
  baseUrl: "https://calendar.oberlin.edu",
  schedule: "off" as SourceSchedule,
  enabled: true,
  createdAt: Date.now(),
};

export async function ensureDefaultSources(): Promise<void> {
  const ref = adminDb.collection(COLLECTION).doc("localist-oberlin");
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(DEFAULT_SOURCE);
  }
}

export async function listSources(): Promise<Source[]> {
  const snap = await adminDb.collection(COLLECTION).get();
  return snap.docs.map((d) => d.data() as Source);
}

export async function getSource(id: string): Promise<Source | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as Source;
}

export async function updateSource(
  id: string,
  updates: Partial<Source>
): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).update({ ...updates, updatedAt: serverTimestamp() });
}

export async function recordSourceRun(sourceId: string, jobId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  const now = Date.now();
  const interval = SCHEDULE_INTERVALS[source.schedule];
  const nextRun = interval > 0 ? now + interval : undefined;
  await updateSource(sourceId, { lastRun: now, lastJobId: jobId, nextRun });
}

export async function getSourcesDue(): Promise<Source[]> {
  const sources = await listSources();
  const now = Date.now();
  return sources.filter(
    (s) => s.enabled && s.schedule !== "off" && s.nextRun != null && s.nextRun <= now
  );
}
