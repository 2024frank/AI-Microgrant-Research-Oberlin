import "server-only";
import { adminDb } from "./firebaseAdmin";

export type ReviewDecision = "approved" | "rejected" | "needs_correction";

export type PostFeedback = {
  id: string;
  postId: string;
  postTitle: string;
  decision: ReviewDecision;
  rejectionReason?: string;
  postTypeId: number[];
  eventType: string;
  aiConfidence: number;
  sourceName: string;
  reviewedAt: number;
};

const COLLECTION = "postFeedback";

export async function saveFeedback(feedback: Omit<PostFeedback, "id">): Promise<void> {
  const ref = adminDb.collection(COLLECTION).doc();
  await ref.set({ ...feedback, id: ref.id });
}

export async function listFeedback(maxResults = 200): Promise<PostFeedback[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy("reviewedAt", "desc")
    .limit(maxResults)
    .get();
  return snap.docs.map((d) => d.data() as PostFeedback);
}

export async function getFeedbackStats(): Promise<{
  totalReviewed: number;
  approved: number;
  rejected: number;
  needsCorrection: number;
  approvalRate: number;
  avgConfidenceApproved: number;
  avgConfidenceRejected: number;
  topRejectionReasons: { reason: string; count: number }[];
  rejectionsByType: { typeId: number; count: number }[];
}> {
  const feedback = await listFeedback(500);

  const approved = feedback.filter((f) => f.decision === "approved");
  const rejected = feedback.filter((f) => f.decision === "rejected");
  const needsCorrection = feedback.filter((f) => f.decision === "needs_correction");

  const avgConf = (arr: PostFeedback[]) =>
    arr.length === 0
      ? 0
      : Math.round((arr.reduce((s, f) => s + (f.aiConfidence ?? 0), 0) / arr.length) * 100);

  const reasonCounts: Record<string, number> = {};
  rejected.forEach((f) => {
    if (f.rejectionReason) {
      const key = f.rejectionReason.slice(0, 80).toLowerCase().trim();
      reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
    }
  });

  const typeCounts: Record<number, number> = {};
  rejected.forEach((f) => {
    f.postTypeId?.forEach((id) => {
      typeCounts[id] = (typeCounts[id] ?? 0) + 1;
    });
  });

  return {
    totalReviewed: feedback.length,
    approved: approved.length,
    rejected: rejected.length,
    needsCorrection: needsCorrection.length,
    approvalRate: feedback.length === 0 ? 0 : Math.round((approved.length / feedback.length) * 100),
    avgConfidenceApproved: avgConf(approved),
    avgConfidenceRejected: avgConf(rejected),
    topRejectionReasons: Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([reason, count]) => ({ reason, count })),
    rejectionsByType: Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([typeId, count]) => ({ typeId: Number(typeId), count })),
  };
}
