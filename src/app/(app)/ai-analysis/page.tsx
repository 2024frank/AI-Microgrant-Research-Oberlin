"use client";

import { useEffect, useState } from "react";
import { COMMUNITY_HUB_POST_TYPES } from "@/lib/postTypes";
import type { ReviewPost } from "@/lib/postTypes";
import type { PipelineJob } from "@/lib/pipelineJobs";

type TypeCount = { label: string; count: number };

export default function AiAnalysisPage() {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { listAllReviewPosts } = await import("@/lib/reviewStore");
      const { listPipelineJobs } = await import("@/lib/pipelineJobs");
      const [p, j] = await Promise.all([listAllReviewPosts(), listPipelineJobs(10)]);
      setPosts(p);
      setJobs(j);
      setLoading(false);
    }
    load();
  }, []);

  const totalPosts = posts.length;
  const rejectedCount = posts.filter((p) => p.status === "rejected").length;
  const rejectionRate = totalPosts > 0 ? Math.round((rejectedCount / totalPosts) * 100) : 0;

  const avgConfidence =
    posts.length > 0
      ? Math.round(
          (posts.reduce((sum, p) => sum + (Number(p.aiConfidence) || 0), 0) / posts.length) * 100
        )
      : 0;

  const typeCounts: TypeCount[] = Object.entries(COMMUNITY_HUB_POST_TYPES).map(([id, label]) => ({
    label,
    count: posts.filter((p) => p.postTypeId?.includes(Number(id))).length,
  })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);

  const sponsorCounts: Record<string, number> = {};
  posts.forEach((p) => {
    p.sponsors?.forEach((s) => {
      if (s !== "Oberlin College") {
        sponsorCounts[s] = (sponsorCounts[s] ?? 0) + 1;
      }
    });
  });
  const topSponsors = Object.entries(sponsorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="p-6 text-sm text-[var(--muted)]">Loading analysis…</div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Operational Intelligence
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          AI extraction quality, confidence scores, and event type breakdown.
        </p>
      </div>

      {totalPosts === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
          <p className="font-semibold text-[var(--text)]">No data yet.</p>
          <p className="mt-2">Run the pipeline from the Sources page to generate AI analysis.</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Processed", value: totalPosts },
              { label: "Avg AI Confidence", value: `${avgConfidence}%` },
              { label: "Auto-Rejection Rate", value: `${rejectionRate}%` },
              { label: "Pipeline Runs", value: jobs.length },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">{label}</p>
                <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* Event type breakdown */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <h2 className="font-semibold text-[var(--text)] mb-4">Event Type Breakdown</h2>
              <div className="space-y-2">
                {typeCounts.map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <span className="w-44 shrink-0 text-[var(--muted)] truncate">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--primary)] rounded-full"
                        style={{ width: `${Math.round((count / totalPosts) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-[var(--muted)] tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top sponsors */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <h2 className="font-semibold text-[var(--text)] mb-4">Top Departments / Sponsors</h2>
              {topSponsors.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No sponsor data extracted yet.</p>
              ) : (
                <div className="space-y-2">
                  {topSponsors.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--muted)] truncate">{name}</span>
                      <span className="font-medium text-[var(--text)] tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pipeline runs */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
            <h2 className="font-semibold text-[var(--text)] mb-4">Recent Pipeline Runs</h2>
            <div className="space-y-2 text-sm">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-4 text-[var(--muted)]">
                  <span className="w-40 shrink-0">{new Date(job.startedAt).toLocaleString()}</span>
                  <span className="text-[var(--text)]">{job.totalFetched} fetched</span>
                  <span className="text-teal-400">{job.totalQueued} queued</span>
                  <span className="text-red-400">{job.totalRejected} rejected</span>
                  <span className={job.status === "completed" ? "text-teal-400" : "text-red-400"}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
