"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck, Copy, Database, Play, Loader2 } from "lucide-react";
import Link from "next/link";

import { ActivityFeed, type ActivityItem } from "@/components/ActivityFeed";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { ComponentProps } from "react";
import type { ReviewPost } from "@/lib/postTypes";
import type { PipelineJob } from "@/lib/pipelineJobs";

type DashStats = {
  pending: number;
  duplicate: number;
  total: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats>({ pending: 0, duplicate: 0, total: 0 });
  const [recentPosts, setRecentPosts] = useState<ReviewPost[]>([]);
  const [lastJob, setLastJob] = useState<PipelineJob | null>(null);
  const [running, setRunning] = useState(false);
  const [activity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    async function load() {
      const { getReviewPostStats, listReviewPosts } = await import("@/lib/reviewStoreClient");
      const { clientListPipelineJobs: listPipelineJobs } = await import("@/lib/pipelineJobsClient");

      const [s, recent, jobs] = await Promise.all([
        getReviewPostStats(),
        listReviewPosts({ maxResults: 5 }),
        listPipelineJobs(1),
      ]);

      setStats({ pending: s.pending, duplicate: s.duplicate, total: s.total });
      setRecentPosts(recent);
      if (jobs.length > 0) setLastJob(jobs[0]);
    }
    load();
  }, []);

  async function handleRunPipeline() {
    setRunning(true);
    try {
      const res = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: "localist-oberlin", sourceName: "Localist – Oberlin College Calendar" }),
      });
      const data = await res.json();
      if (data.jobId) {
        const { setRunningJobId } = await import("@/components/PipelineStatusBar");
        setRunningJobId(data.jobId);
      }
    } finally {
      setRunning(false);
    }
  }

  const columns: DataTableColumn<ReviewPost>[] = [
    {
      key: "title",
      header: "Post",
      render: (post) => (
        <div>
          <Link
            href={`/posts/${post.id}`}
            className="font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors"
          >
            {post.title}
          </Link>
          <p className="text-xs text-[var(--muted)]">{post.sourceName}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (post) => <PostTypeBadge type={post.eventType === "ot" ? "event" : "announcement"} />,
    },
    {
      key: "status",
      header: "Status",
      render: (post) => {
        const s = post.status;
        const mapped: ComponentProps<typeof StatusBadge>["status"] =
          s === "needs_correction" ? "flagged"
          : s === "published" ? "published"
          : s === "duplicate" ? "duplicate"
          : (s as ComponentProps<typeof StatusBadge>["status"]);
        return <StatusBadge status={mapped} />;
      },
    },
    {
      key: "date",
      header: "Date",
      render: (post) =>
        post.sessions?.[0]?.startTime
          ? new Date(Number(post.sessions[0].startTime) * 1000).toLocaleDateString()
          : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Content Overview
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Monitor incoming civic posts, source health, duplicate risk, and review workload.
          </p>
        </div>
        <button
          onClick={handleRunPipeline}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Starting…" : "Run Pipeline"}
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarCheck}
          label="Pending Reviews"
          value={String(stats.pending)}
          detail={stats.pending > 0 ? `${stats.pending} posts need review` : "No pending reviews."}
        />
        <StatCard
          icon={Database}
          label="Total Ingested"
          value={String(stats.total)}
          detail="Events processed by the pipeline"
          tone="teal"
        />
        <StatCard
          icon={Copy}
          label="Duplicate Warnings"
          value={String(stats.duplicate)}
          detail={stats.duplicate > 0 ? "Resolve in Duplicate Detection" : "No duplicates found."}
          tone="danger"
        />
        <StatCard
          icon={AlertTriangle}
          label="Last Pipeline Run"
          value={lastJob ? (lastJob.status === "completed" ? "✓ Done" : lastJob.status) : "None"}
          detail={
            lastJob
              ? `${lastJob.totalQueued} queued · ${lastJob.totalRejected} rejected`
              : "No pipeline runs yet."
          }
        />
      </section>

      {lastJob && (
        <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--muted)] flex items-center gap-3">
          <Database className="w-4 h-4 text-[var(--primary)] shrink-0" />
          <span>
            Last pipeline:{" "}
            <span className="text-[var(--text)]">
              {new Date(lastJob.startedAt).toLocaleString()}
            </span>{" "}
            · {lastJob.totalFetched} fetched · {lastJob.totalQueued} queued ·{" "}
            {lastJob.totalRejected} rejected
          </span>
          <Link
            href="/sources"
            className="ml-auto text-[var(--primary)] hover:underline shrink-0"
          >
            Manage sources →
          </Link>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
                Recent Events
              </h2>
              <Link href="/posts" className="text-sm text-[var(--primary)] hover:underline">
                View all →
              </Link>
            </div>
            <DataTable
              columns={columns}
              emptyText="No posts ingested yet. Run the pipeline to fetch events."
              rows={recentPosts}
              getRowKey={(post) => post.id}
            />
          </div>
        </div>

        <aside className="space-y-6">
          <ActivityFeed items={activity} emptyText="No activity logs yet." />
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
            <h2 className="font-[var(--font-public-sans)] text-lg font-semibold text-[var(--text)] mb-2">
              Quick Links
            </h2>
            <div className="space-y-1 text-sm">
              {[
                { href: "/posts", label: "Review Queue" },
                { href: "/duplicate-detection", label: "Duplicate Detection" },
                { href: "/ai-analysis", label: "AI Analysis" },
                { href: "/logs", label: "Pipeline Logs" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="block px-3 py-2 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
