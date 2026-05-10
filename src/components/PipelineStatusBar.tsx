"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle, X, Square } from "lucide-react";
import Link from "next/link";
import type { PipelineJob } from "@/lib/pipelineJobs";

const JOB_KEY = "civic_running_job_id";

export function setRunningJobId(jobId: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(JOB_KEY, jobId);
  }
}

export function clearRunningJobId() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(JOB_KEY);
  }
}

export function PipelineStatusBar() {
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [stopping, setStopping] = useState(false);

  const startPolling = useCallback((jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const { clientGetPipelineJob } = await import("@/lib/pipelineJobsClient");
        const j = await clientGetPipelineJob(jobId);
        if (!j) { clearInterval(interval); return; }
        setJob(j);
        setDismissed(false);
        if (j.status !== "running") {
          clearInterval(interval);
          if (j.status === "completed") clearRunningJobId();
        }
      } catch { clearInterval(interval); }
    }, 2000);
    return interval;
  }, []);

  useEffect(() => {
    const jobId = localStorage.getItem(JOB_KEY);
    if (!jobId) return;

    // Load once immediately
    (async () => {
      try {
        const { clientGetPipelineJob } = await import("@/lib/pipelineJobsClient");
        const j = await clientGetPipelineJob(jobId);
        if (!j) { clearRunningJobId(); return; }
        setJob(j);
        if (j.status === "running") startPolling(jobId);
        else clearRunningJobId();
      } catch { clearRunningJobId(); }
    })();
  }, [startPolling]);

  // Listen for new job starts (dispatched by Sources page)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === JOB_KEY && e.newValue) {
        setDismissed(false);
        startPolling(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [startPolling]);

  if (!job || dismissed) return null;
  if (job.status !== "running" && job.status !== "completed" && job.status !== "failed") return null;

  const progress = job.progressTotal > 0 ? Math.round((job.progress / job.progressTotal) * 100) : 0;
  const isRunning = job.status === "running";
  const isDone = job.status === "completed";
  const isFailed = job.status === "failed";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[#0e0e0e] shadow-2xl md:left-[240px]">
      {/* Collapsed progress bar always visible */}
      {isRunning && (
        <div className="h-0.5 bg-[var(--surface)]">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="px-4 py-2.5 flex items-center gap-3">
        {/* Status icon */}
        {isRunning && <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin shrink-0" />}
        {isDone && <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />}
        {isFailed && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}

        {/* Summary line */}
        <div className="flex-1 min-w-0">
          {isRunning ? (
            <span className="text-sm text-[var(--text)]">
              Pipeline running —{" "}
              <span className="text-[var(--primary)] font-medium tabular-nums">{job.progress}</span>
              <span className="text-[var(--muted)]"> / {job.progressTotal} events processed</span>
              {job.totalQueued > 0 && <span className="text-teal-400"> · {job.totalQueued} queued</span>}
              {job.totalRejected > 0 && <span className="text-red-400"> · {job.totalRejected} rejected</span>}
            </span>
          ) : isDone ? (
            <span className="text-sm text-[var(--text)]">
              Pipeline complete —{" "}
              <span className="text-teal-400 font-medium">{job.totalQueued} queued for review</span>
              {job.totalRejected > 0 && <span className="text-[var(--muted)]"> · {job.totalRejected} rejected</span>}
              {job.totalDuplicates > 0 && <span className="text-amber-400"> · {job.totalDuplicates} duplicates</span>}
              <Link href="/posts" className="ml-2 text-[var(--primary)] underline-offset-2 hover:underline">
                Review now →
              </Link>
            </span>
          ) : (
            <span className="text-sm text-red-400">Pipeline failed: {job.error ?? "Unknown error"}</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning && (
            <button
              onClick={async () => {
                if (!job) return;
                setStopping(true);
                await fetch("/api/pipeline/cancel", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ jobId: job.id }),
                });
                clearRunningJobId();
                setJob((j) => j ? { ...j, status: "failed", error: "Cancelled by admin" } : j);
                setStopping(false);
              }}
              disabled={stopping}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-800/50 hover:bg-red-900/50 disabled:opacity-50 transition-colors"
            >
              {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 fill-current" />}
              Stop
            </button>
          )}
          <button onClick={() => setExpanded((v) => !v)} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          {!isRunning && (
            <button onClick={() => setDismissed(true)} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-4 sm:grid-cols-4 xl:grid-cols-7 gap-2">
          {[
            { label: "From Localist", value: job.totalFetched, color: "text-[var(--text)]" },
            { label: "New This Run", value: job.progressTotal, color: "text-[var(--primary)]" },
            { label: "Queued for Review", value: job.totalQueued, color: "text-teal-400" },
            { label: "Auto-Rejected", value: job.totalRejected, color: "text-red-400" },
            { label: "Duplicate Flags", value: job.totalDuplicates, color: "text-amber-400" },
            { label: "Already Ingested", value: job.totalSkipped, color: "text-[var(--muted)]" },
            {
              label: "Progress",
              value: isRunning ? `${progress}%` : isDone ? "Done" : "Failed",
              color: isRunning ? "text-[var(--primary)]" : isDone ? "text-teal-400" : "text-red-400",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-0.5 leading-tight">{label}</p>
              <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
