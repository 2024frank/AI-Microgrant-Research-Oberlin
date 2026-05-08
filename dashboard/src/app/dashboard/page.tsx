"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

type RunReport = {
  id?: string;
  status?: "success" | "failed" | "partial";
  startedAt?: string;
  finishedAt?: string;
  sourceId?: string;
  sourceName?: string;
  found?: number;
  queued?: number;
  rejected?: number;
  duplicates?: number;
  recurringSkipped?: number;
  errors?: string[];
};

type GlobalStats = {
  totalPushed?: number;
  lastPushedAt?: string;
};

const SOURCE_COUNT = 8;

function timeAgo(iso?: string) {
  if (!iso) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatCard({ label, value, sub, tone = "default" }: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "good" | "warn";
}) {
  const color = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
      <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold mb-1 ${color}`}>{value}</p>
      <p className="text-zinc-600 text-xs">{sub}</p>
    </div>
  );
}

export default function OverviewPage() {
  const { user, isAdmin } = useAuth();
  const [pending, setPending] = useState(0);
  const [duplicates, setDuplicates] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [global, setGlobal] = useState<GlobalStats>({});
  const [reports, setReports] = useState<RunReport[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<Record<string, unknown> | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const db = getClientDb();
    const pendingQuery = query(collection(db, "review_queue"), where("status", "==", "pending"));
    const duplicateQuery = query(collection(db, "duplicates"), where("status", "==", "pending"));
    const rejectedQuery = query(collection(db, "rejected"), where("status", "==", "rejected"));
    const unsubPending = onSnapshot(pendingQuery, snap => setPending(snap.size));
    const unsubDuplicates = onSnapshot(duplicateQuery, snap => setDuplicates(snap.size));
    const unsubRejected = onSnapshot(rejectedQuery, snap => setRejected(snap.size));
    const unsubGlobal = onSnapshot(doc(db, "syncs", "global"), snap => {
      if (snap.exists()) setGlobal(snap.data() as GlobalStats);
    });
    const reportsQuery = query(collection(db, "automation_runs"), orderBy("finishedAt", "desc"), limit(6));
    const unsubReports = onSnapshot(reportsQuery, snap => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as RunReport)));
    });

    return () => {
      unsubPending();
      unsubDuplicates();
      unsubRejected();
      unsubGlobal();
      unsubReports();
    };
  }, []);

  const totals = useMemo(() => reports.reduce<{ found: number; queued: number; recurringSkipped: number }>(
    (acc, run) => ({
      found: acc.found + (run.found ?? 0),
      queued: acc.queued + (run.queued ?? 0),
      recurringSkipped: acc.recurringSkipped + (run.recurringSkipped ?? 0),
    }),
    { found: 0, queued: 0, recurringSkipped: 0 }
  ), [reports]);

  const latest = reports[0];

  async function runHealthCheck() {
    setHealthError(null);
    setHealthResult(null);
    setHealthLoading(true);
    try {
      if (!user) throw new Error("Not signed in");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
      setHealthResult(data as Record<string, unknown>);
    } catch (err: unknown) {
      setHealthError(err instanceof Error ? err.message : String(err));
    } finally {
      setHealthLoading(false);
    }
  }

  async function copyIdToken() {
    if (!user) return;
    const idToken = await user.getIdToken();
    await navigator.clipboard.writeText(idToken);
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <p className="text-[#C8102E] text-xs font-semibold uppercase tracking-wide mb-2">Fresh automation dashboard</p>
        <h1 className="text-white text-2xl font-bold tracking-tight">Source Operations</h1>
        <p className="text-zinc-500 text-sm mt-1 max-w-3xl">
          Automations fetch public community events, skip recurring submissions, record duplicates, and queue clean payloads for dashboard review before CommunityHub review.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Sources ready" value={String(SOURCE_COUNT)} sub="Experience Oberlin paused" tone="good" />
        <StatCard label="Pending review" value={String(pending)} sub="ready for local approval" tone={pending > 0 ? "warn" : "default"} />
        <StatCard label="Duplicates" value={String(duplicates)} sub="waiting in duplicate tab" />
        <StatCard label="Rejected" value={String(rejected)} sub="kept for research metrics" />
      </div>

      {isAdmin && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-white text-sm font-semibold">Admin Tools</h2>
              <p className="text-zinc-600 text-xs mt-1">Quickly verify server env + Firestore + CommunityHub.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => runHealthCheck()}
                disabled={healthLoading}
                className="px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-50 text-white text-xs font-semibold"
              >
                {healthLoading ? "Checking…" : "Run Health Check"}
              </button>
              <button
                onClick={() => copyIdToken()}
                className="px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-white text-xs font-semibold"
                title="Copies your Firebase ID token to clipboard"
              >
                Copy ID Token
              </button>
            </div>
          </div>

          {healthError && (
            <p className="mt-4 text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {healthError}
            </p>
          )}

          {healthResult && (
            <pre className="mt-4 text-[11px] text-zinc-300 bg-black/30 border border-white/[0.06] rounded-lg p-3 overflow-auto">
              {JSON.stringify(healthResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-5">
        <section className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white text-sm font-semibold">Latest Automation Reports</h2>
              <p className="text-zinc-600 text-xs mt-1">Each run should write one report per source.</p>
            </div>
            <p className="text-zinc-600 text-xs">{latest ? `latest ${timeAgo(latest.finishedAt)}` : "no reports yet"}</p>
          </div>

          {reports.length === 0 ? (
            <div className="border border-dashed border-white/[0.09] rounded-lg p-6">
              <p className="text-zinc-400 text-sm">No automation reports yet.</p>
              <p className="text-zinc-600 text-xs mt-1">When the runner exists, it should save found, queued, rejected, duplicate, recurring-skip, and error counts here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(report => (
                <div key={report.id} className="rounded-lg bg-black/20 border border-white/[0.06] p-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="text-white text-sm font-medium">{report.sourceName ?? report.sourceId ?? "Unknown source"}</p>
                      <p className="text-zinc-600 text-xs">{report.finishedAt ? new Date(report.finishedAt).toLocaleString() : "run time missing"}</p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${
                      report.status === "success" ? "bg-emerald-400/10 text-emerald-300" :
                      report.status === "failed" ? "bg-red-400/10 text-red-300" :
                      "bg-amber-400/10 text-amber-300"
                    }`}>
                      {report.status ?? "pending"}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      ["Found", report.found],
                      ["Queued", report.queued],
                      ["Rejected", report.rejected],
                      ["Duplicates", report.duplicates],
                      ["Recurring", report.recurringSkipped],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wide">{label}</p>
                        <p className="text-white text-sm font-semibold mt-0.5">{String(value ?? 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
            <h2 className="text-white text-sm font-semibold mb-4">Run Totals From Recent Reports</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Found</p>
                <p className="text-white text-2xl font-bold mt-1">{totals.found}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Queued</p>
                <p className="text-emerald-400 text-2xl font-bold mt-1">{totals.queued}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Recurring skipped</p>
                <p className="text-amber-300 text-2xl font-bold mt-1">{totals.recurringSkipped}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
            <h2 className="text-white text-sm font-semibold mb-3">CommunityHub Submissions</h2>
            <p className="text-white text-3xl font-bold">{global.totalPushed ?? 0}</p>
            <p className="text-zinc-600 text-xs mt-1">last submitted {timeAgo(global.lastPushedAt)}</p>
          </div>

          <div className="bg-[#C8102E]/10 border border-[#C8102E]/20 rounded-xl p-5">
            <h2 className="text-white text-sm font-semibold mb-2">Runner Rules</h2>
            <div className="space-y-2 text-zinc-300 text-xs leading-relaxed">
              <p>Only public community events enter review.</p>
              <p>Recurring source events are skipped for submission and counted in reports.</p>
              <p>Oberlin athletics are rejected even when public.</p>
              <p>Every queued payload must include source name and source URL.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
