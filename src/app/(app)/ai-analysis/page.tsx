"use client";

import { useEffect, useState } from "react";
import { Brain, ThumbsUp, ThumbsDown, AlertCircle, TrendingUp, Loader2, Bot, Sparkles, Search, PenLine } from "lucide-react";
import { COMMUNITY_HUB_POST_TYPES, COMMUNITY_HUB_POST_TYPE_IDS_FOR_CLASSIFIER } from "@/lib/postTypes";
import type { ReviewPost } from "@/lib/postTypes";
import type { PipelineJob } from "@/lib/pipelineJobs";

type FeedbackStats = {
  totalReviewed: number;
  approved: number;
  rejected: number;
  needsCorrection: number;
  approvalRate: number;
  avgConfidenceApproved: number;
  avgConfidenceRejected: number;
  topRejectionReasons: { reason: string; count: number }[];
  rejectionsByType: { typeId: number; count: number }[];
};

export default function AiAnalysisPage() {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [feedback, setFeedback] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { listAllReviewPosts } = await import("@/lib/reviewStoreClient");
      const { clientListPipelineJobs } = await import("@/lib/pipelineJobsClient");
      const [p, j, fb] = await Promise.all([
        listAllReviewPosts(),
        clientListPipelineJobs(10),
        fetch("/api/posts/feedback-stats").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      setPosts(p);
      setJobs(j);
      setFeedback(fb);
      setLoading(false);
    }
    load();
  }, []);

  const totalPosts = posts.length;
  const rejectedAuto = posts.filter((p) => p.status === "rejected").length;
  const autoRejectionRate = totalPosts > 0 ? Math.round((rejectedAuto / totalPosts) * 100) : 0;
  const avgConfidence = posts.length > 0
    ? Math.round((posts.reduce((s, p) => s + (Number(p.aiConfidence) || 0), 0) / posts.length) * 100) : 0;

  const typeCounts = [...COMMUNITY_HUB_POST_TYPE_IDS_FOR_CLASSIFIER]
    .map((id) => ({
      label: COMMUNITY_HUB_POST_TYPES[id] ?? `Type ${id}`,
      count: posts.filter((p) => p.postTypeId?.includes(id)).length,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxType = typeCounts[0]?.count ?? 1;

  const sponsorCounts: Record<string, number> = {};
  posts.forEach((p) => { p.sponsors?.forEach((s) => { if (s !== "Oberlin College") sponsorCounts[s] = (sponsorCounts[s] ?? 0) + 1; }); });
  const topSponsors = Object.entries(sponsorCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

  const calibrationGap = feedback ? feedback.avgConfidenceApproved - feedback.avgConfidenceRejected : null;

  // Agent workload — derive from actual posts + all jobs (not just completed)
  const totalAiProcessed = totalPosts;
  const totalAutoRejected = rejectedAuto;
  const totalDupsDetected = posts.filter((p) => p.status === "duplicate").length;
  const nonRejectedPosts = totalPosts - totalAutoRejected;
  const pipelineRuns = jobs.length;

  const agents = [
    {
      name: "Extraction Agent",
      icon: <Sparkles className="w-5 h-5" />,
      color: "text-violet-400",
      bgColor: "bg-violet-900/20 border-violet-800/30",
      barColor: "bg-violet-500",
      tasks: totalAiProcessed,
      description: "Classifies events, detects athletics, extracts location & sessions; assigns postTypeId from the closed Community Hub ID set",
      metrics: [
        { label: "Events classified", value: totalAiProcessed },
        { label: "Athletics auto-rejected", value: totalAutoRejected },
        { label: "Avg confidence", value: `${avgConfidence}%` },
      ],
    },
    {
      name: "Editor Agent",
      icon: <PenLine className="w-5 h-5" />,
      color: "text-teal-400",
      bgColor: "bg-teal-900/20 border-teal-800/30",
      barColor: "bg-teal-500",
      tasks: nonRejectedPosts,
      description: "Writes screen-ready descriptions — short hooks and extended context for community displays",
      metrics: [
        { label: "Descriptions written", value: nonRejectedPosts * 2 },
        { label: "Events edited", value: nonRejectedPosts },
        { label: "Skipped (auto-rejected)", value: totalAutoRejected },
      ],
    },
    {
      name: "Dedup Agent",
      icon: <Search className="w-5 h-5" />,
      color: "text-amber-400",
      bgColor: "bg-amber-900/20 border-amber-800/30",
      barColor: "bg-amber-500",
      tasks: nonRejectedPosts,
      description: "Compares each event against Community Hub using semantic AI matching to prevent duplicates",
      metrics: [
        { label: "Comparisons run", value: nonRejectedPosts },
        { label: "Duplicates caught", value: totalDupsDetected },
        { label: "Detection rate", value: nonRejectedPosts > 0 ? `${Math.round((totalDupsDetected / nonRejectedPosts) * 100)}%` : "—" },
      ],
    },
  ];
  const maxAgentTasks = Math.max(...agents.map((a) => a.tasks), 1);
  const totalAgentCalls = agents.reduce((s, a) => s + a.tasks, 0);

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading analysis…
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">Operational Intelligence</h1>
        <p className="mt-2 text-[var(--muted)]">AI extraction quality, reviewer feedback, and training signals.</p>
      </div>

      {totalPosts === 0 && !feedback ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
          <p className="font-semibold text-[var(--text)]">No data yet.</p>
          <p className="mt-2">Run the pipeline and review some posts to generate AI analysis.</p>
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Events Processed", value: totalPosts, sub: `${pipelineRuns} pipeline run${pipelineRuns !== 1 ? "s" : ""}` },
              { label: "Avg AI Confidence", value: `${avgConfidence}%`, sub: "Gemini extraction score" },
              { label: "Auto-Rejection Rate", value: `${autoRejectionRate}%`, sub: "Athletics / ineligible" },
              { label: "Reviewer Approval Rate", value: feedback ? `${feedback.approvalRate}%` : "—", sub: feedback ? `${feedback.totalReviewed} manually reviewed` : "No reviews yet" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">{label}</p>
                <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Agent workload */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="font-semibold text-[var(--text)]">AI Agent Workload</h2>
              </div>
              <span className="text-xs text-[var(--muted)] px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--surface-high)]">
                {totalAgentCalls} total Gemini calls across {pipelineRuns} pipeline run{pipelineRuns !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {agents.map((agent) => (
                <div key={agent.name} className={`rounded-lg border p-4 ${agent.bgColor}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={agent.color}>{agent.icon}</span>
                    <h3 className={`font-semibold text-sm ${agent.color}`}>{agent.name}</h3>
                  </div>
                  <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">{agent.description}</p>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[var(--muted)]">Tasks completed</span>
                      <span className={`font-bold ${agent.color}`}>{agent.tasks}</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                      <div className={`h-full ${agent.barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.round((agent.tasks / maxAgentTasks) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    {agent.metrics.map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--muted)]">{label}</span>
                        <span className="font-medium text-[var(--text)] tabular-nums">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviewer feedback */}
          {feedback && feedback.totalReviewed > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <div className="flex items-center gap-2 mb-5">
                <Brain className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="font-semibold text-[var(--text)]">Reviewer Feedback — AI Training Signals</h2>
              </div>
              <div className="grid gap-6 xl:grid-cols-3">
                {/* Decision breakdown */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-3">Decision Breakdown</p>
                  <div className="space-y-2.5">
                    {[
                      { label: "Approved", count: feedback.approved, icon: <ThumbsUp className="w-3.5 h-3.5" />, color: "text-teal-400 bg-teal-900/20" },
                      { label: "Rejected", count: feedback.rejected, icon: <ThumbsDown className="w-3.5 h-3.5" />, color: "text-red-400 bg-red-900/20" },
                      { label: "Needs Correction", count: feedback.needsCorrection, icon: <AlertCircle className="w-3.5 h-3.5" />, color: "text-amber-400 bg-amber-900/20" },
                    ].map(({ label, count, icon, color }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className={`flex items-center gap-1.5 text-sm px-2 py-1 rounded-md ${color}`}>{icon}{label}</span>
                        <span className="font-semibold text-[var(--text)] tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Calibration */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-3">AI Confidence Calibration</p>
                  <div className="space-y-3">
                    {[
                      { label: "Avg confidence (approved)", value: feedback.avgConfidenceApproved, color: "bg-teal-500", text: "text-teal-400" },
                      { label: "Avg confidence (rejected)", value: feedback.avgConfidenceRejected, color: "bg-red-500", text: "text-red-400" },
                    ].map(({ label, value, color, text }) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[var(--muted)]">{label}</span>
                          <span className={`font-medium ${text}`}>{value}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                    {calibrationGap !== null && (
                      <p className="text-xs text-[var(--muted)] flex items-start gap-1 mt-2">
                        <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" />
                        {calibrationGap > 10 ? "Well-calibrated — high confidence correlates with approval."
                         : calibrationGap > 0 ? "Slightly calibrated — room to improve."
                         : "Not predictive — AI confidence needs recalibration."}
                      </p>
                    )}
                  </div>
                </div>
                {/* Rejection reasons */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-3">Top Rejection Reasons</p>
                  {feedback.topRejectionReasons.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No reasons recorded yet. Add reasons when rejecting posts.</p>
                  ) : (
                    <div className="space-y-2">
                      {feedback.topRejectionReasons.map(({ reason, count }) => (
                        <div key={reason} className="flex items-start gap-2 text-sm">
                          <span className="shrink-0 text-red-400 font-medium tabular-nums">{count}×</span>
                          <span className="text-[var(--muted)] line-clamp-2 capitalize">{reason}</span>
                        </div>
                      ))}
                      <p className="text-xs text-[var(--muted)] mt-3 pt-3 border-t border-[var(--border)]">
                        These patterns are training signals. The more rejections with reasons, the better the AI can be guided.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {/* Types most rejected */}
              {feedback.rejectionsByType.length > 0 && (
                <div className="mt-5 pt-5 border-t border-[var(--border)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-3">Event Types Most Rejected by Reviewers</p>
                  <div className="flex flex-wrap gap-2">
                    {feedback.rejectionsByType.slice(0, 6).map(({ typeId, count }) => (
                      <span key={typeId} className="px-2.5 py-1 rounded-full text-xs bg-red-900/20 text-red-300 border border-red-800/30">
                        {COMMUNITY_HUB_POST_TYPES[typeId] ?? `Type ${typeId}`} · {count}×
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <h2 className="font-semibold text-[var(--text)] mb-4">Event Type Breakdown (Pipeline)</h2>
              {typeCounts.length === 0 ? <p className="text-sm text-[var(--muted)]">No events yet.</p> : (
                <div className="space-y-2">
                  {typeCounts.map(({ label, count }) => (
                    <div key={label} className="flex items-center gap-3 text-sm">
                      <span className="w-44 shrink-0 text-[var(--muted)] truncate">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                        <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${Math.round((count / maxType) * 100)}%` }} />
                      </div>
                      <span className="w-5 text-right text-[var(--muted)] tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <h2 className="font-semibold text-[var(--text)] mb-4">Top Departments / Sponsors</h2>
              {topSponsors.length === 0 ? <p className="text-sm text-[var(--muted)]">No sponsor data yet.</p> : (
                <div className="space-y-2">
                  {topSponsors.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted)] truncate">{name}</span>
                      <span className="font-medium text-[var(--text)] tabular-nums ml-4">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
