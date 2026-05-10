"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Database,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  RefreshCw,
} from "lucide-react";
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

  useEffect(() => {
    async function load() {
      const { ensureDefaultSources, getSource } = await import("@/lib/sourcesClient");
      await ensureDefaultSources();
      const s = await getSource("localist-oberlin");
      if (s) {
        setSource(s);
        setSchedule(s.schedule ?? "off");
        if (s.lastJobId) {
          const { clientGetPipelineJob: getPipelineJob } = await import("@/lib/pipelineJobsClient");
          const lastJob = await getPipelineJob(s.lastJobId);
          if (lastJob) setCurrentJob(lastJob);
        }
      }
    }
    load();
  }, []);

  const pollJob = useCallback(async (id: string) => {
    const interval = setInterval(async () => {
      const { clientGetPipelineJob: getPipelineJob } = await import("@/lib/pipelineJobsClient");
      const job = await getPipelineJob(id);
      if (!job) return;
      setCurrentJob(job);
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
        body: JSON.stringify({
          sourceId: "localist-oberlin",
          sourceName: "Localist – Oberlin College Calendar",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start pipeline");
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

  const progress =
    currentJob && currentJob.progressTotal > 0
      ? Math.round((currentJob.progress / currentJob.progressTotal) * 100)
      : 0;

  function formatDate(ts?: number) {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Source Management
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Configure event sources and run the AI ingestion pipeline.
          </p>
        </div>
      </div>

      {/* Source Card */}
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-elevated)] overflow-hidden">
        <div className="flex items-start gap-4 p-5 border-b border-[var(--border)]">
          <div className="p-2 rounded-md bg-[var(--surface)]">
            <Database className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-[var(--text)]">
                Localist – Oberlin College Calendar
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-900/30 text-teal-400 border border-teal-800/40">
                Active
              </span>
            </div>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              calendar.oberlin.edu · Community-open events only · Athletics auto-rejected
            </p>
          </div>
          <button
            onClick={handleRunNow}
            disabled={jobStatus === "running"}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {jobStatus === "running" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {jobStatus === "running" ? "Running…" : "Run Now"}
          </button>
        </div>

        {/* Schedule Config */}
        <div className="p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm font-medium text-[var(--text)]">Auto-run schedule</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["off", "daily", "weekly", "biweekly"] as SourceSchedule[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setSchedule(opt)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  schedule === opt
                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                    : "text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                }`}
              >
                {opt === "off" ? "Off" : opt === "daily" ? "Daily" : opt === "weekly" ? "Weekly" : "Bi-weekly"}
              </button>
            ))}
            {schedule !== (source?.schedule ?? "off") && (
              <button
                onClick={handleSaveSchedule}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-md hover:bg-[var(--primary)] hover:text-white transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Save
              </button>
            )}
          </div>
          {source?.nextRun && schedule !== "off" && (
            <p className="text-xs text-[var(--muted)] mt-2">
              Next scheduled run: {formatDate(source.nextRun)}
            </p>
          )}
        </div>

        {/* Progress / Result */}
        <div className="p-5">
          {jobStatus === "running" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">Processing events…</span>
                {currentJob && (
                  <span className="text-[var(--text)] font-medium tabular-nums">
                    {currentJob.progress} / {currentJob.progressTotal}
                  </span>
                )}
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {currentJob && (
                <div className="flex gap-4 text-xs text-[var(--muted)] pt-1">
                  <span>Queued: {currentJob.totalQueued}</span>
                  <span>Rejected: {currentJob.totalRejected}</span>
                  <span>Duplicates: {currentJob.totalDuplicates}</span>
                  <span>Skipped: {currentJob.totalSkipped}</span>
                </div>
              )}
            </div>
          )}

          {jobStatus === "completed" && currentJob && (
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--text)]">Pipeline completed</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                  <span>{currentJob.totalFetched} fetched</span>
                  <span className="text-teal-400">{currentJob.totalQueued} queued for review</span>
                  <span className="text-red-400">{currentJob.totalRejected} auto-rejected</span>
                  <span className="text-amber-400">{currentJob.totalDuplicates} duplicates</span>
                  <span>{currentJob.totalSkipped} already ingested</span>
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

          {jobStatus === "idle" && currentJob?.status === "completed" && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <Calendar className="w-3.5 h-3.5" />
              <span>Last run: {formatDate(currentJob.startedAt)}</span>
              <span>·</span>
              <span className="text-teal-400">{currentJob.totalQueued} events queued</span>
            </div>
          )}

          {jobStatus === "idle" && !currentJob && (
            <p className="text-sm text-[var(--muted)]">
              No pipeline runs yet. Click <strong className="text-[var(--text)]">Run Now</strong> to start the first fetch.
            </p>
          )}
        </div>
      </div>

      {/* Pipeline info */}
      <div className="border border-[var(--border)] rounded-lg p-5 bg-[var(--surface-elevated)]">
        <h3 className="text-sm font-semibold text-[var(--text)] mb-3">How the pipeline works</h3>
        <ol className="space-y-2 text-sm text-[var(--muted)]">
          {[
            "Fetch events open to all community members from Localist",
            "Skip events already ingested (idempotency check)",
            "Extraction Agent (Gemini) — classify post type, location, sponsors",
            "Editor Agent (Gemini) — write clean, screen-ready descriptions",
            "Community Hub dedup check — flag if similar post already exists",
            "Write results to review queue in Firestore",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--surface)] text-xs flex items-center justify-center text-[var(--primary)] font-medium mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
