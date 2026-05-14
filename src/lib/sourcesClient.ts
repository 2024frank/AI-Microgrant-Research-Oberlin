"use client";

import type { Source, SourceSchedule } from "./sources";
import { getClientBearerAuthHeader, getClientJsonAuthHeaders } from "./clientAuthHeaders";

export type { SourceSchedule };

export async function ensureDefaultSources(): Promise<void> {
  const res = await fetch("/api/sources/ensure", {
    method: "POST",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to initialize sources");
}

export async function getSource(id: string): Promise<Source | null> {
  const res = await fetch(`/api/sources/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load source");
  const data = await res.json();
  return data.source as Source;
}

export async function updateSource(id: string, updates: Partial<Source>): Promise<void> {
  const res = await fetch(`/api/sources/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update source");
}
