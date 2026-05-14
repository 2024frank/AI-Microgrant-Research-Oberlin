"use client";

import type { SourceConfig } from "./sourceConfig";
import { getClientBearerAuthHeader, getClientJsonAuthHeaders } from "./clientAuthHeaders";

export type ChatSession = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: number;
  messages: ChatMsg[];
};

export type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolResults?: Array<{ tool: string; result: string }>;
};

export async function saveSourceConfig(config: SourceConfig) {
  const res = await fetch("/api/source-configs", {
    method: "PUT",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to save source config");
  }
}

export async function getSourceConfig(id: string): Promise<SourceConfig | null> {
  const res = await fetch(`/api/source-configs?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { config?: SourceConfig | null };
  return data.config ?? null;
}

export async function listSourceConfigs(): Promise<SourceConfig[]> {
  const res = await fetch("/api/source-configs", {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { configs?: SourceConfig[] };
  return data.configs ?? [];
}

export async function deleteSourceConfig(id: string) {
  const res = await fetch(`/api/source-configs?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to delete source config");
  }
}

export async function updateSourceConfig(id: string, updates: Partial<SourceConfig>) {
  const res = await fetch("/api/source-configs", {
    method: "PATCH",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ id, updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to update source config");
  }
}

export async function createChatSession(createdBy: string, title: string): Promise<string> {
  const res = await fetch("/api/source-builder/conversations", {
    method: "POST",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ createdBy, title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to create session");
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("No session id returned");
  return data.id;
}

export async function getChatSession(id: string): Promise<ChatSession | null> {
  const res = await fetch(`/api/source-builder/conversations/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { session?: ChatSession };
  return data.session ?? null;
}

export async function appendChatMessage(sessionId: string, msg: ChatMsg) {
  const res = await fetch(`/api/source-builder/conversations/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ action: "append", message: msg }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to append message");
  }
}

export async function listChatSessions(userEmail: string, count = 20): Promise<ChatSession[]> {
  const res = await fetch(
    `/api/source-builder/conversations?email=${encodeURIComponent(userEmail)}&count=${count}`,
    { cache: "no-store", headers: await getClientBearerAuthHeader() },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { sessions?: ChatSession[] };
  return data.sessions ?? [];
}

export async function updateChatTitle(sessionId: string, title: string) {
  const res = await fetch(`/api/source-builder/conversations/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ action: "title", title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to update title");
  }
}
