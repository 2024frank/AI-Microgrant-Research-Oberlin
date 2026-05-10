import { adminDb, serverTimestamp } from "./firebaseAdmin";
import type { ReviewPost, DuplicateGroup, ReviewStatus } from "./postTypes";

const POSTS = "reviewPosts";
const DUPES = "duplicateGroups";
const PROCESSED = "processedEventIds";

export async function saveReviewPost(post: ReviewPost): Promise<void> {
  await adminDb
    .collection(POSTS)
    .doc(post.id)
    .set({ ...post, updatedAt: serverTimestamp(), createdAt: post.createdAt ?? Date.now() }, { merge: true });
}

export async function getReviewPost(id: string): Promise<ReviewPost | null> {
  const snap = await adminDb.collection(POSTS).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as ReviewPost;
}

export async function updateReviewPost(
  id: string,
  updates: Partial<ReviewPost>
): Promise<void> {
  await adminDb.collection(POSTS).doc(id).update({ ...updates, updatedAt: serverTimestamp() });
}

export async function deleteReviewPost(id: string): Promise<void> {
  await adminDb.collection(POSTS).doc(id).delete();
}

export async function listReviewPosts(options?: {
  status?: ReviewStatus;
  maxResults?: number;
}): Promise<ReviewPost[]> {
  let q = adminDb.collection(POSTS).orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  if (options?.status) q = q.where("status", "==", options.status);
  if (options?.maxResults) q = q.limit(options.maxResults);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as ReviewPost);
}

export async function listAllReviewPosts(): Promise<ReviewPost[]> {
  const snap = await adminDb
    .collection(POSTS)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
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
  const snap = await adminDb.collection(POSTS).get();
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

export async function saveDuplicateGroup(group: DuplicateGroup): Promise<void> {
  await adminDb
    .collection(DUPES)
    .doc(group.id)
    .set({ ...group, updatedAt: serverTimestamp() }, { merge: true });
}

export async function updateDuplicateGroup(
  id: string,
  updates: Partial<DuplicateGroup>
): Promise<void> {
  await adminDb.collection(DUPES).doc(id).update({ ...updates, updatedAt: serverTimestamp() });
}

export async function listDuplicateGroups(): Promise<DuplicateGroup[]> {
  const snap = await adminDb.collection(DUPES).limit(200).get();
  return snap.docs.map((d) => d.data() as DuplicateGroup);
}

export async function isEventProcessed(localistEventId: string): Promise<boolean> {
  const snap = await adminDb.collection(PROCESSED).doc(localistEventId).get();
  return snap.exists;
}

export async function markEventProcessed(localistEventId: string): Promise<void> {
  await adminDb.collection(PROCESSED).doc(localistEventId).set({ processedAt: Date.now() });
}
