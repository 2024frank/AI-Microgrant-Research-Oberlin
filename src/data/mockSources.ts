export type SourceStatus = "healthy" | "warning" | "paused" | "error";

export type CivicSource = {
  id: string;
  name: string;
  type: "calendar" | "rss" | "manual" | "api";
  status: SourceStatus;
  owner: string;
  lastSync: string;
  postsSynced: number;
  errorRate: number;
  coverage: string;
};

export const mockSources: CivicSource[] = [];
