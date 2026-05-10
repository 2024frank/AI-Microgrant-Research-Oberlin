"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PipelineJob } from "@/lib/pipelineJobs";

type FilterStatus = "all" | "completed" | "failed" | "running";

function scoreRun(job: PipelineJob): { score: number; label: string; color: string } {
  if (job.status === "failed") return { score: 0, label: "Failed", color: "text-red-400" };
  if (job.status === "running") return { score: -1, label: "Running", color: "text-amber-400" };
  if (job.totalFetched === 0) return { score: 0, label: "No events", color: "text-[var(--muted)]" };

  const queueRate = job.totalQueued / Math.max(job.totalFetched, 1);
  const skipRate = job.totalSkipped / Math.max(job.totalFetched, 1);
  const dupRate = job.totalDuplicates / Math.max(job.totalFetched, 1);

  let score = Math.round(queueRate * 70 + skipRate * 20 - dupRate * 10);
  score = Math.max(0, Math.min(100, score));

  if (score >= 70) return { score, label: "Good", color: "text-teal-400" };
  if (score >= 40) return { score, label: "Moderate", color: "text-amber-400" };
  return { score, label: "Low yield", color: "text-red-400" };
}

function duration(job: PipelineJob) {
  if (!job.completedAt) return "—";
  const s = Math.round((job.completedAt - job.startedAt) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function LogsPage() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    async function load() {
      const { clientListPipelineJobs } = await import("@/lib/pipelineJobsClient");
      const j = await clientListPipelineJobs(100);
      setJobs(j);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = jobs.filter((j) => filter === "all" || j.status === filter);

  const completed = jobs.filter((j) => j.status === "completed");
  const totalQueued = completed.reduce((s, j) => s + j.totalQueued, 0);
  const totalRejected = completed.reduce((s, j) => s + j.totalRejected, 0);
  const totalFetched = completed.reduce((s, j) => s + j.totalFetched, 0);
  const avgQueueRate = totalFetched > 0 ? Math.round((totalQueued / totalFetched) * 100) : 0;

  // Trend: compare last 3 runs vs previous 3
  const recent = completed.slice(0, 3);
  const previous = completed.slice(3, 6);
  const recentAvgQueue = recent.length ? recent.reduce((s, j) => s + j.totalQueued, 0) / recent.length : 0;
  const prevAvgQueue = previous.length ? previous.reduce((s, j) => s + j.totalQueued, 0) / previous.length : 0;
  const trend = recentAvgQueue > prevAvgQueue + 1 ? "up" : recentAvgQueue < prevAvgQueue - 1 ? "down" : "flat";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">Pipeline Logs</h1>
        <p className="mt-2 text-[var(--muted)]">Full audit trail with yield scoring and AI performance tracking.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-8 text-center text-sm text-[var(--muted)]">
          No pipeline runs yet. Go to Sources and click Run Now.
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Runs", value: jobs.length, sub: `${completed.length} completed` },
              { label: "Events Queued", value: totalQueued, sub: `${avgQueueRate}% queue rate` },
              { label: "Auto-Rejected", value: totalRejected, sub: "Athletics + ineligible" },
              {
                label: "Queue Trend",
                value: trend === "up" ? "↑ Improving" : trend === "down" ? "↓ Declining" : "→ Stable",
                sub: "vs previous 3 runs",
                color: trend === "up" ? "text-teal-400" : trend === "down" ? "text-red-400" : "text-[var(--muted)]",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${color ?? "text-[var(--text)]"}`}>{value}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-2">
            {(["all", "completed", "failed", "running"] as FilterStatus[]).map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors capitalize ${filter === s ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"}`}>
                {s} {s === "all" ? `(${jobs.length})` : `(${jobs.filter(j => j.status === s).length})`}
              </button>
            ))}
          </div>

          {/* Runs table */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-[var(--surface-high)]">
                  <tr>
                    {["Date", "Source", "Fetched", "Queued", "Rejected", "Dupes", "Skipped", "Duration", "Yield Score", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] border-b border-[var(--border)] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job) => {
                    const { score, label, color } = scoreRun(job);
                    return (
                      <tr key={job.id} className="border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 tabular-nums text-xs text-[var(--muted)] whitespace-nowrap">{new Date(job.startedAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-[var(--text)]">{job.sourceName}</td>
                        <td className="px-4 py-3 tabular-nums">{job.totalFetched}</td>
                        <td className="px-4 py-3 tabular-nums text-teal-400 font-medium">{job.totalQueued}</td>
                        <td className="px-4 py-3 tabular-nums text-red-400">{job.totalRejected}</td>
                        <td className="px-4 py-3 tabular-nums text-amber-400">{job.totalDuplicates}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{job.totalSkipped}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{duration(job)}</td>
                        <td className="px-4 py-3">
                          {score >= 0 ? (
                            <span className="flex items-center gap-1.5">
                              {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              <span className={`text-xs font-medium ${color}`}>{label} {score > 0 ? `(${score})` : ""}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> running</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {job.status === "completed" ? <CheckCircle className="w-4 h-4 text-teal-400" /> :
                           job.status === "failed" ? <XCircle className="w-4 h-4 text-red-400" /> :
                           <Clock className="w-4 h-4 text-amber-400 animate-pulse" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Yield score explanation */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-xs text-[var(--muted)]">
            <p className="font-semibold text-[var(--text)] mb-1">Yield Score algorithm</p>
            <p>Score = (queued/fetched × 70) + (skipped/fetched × 20) − (duplicates/fetched × 10). Capped 0–100. High skip rate is good (means idempotency is working). High duplicate rate lowers score.</p>
          </div>
        </>
      )}
    </div>
  );
}
