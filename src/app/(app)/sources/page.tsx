"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Database, Play, Clock, CheckCircle, XCircle,
  Loader2, RefreshCw, InboxIcon, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import type { Source, SourceSchedule } from "@/lib/sources";
import type { PipelineJob } from "@/lib/pipelineJobs";

type JobStatus = "idle" | "running" | "completed" | "failed";

export default function SourcesPage() {
  const [source, setSource] = useState<Source | null>(null);
  const [schedule, setSchedule] = useState<SourceSchedule>("off");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [currentJob, setCurrentJob] = useState<PipelineJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState<number | null>(null);
  const [allJobs, setAllJobs] = useState<PipelineJob[]>([]);

  useEffect(() => {
    async function load() {
      const { ensureDefaultSources, getSource } = await import("@/lib/sourcesClient");
      const { clientListPipelineJobs } = await import("@/lib/pipelineJobsClient");
      const { getReviewPostStats } = await import("@/lib/reviewStoreClient");

      await ensureDefaultSources();
      const [s, jobs, stats] = await Promise.all([
        getSource("localist-oberlin"),
        clientListPipelineJobs(10),
        getReviewPostStats(),
      ]);

      if (s) {
        setSource(s);
        setSchedule(s.schedule ?? "off");
      }

      setAllJobs(jobs);
      setQueuedCount(stats.pending);

      // Resume polling if last job is still running
      if (jobs[0]?.status === "running") {
        setCurrentJob(jobs[0]);
        setJobStatus("running");
        pollJob(jobs[0].id);
      } else if (jobs[0]) {
        setCurrentJob(jobs[0]);
        setJobStatus(jobs[0].status === "completed" ? "completed" : "failed");
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollJob = useCallback(async (id: string) => {
    const interval = setInterval(async () => {
      const { clientGetPipelineJob } = await import("@/lib/pipelineJobsClient");
      const { getReviewPostStats } = await import("@/lib/reviewStoreClient");
      const job = await clientGetPipelineJob(id);
      if (!job) return;
      setCurrentJob(job);

      // Update queued count live
      const stats = await getReviewPostStats();
      setQueuedCount(stats.pending);

      if (job.status === "completed") {
        setJobStatus("completed");
        clearInterval(interval);
      } else if (job.status === "failed") {
        setJobStatus("failed");
        setError(job.error ?? "Pipeline failed");
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  async function handleRunNow() {
    setError(null);
    setJobStatus("running");
    setCurrentJob(null);
    try {
      const res = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: "localist-oberlin", sourceName: "Localist – Oberlin College Calendar" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start pipeline");
      // Write jobId to localStorage so global status bar picks it up on any page
      const { setRunningJobId } = await import("@/components/PipelineStatusBar");
      setRunningJobId(data.jobId);
      pollJob(data.jobId);
    } catch (err) {
      setJobStatus("failed");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handleSaveSchedule() {
    setSaving(true);
    try {
      const { updateSource } = await import("@/lib/sourcesClient");
      await updateSource("localist-oberlin", { schedule });
      setSource((s) => (s ? { ...s, schedule } : s));
    } finally {
      setSaving(false);
    }
  }

  const progress = currentJob && currentJob.progressTotal > 0
    ? Math.round((currentJob.progress / currentJob.progressTotal) * 100) : 0;

  function fmt(ts?: number) {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString();
  }

  const totalRuns = allJobs.length;
  const successRuns = allJobs.filter((j) => j.status === "completed").length;
  const totalQueued = allJobs.reduce((s, j) => s + j.totalQueued, 0);
  const totalRejected = allJobs.reduce((s, j) => s + j.totalRejected, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Source Management
          </h1>
          <p className="mt-2 text-[var(--muted)]">Configure sources and run the AI ingestion pipeline.</p>
        </div>
        {queuedCount !== null && queuedCount > 0 && (
          <Link href="/posts" className="flex items-center gap-2 px-4 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface-high)] transition-colors shrink-0">
            <InboxIcon className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-semibold">{queuedCount}</span> pending review
          </Link>
        )}
      </div>

      {/* Source Card */}
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-elevated)] overflow-hidden">
        <div className="flex items-start gap-4 p-5 border-b border-[var(--border)]">
          <div className="p-2 rounded-md bg-[var(--surface)]">
            <Database className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-[var(--text)]">Localist – Oberlin College Calendar</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-900/30 text-teal-400 border border-teal-800/40">Active</span>
            </div>
            <p className="text-sm text-[var(--muted)] mt-0.5">calendar.oberlin.edu · Community-open events only · Athletics auto-rejected</p>
            <div className="flex gap-4 mt-2 text-xs text-[var(--muted)]">
              <span>{totalRuns} runs</span>
              <span className="text-teal-400">{totalQueued} total queued</span>
              <span className="text-red-400">{totalRejected} total rejected</span>
              {source?.lastRun && <span>Last: {fmt(source.lastRun)}</span>}
            </div>
          </div>
          <button
            onClick={handleRunNow}
            disabled={jobStatus === "running"}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {jobStatus === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {jobStatus === "running" ? "Running…" : "Run Now"}
          </button>
        </div>

        {/* Schedule */}
        <div className="p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm font-medium text-[var(--text)]">Auto-run schedule</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["off", "daily", "weekly", "biweekly"] as SourceSchedule[]).map((opt) => (
              <button key={opt} onClick={() => setSchedule(opt)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${schedule === opt ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"}`}>
                {opt === "off" ? "Off" : opt === "daily" ? "Daily" : opt === "weekly" ? "Weekly" : "Bi-weekly"}
              </button>
            ))}
            {schedule !== (source?.schedule ?? "off") && (
              <button onClick={handleSaveSchedule} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-md hover:bg-[var(--primary)] hover:text-white transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Save
              </button>
            )}
          </div>
          {source?.nextRun && schedule !== "off" && (
            <p className="text-xs text-[var(--muted)] mt-2">Next run: {fmt(source.nextRun)}</p>
          )}
        </div>

        {/* Progress / Status */}
        <div className="p-5">
          {jobStatus === "running" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-[var(--muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                  Pipeline running…
                </span>
                {currentJob && <span className="text-[var(--text)] font-medium tabular-nums">{currentJob.progress} / {currentJob.progressTotal}</span>}
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden">
                <div className="h-full bg-[var(--primary)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              {currentJob && (
                <div className="flex flex-wrap gap-4 text-xs pt-1">
                  <span className="text-teal-400">Queued: {currentJob.totalQueued}</span>
                  <span className="text-red-400">Rejected: {currentJob.totalRejected}</span>
                  <span className="text-amber-400">Duplicates: {currentJob.totalDuplicates}</span>
                  <span className="text-[var(--muted)]">Skipped: {currentJob.totalSkipped}</span>
                </div>
              )}
            </div>
          )}

          {jobStatus === "completed" && currentJob && (
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Run completed · {fmt(currentJob.completedAt)}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)] mt-1">
                  <span>{currentJob.totalFetched} fetched</span>
                  <span className="text-teal-400">{currentJob.totalQueued} queued</span>
                  <span className="text-red-400">{currentJob.totalRejected} auto-rejected</span>
                  <span className="text-amber-400">{currentJob.totalDuplicates} duplicates</span>
                  <span>{currentJob.totalSkipped} skipped (already ingested)</span>
                </div>
              </div>
            </div>
          )}

          {jobStatus === "failed" && (
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Pipeline failed</p>
                <p className="text-xs text-red-400 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {jobStatus === "idle" && !currentJob && (
            <p className="text-sm text-[var(--muted)]">No runs yet. Click <strong className="text-[var(--text)]">Run Now</strong> to start.</p>
          )}
        </div>
      </div>

      {/* Recent runs mini-table */}
      {allJobs.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-elevated)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text)]">Recent Runs</h3>
            <Link href="/logs" className="text-xs text-[var(--primary)] hover:underline">View all logs →</Link>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {allJobs.slice(0, 5).map((job) => (
              <div key={job.id} className="px-5 py-3 flex items-center gap-4 text-sm">
                <span className="text-[var(--muted)] w-36 shrink-0 tabular-nums text-xs">{new Date(job.startedAt).toLocaleString()}</span>
                <span className="text-teal-400 shrink-0">{job.totalQueued} queued</span>
                <span className="text-red-400 shrink-0">{job.totalRejected} rejected</span>
                <span className={`ml-auto text-xs font-medium shrink-0 ${job.status === "completed" ? "text-teal-400" : job.status === "failed" ? "text-red-400" : "text-amber-400"}`}>
                  {job.status === "running" ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />running</span> : job.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GitHub Actions info */}
      <div className="border border-[var(--border)] rounded-lg p-5 bg-[var(--surface-elevated)]">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--text)] mb-1">GitHub Actions — Manual Run</p>
            <p className="text-sm text-[var(--muted)]">
              Go to your repo → <strong className="text-[var(--text)]">Actions → Pipeline Cron → Run workflow</strong> to trigger the pipeline from GitHub. Add <code className="bg-[var(--surface)] px-1 rounded text-xs">APP_URL</code> and <code className="bg-[var(--surface)] px-1 rounded text-xs">CRON_SECRET</code> to GitHub Secrets first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
