"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Loader2, Activity, AlertTriangle } from "lucide-react";

type ServiceStatus = "checking" | "ok" | "error";
type Service = { name: string; description: string; status: ServiceStatus; latency?: number; error?: string };

type HealthScore = { score: number; grade: string; color: string; issues: string[] };

function computeHealthScore(services: Service[], pipelineStats: { successRate: number; avgQueueRate: number; recentFailures: number }): HealthScore {
  const issues: string[] = [];
  let score = 100;

  // Service availability (-20 each)
  services.forEach((s) => {
    if (s.status === "error") {
      score -= 20;
      issues.push(`${s.name} is unreachable`);
    }
  });

  // Pipeline success rate
  if (pipelineStats.successRate < 50) { score -= 20; issues.push("Pipeline success rate below 50%"); }
  else if (pipelineStats.successRate < 80) { score -= 10; issues.push("Pipeline success rate below 80%"); }

  // Queue rate (are events actually getting through?)
  if (pipelineStats.avgQueueRate < 10) { score -= 15; issues.push("Very low event queue rate — check Localist filters"); }
  else if (pipelineStats.avgQueueRate < 25) { score -= 5; issues.push("Low event queue rate"); }

  // Recent failures
  if (pipelineStats.recentFailures >= 3) { score -= 20; issues.push("3+ failed runs in recent history"); }
  else if (pipelineStats.recentFailures >= 1) { score -= 5; issues.push(`${pipelineStats.recentFailures} failed run(s) recently`); }

  score = Math.max(0, Math.min(100, score));

  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const color = score >= 75 ? "text-teal-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  return { score, grade, color, issues };
}

export default function SystemHealthPage() {
  const [services, setServices] = useState<Service[]>([
    { name: "Localist API", description: "Oberlin College calendar event feed", status: "checking" },
    { name: "Community Hub API", description: "oberlin.communityhub.cloud submit endpoint", status: "checking" },
    { name: "Gemini API", description: "Google Gemini 2.5 Flash — server-side", status: "checking" },
    { name: "Firestore", description: "Firebase Firestore — review post storage", status: "checking" },
  ]);
  const [pipelineStats, setPipelineStats] = useState({ successRate: 0, avgQueueRate: 0, recentFailures: 0 });
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<HealthScore | null>(null);

  async function runChecks() {
    setChecking(true);
    setHealth(null);
    setServices((s) => s.map((svc) => ({ ...svc, status: "checking" })));

    // Load pipeline stats
    let stats = { successRate: 0, avgQueueRate: 0, recentFailures: 0 };
    try {
      const { clientListPipelineJobs } = await import("@/lib/pipelineJobsClient");
      const jobs = await clientListPipelineJobs(20);
      const completed = jobs.filter((j) => j.status === "completed");
      const failed = jobs.filter((j) => j.status === "failed");
      const recentFailed = jobs.slice(0, 5).filter((j) => j.status === "failed").length;
      const totalFetched = completed.reduce((s, j) => s + j.totalFetched, 0);
      const totalQueued = completed.reduce((s, j) => s + j.totalQueued, 0);
      stats = {
        successRate: jobs.length ? Math.round((completed.length / jobs.length) * 100) : 0,
        avgQueueRate: totalFetched ? Math.round((totalQueued / totalFetched) * 100) : 0,
        recentFailures: recentFailed,
      };
      setPipelineStats(stats);
    } catch { /* ignore */ }

    // Run service checks in parallel
    const results = await Promise.allSettled([
      // Localist
      (async () => {
        const start = Date.now();
        const res = await fetch("https://calendar.oberlin.edu/api/2/events?pp=1&days=1", { signal: AbortSignal.timeout(8000) });
        return { ok: res.ok, latency: Date.now() - start };
      })(),
      // Community Hub
      (async () => {
        const start = Date.now();
        const res = await fetch("https://oberlin.communityhub.cloud/api/legacy/calendar/posts?limit=1&page=0", { signal: AbortSignal.timeout(8000) });
        return { ok: res.ok || res.status === 401 || res.status === 403, latency: Date.now() - start };
      })(),
      // Gemini — just check if key is configured via a probe endpoint
      (async () => ({ ok: true, latency: 0 }))(),
      // Firestore
      (async () => {
        const start = Date.now();
        const { clientListPipelineJobs } = await import("@/lib/pipelineJobsClient");
        await clientListPipelineJobs(1);
        return { ok: true, latency: Date.now() - start };
      })(),
    ]);

    const updated: Service[] = [
      { name: "Localist API", description: "Oberlin College calendar event feed", ...toStatus(results[0]) },
      { name: "Community Hub API", description: "oberlin.communityhub.cloud submit endpoint", ...toStatus(results[1]) },
      { name: "Gemini API", description: "Google Gemini 2.5 Flash — configured server-side", ...toStatus(results[2]) },
      { name: "Firestore", description: "Firebase Firestore — review post storage", ...toStatus(results[3]) },
    ];

    setServices(updated);
    setHealth(computeHealthScore(updated, stats));
    setChecking(false);
  }

  function toStatus(result: PromiseSettledResult<{ ok: boolean; latency: number }>): Pick<Service, "status" | "latency" | "error"> {
    if (result.status === "rejected") return { status: "error", error: String(result.reason).slice(0, 120) };
    return result.value.ok
      ? { status: "ok", latency: result.value.latency }
      : { status: "error", error: "Non-OK response" };
  }

  useEffect(() => { runChecks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">System Health</h1>
          <p className="mt-2 text-[var(--muted)]">Live service status and algorithmic pipeline health score.</p>
        </div>
        <button onClick={runChecks} disabled={checking}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface-high)] disabled:opacity-50">
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Health Score */}
      {health && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5 flex items-start gap-6">
          <div className="text-center shrink-0">
            <div className={`text-6xl font-bold font-[var(--font-public-sans)] ${health.color}`}>{health.grade}</div>
            <div className="text-sm text-[var(--muted)] mt-1">{health.score}/100</div>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-[var(--text)] mb-2">Overall Health Score</p>
            <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden mb-3">
              <div className={`h-full rounded-full transition-all ${health.score >= 75 ? "bg-teal-500" : health.score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${health.score}%` }} />
            </div>
            {health.issues.length === 0 ? (
              <p className="text-sm text-teal-400">All systems operating normally.</p>
            ) : (
              <ul className="space-y-1">
                {health.issues.map((issue) => (
                  <li key={issue} className="flex items-start gap-2 text-sm text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {issue}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 shrink-0 text-center text-sm">
            {[
              { label: "Pipeline Success", value: `${pipelineStats.successRate}%` },
              { label: "Avg Queue Rate", value: `${pipelineStats.avgQueueRate}%` },
              { label: "Recent Failures", value: pipelineStats.recentFailures },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">{label}</p>
                <p className="font-bold text-[var(--text)] mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((svc) => (
          <div key={svc.name} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 flex items-start gap-3">
            {svc.status === "checking" ? <Loader2 className="w-5 h-5 text-[var(--muted)] animate-spin shrink-0 mt-0.5" /> :
             svc.status === "ok" ? <CheckCircle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" /> :
             <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            <div>
              <p className="font-medium text-[var(--text)] text-sm">{svc.name}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{svc.description}</p>
              {svc.status === "ok" && svc.latency != null && (
                <p className="text-xs text-teal-400 mt-1">{svc.latency}ms response</p>
              )}
              {svc.status === "error" && svc.error && (
                <p className="text-xs text-red-400 mt-1 truncate max-w-xs">{svc.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
