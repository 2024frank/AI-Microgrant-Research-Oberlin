import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";

export type SourceSchedule = "off" | "2h" | "6h" | "12h" | "daily" | "weekly" | "biweekly";

export type Source = {
  id: string;
  name: string;
  type: "localist";
  baseUrl: string;
  schedule: SourceSchedule;
  scheduleHour?: number; // 0-23, for daily: run at this hour (UTC)
  lastRun?: number;
  nextRun?: number;
  lastJobId?: string;
  enabled: boolean;
  createdAt?: number;
};

const COLLECTION = "sources";

const SCHEDULE_INTERVALS: Record<SourceSchedule, number> = {
  off: 0,
  "2h": 2 * 3600000,
  "6h": 6 * 3600000,
  "12h": 12 * 3600000,
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
  await ensureMysqlSchema();
  await getMysqlPool().execute(
    "INSERT IGNORE INTO sources (id, data) VALUES (?, CAST(? AS JSON))",
    [DEFAULT_SOURCE.id, json(DEFAULT_SOURCE)]
  );
}

export async function listSources(): Promise<Source[]> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM sources"
  );
  return rows.map((row) => parseJson<Source>(row.data, null as unknown as Source));
}

export async function getSource(id: string): Promise<Source | null> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM sources WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseJson<Source>(rows[0].data, null as unknown as Source);
}

export async function updateSource(
  id: string,
  updates: Partial<Source>
): Promise<void> {
  await ensureMysqlSchema();
  const existing = await getSource(id);
  if (!existing) return;
  const next = { ...existing, ...updates, updatedAt: Date.now() };
  await getMysqlPool().execute(
    "UPDATE sources SET data = CAST(? AS JSON) WHERE id = ?",
    [json(next), id]
  );
}

export function computeNextRun(schedule: SourceSchedule, scheduleHour?: number): number | undefined {
  const interval = SCHEDULE_INTERVALS[schedule];
  if (!interval) return undefined;
  const now = Date.now();

  // For daily/weekly/biweekly with a specific hour, snap to that hour
  if ((schedule === "daily" || schedule === "weekly" || schedule === "biweekly") && scheduleHour != null) {
    const next = new Date(now + interval);
    next.setUTCHours(scheduleHour, 0, 0, 0);
    // If snapping moved it before now+interval, add one interval
    if (next.getTime() < now + interval - 3600000) {
      next.setTime(next.getTime() + interval);
    }
    return next.getTime();
  }

  return now + interval;
}

export async function recordSourceRun(sourceId: string, jobId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  const nextRun = computeNextRun(source.schedule, source.scheduleHour);
  await updateSource(sourceId, { lastRun: Date.now(), lastJobId: jobId, nextRun });
}

export async function getSourcesDue(): Promise<Source[]> {
  const sources = await listSources();
  const now = Date.now();
  return sources.filter(
    (s) => s.enabled && s.schedule !== "off" && s.nextRun != null && s.nextRun <= now
  );
}
