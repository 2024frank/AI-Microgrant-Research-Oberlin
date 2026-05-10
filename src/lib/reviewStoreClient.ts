"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  QueryConstraint,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { ReviewPost, DuplicateGroup, ReviewStatus } from "./postTypes";

const POSTS = "reviewPosts";
const DUPES = "duplicateGroups";

export async function clientGetReviewPost(id: string): Promise<ReviewPost | null> {
  const snap = await getDoc(doc(firebaseDb, POSTS, id));
  if (!snap.exists()) return null;
  return snap.data() as ReviewPost;
}

export async function clientUpdateReviewPost(id: string, updates: Partial<ReviewPost>): Promise<void> {
  await updateDoc(doc(firebaseDb, POSTS, id), { ...updates, updatedAt: serverTimestamp() } as Record<string, unknown>);
}

export async function clientDeleteReviewPost(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb, POSTS, id));
}

export async function listAllReviewPosts(): Promise<ReviewPost[]> {
  // No orderBy — avoids needing a Firestore index on new collections
  const snap = await getDocs(query(collection(firebaseDb, POSTS), limit(500)));
  const posts = snap.docs.map((d) => d.data() as ReviewPost);
  // Sort client-side by createdAt desc
  return posts.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

export async function listReviewPosts(options?: { status?: ReviewStatus; maxResults?: number }): Promise<ReviewPost[]> {
  const constraints: QueryConstraint[] = [];
  if (options?.status) constraints.push(where("status", "==", options.status));
  if (options?.maxResults) constraints.push(limit(options.maxResults));
  const snap = await getDocs(query(collection(firebaseDb, POSTS), ...constraints));
  const posts = snap.docs.map((d) => d.data() as ReviewPost);
  return posts.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

export async function getReviewPostStats() {
  const snap = await getDocs(collection(firebaseDb, POSTS));
  const counts = { pending: 0, approved: 0, rejected: 0, duplicate: 0, published: 0, total: 0 };
  snap.docs.forEach((d) => {
    const status = d.data().status as ReviewStatus;
    counts.total++;
    if (status === "pending") counts.pending++;
    else if (status === "approved") counts.approved++;
    else if (status === "rejected") counts.rejected++;
    else if (status === "duplicate") counts.duplicate++;
    else if (status === "published") counts.published++;
  });
  return counts;
}

export async function clientListDuplicateGroups(): Promise<DuplicateGroup[]> {
  const snap = await getDocs(query(collection(firebaseDb, DUPES), limit(200)));
  return snap.docs.map((d) => d.data() as DuplicateGroup);
}

export async function clientUpdateDuplicateGroup(id: string, updates: Partial<DuplicateGroup>): Promise<void> {
  await updateDoc(doc(firebaseDb, DUPES, id), { ...updates, updatedAt: serverTimestamp() } as Record<string, unknown>);
}

export async function clientSaveReviewPost(post: ReviewPost): Promise<void> {
  await setDoc(doc(firebaseDb, POSTS, post.id), { ...post, updatedAt: serverTimestamp(), createdAt: post.createdAt ?? Date.now() }, { merge: true });
}
