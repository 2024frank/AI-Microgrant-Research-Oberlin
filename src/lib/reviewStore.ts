import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { ReviewPost, DuplicateGroup, ReviewStatus } from "./postTypes";

const POSTS_COLLECTION = "reviewPosts";
const DUPES_COLLECTION = "duplicateGroups";
const PROCESSED_COLLECTION = "processedEventIds";

export async function saveReviewPost(post: ReviewPost): Promise<void> {
  const ref = doc(firebaseDb, POSTS_COLLECTION, post.id);
  await setDoc(
    ref,
    { ...post, updatedAt: serverTimestamp(), createdAt: post.createdAt ?? Date.now() },
    { merge: true }
  );
}

export async function getReviewPost(id: string): Promise<ReviewPost | null> {
  const ref = doc(firebaseDb, POSTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as ReviewPost;
}

export async function updateReviewPost(
  id: string,
  updates: Partial<ReviewPost>
): Promise<void> {
  const ref = doc(firebaseDb, POSTS_COLLECTION, id);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() } as Record<string, unknown>);
}

export async function deleteReviewPost(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb, POSTS_COLLECTION, id));
}

export async function listReviewPosts(options?: {
  status?: ReviewStatus;
  maxResults?: number;
}): Promise<ReviewPost[]> {
  const constraints = [];
  if (options?.status) {
    constraints.push(where("status", "==", options.status));
  }
  constraints.push(orderBy("createdAt", "desc"));
  if (options?.maxResults) {
    constraints.push(limit(options.maxResults));
  }

  const q = query(collection(firebaseDb, POSTS_COLLECTION), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ReviewPost);
}

export async function listAllReviewPosts(): Promise<ReviewPost[]> {
  const q = query(
    collection(firebaseDb, POSTS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ReviewPost);
}

export async function getReviewPostStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  duplicate: number;
  published: number;
  total: number;
}> {
  const snap = await getDocs(collection(firebaseDb, POSTS_COLLECTION));
  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    duplicate: 0,
    published: 0,
    total: 0,
  };
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

export async function saveDuplicateGroup(group: DuplicateGroup): Promise<void> {
  const ref = doc(firebaseDb, DUPES_COLLECTION, group.id);
  await setDoc(ref, { ...group, updatedAt: serverTimestamp() }, { merge: true });
}

export async function updateDuplicateGroup(
  id: string,
  updates: Partial<DuplicateGroup>
): Promise<void> {
  const ref = doc(firebaseDb, DUPES_COLLECTION, id);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() } as Record<string, unknown>);
}

export async function listDuplicateGroups(): Promise<DuplicateGroup[]> {
  const q = query(collection(firebaseDb, DUPES_COLLECTION), orderBy("id", "desc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as DuplicateGroup);
}

export async function isEventProcessed(localistEventId: string): Promise<boolean> {
  const ref = doc(firebaseDb, PROCESSED_COLLECTION, localistEventId);
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function markEventProcessed(localistEventId: string): Promise<void> {
  const ref = doc(firebaseDb, PROCESSED_COLLECTION, localistEventId);
  await setDoc(ref, { processedAt: Date.now() });
}
