import "server-only";
import { randomUUID } from "crypto";
import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";
import type { ReviewPost } from "./postTypes";

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
  postSnapshot?: ReviewPost;
  missingFields?: string[];
  validationErrors?: string[];
  learningSignal?: AiLearningSignal;
  aiCorrectionApplied?: boolean;
};

export type AiLearningSignal =
  | "human_approved"
  | "human_rejected"
  | "human_requested_correction"
  | "human_approved_missing_fields"
  | "ai_corrected_and_requeued"
  | "human_published_after_override";

export type AiLearningEvent = {
  id: string;
  postId: string;
  signal: AiLearningSignal;
  reason?: string;
  postTitle: string;
  sourceName: string;
  aiConfidence: number | null;
  missingFields?: string[];
  validationErrors?: string[];
  before?: Partial<ReviewPost>;
  after?: Partial<ReviewPost>;
  createdAt: number;
};

const COLLECTION = "postFeedback";

export async function saveFeedback(feedback: Omit<PostFeedback, "id">): Promise<void> {
  await ensureMysqlSchema();
  const id = randomUUID();
  const saved = { ...feedback, id };
  await getMysqlPool().execute(
    "INSERT INTO post_feedback (id, data) VALUES (?, CAST(? AS JSON))",
    [id, json(saved)]
  );

  await saveAiLearningEvent({
    postId: feedback.postId,
    postTitle: feedback.postTitle,
    signal:
      feedback.learningSignal ??
      (feedback.decision === "approved"
        ? "human_approved"
        : feedback.decision === "needs_correction"
          ? "human_requested_correction"
          : "human_rejected"),
    reason: feedback.rejectionReason,
    sourceName: feedback.sourceName,
    aiConfidence: feedback.aiConfidence,
    missingFields: feedback.missingFields,
    validationErrors: feedback.validationErrors,
    before: feedback.postSnapshot,
  });
}

export async function saveAiLearningEvent(
  event: Omit<AiLearningEvent, "id" | "createdAt">
): Promise<void> {
  await ensureMysqlSchema();
  const id = randomUUID();
  const createdAt = Date.now();
  await getMysqlPool().execute(
    "INSERT INTO ai_learning_events (id, data) VALUES (?, CAST(? AS JSON))",
    [id, json({ ...event, id, createdAt })]
  );
}

export async function listFeedback(maxResults = 200): Promise<PostFeedback[]> {
  await ensureMysqlSchema();
  const limit = Math.max(1, Math.min(Number(maxResults) || 200, 500));
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    `SELECT data FROM post_feedback ORDER BY reviewed_at DESC LIMIT ${limit}`
  );
  return rows.map((row) => parseJson<PostFeedback>(row.data, null as unknown as PostFeedback));
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
