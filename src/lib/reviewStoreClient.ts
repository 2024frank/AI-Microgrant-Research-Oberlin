"use client";

import type { DuplicateGroup, ReviewPost, ReviewStatus } from "./postTypes";
import { getClientBearerAuthHeader, getClientJsonAuthHeaders } from "./clientAuthHeaders";

export async function clientGetReviewPost(id: string): Promise<ReviewPost | null> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load post");
  const data = await res.json();
  return data.post as ReviewPost;
}

export async function clientUpdateReviewPost(id: string, updates: Partial<ReviewPost>): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update post");
}

export async function clientDeleteReviewPost(id: string): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to delete post");
}

export async function listAllReviewPosts(): Promise<ReviewPost[]> {
  const res = await fetch("/api/posts/list", {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to load posts");
  const data = await res.json();
  return data.posts as ReviewPost[];
}

export async function listReviewPosts(options?: { status?: ReviewStatus; maxResults?: number }): Promise<ReviewPost[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.maxResults) params.set("maxResults", String(options.maxResults));
  const res = await fetch(`/api/posts/list?${params.toString()}`, {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to load posts");
  const data = await res.json();
  return data.posts as ReviewPost[];
}

export async function getReviewPostStats() {
  const res = await fetch("/api/posts/stats", {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to load post stats");
  return res.json();
}

export async function clientListDuplicateGroups(): Promise<DuplicateGroup[]> {
  const res = await fetch("/api/duplicates", {
    cache: "no-store",
    headers: await getClientBearerAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to load duplicate groups");
  const data = await res.json();
  return data.groups as DuplicateGroup[];
}

export async function clientUpdateDuplicateGroup(id: string, updates: Partial<DuplicateGroup>): Promise<void> {
  const res = await fetch("/api/duplicates", {
    method: "PATCH",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify({ id, updates }),
  });
  if (!res.ok) throw new Error("Failed to update duplicate group");
}

export async function clientSaveReviewPost(post: ReviewPost): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}`, {
    method: "PUT",
    headers: await getClientJsonAuthHeaders(),
    body: JSON.stringify(post),
  });
  if (!res.ok) throw new Error("Failed to save post");
}
