"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface FailedEvent {
  title: string;
  reason: string;
}

interface SourceStats {
  source: string;
  pushed: number;
  skipped: number;
  skippedReason: string;
  failed: number;
  failedEvents: FailedEvent[];
  total: number;
  lastRun: string;
}

const plannedSources = [
  { name: "FAVA", url: "—" },
  { name: "AMAM", url: "—" },
  { name: "City of Oberlin", url: "—" },
];

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatCard({ label, value, sub, highlight, dim }: { label: string; value: string; sub: string; highlight?: boolean; dim?: boolean }) {
  return (
    <div className={`bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 ${dim ? "opacity-40" : ""}`}>
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold mb-1 ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</p>
      <p className="text-zinc-600 text-xs">{sub}</p>
    </div>
  );
}

export default function OverviewPage() {
  const [localist, setLocalist] = useState<SourceStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "syncs", "localist"), (snap) => {
      if (snap.exists()) setLocalist(snap.data() as SourceStats);
    });
    return unsub;
  }, []);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-zinc-500 text-sm mt-1">Oberlin Community Calendar Unification — AI Micro-Grant Research</p>
        </div>
        {localist && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Total Events on Calendar"
          value={localist ? localist.total.toString() : "—"}
          sub={localist ? "across all runs" : "waiting for first run"}
        />
        <StatCard
          label="Active Sources"
          value="1"
          sub="Oberlin Localist"
        />
        <StatCard
          label="Last Run"
          value={localist ? timeAgo(localist.lastRun) : "—"}
          sub={localist ? new Date(localist.lastRun).toLocaleString() : "no sync run yet"}
          dim={!localist}
        />
        <StatCard
          label="Last Run Result"
          value={localist ? (localist.failed === 0 ? "Clean" : `${localist.failed} failed`) : "—"}
          sub={localist ? `${localist.pushed} pushed · ${localist.skipped} skipped` : "no sync run yet"}
          highlight={!!localist && localist.failed === 0}
          dim={!localist}
        />
      </div>

      {/* Sources table */}
      <h2 className="text-white text-base font-semibold mb-4">Calendar Sources</h2>
      <div className="space-y-3">

        {/* Localist — expandable */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/[0.06]">
            {["Source", "Last Pushed", "Pushed", "Skipped", "Failed"].map((h) => (
              <p key={h} className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</p>
            ))}
          </div>

          {/* Clickable row */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full grid grid-cols-5 gap-4 px-5 py-4 items-start text-left hover:bg-white/[0.02] transition group"
          >
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <p className="text-white text-sm font-medium">Oberlin Localist</p>
              </div>
              <p className="text-zinc-600 text-xs pl-3.5">calendar.oberlin.edu</p>
            </div>

            <p className="text-zinc-300 text-sm">
              {localist ? timeAgo(localist.lastRun) : <span className="text-zinc-600">—</span>}
            </p>

            <p className="text-sm">
              {localist ? <span className="text-emerald-400 font-medium">{localist.pushed}</span> : <span className="text-zinc-600">—</span>}
            </p>

            <div>
              <p className="text-zinc-300 text-sm">{localist ? localist.skipped : <span className="text-zinc-600">—</span>}</p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm">
                {localist ? (
                  localist.failed > 0
                    ? <span className="text-red-400 font-medium">{localist.failed}</span>
                    : <span className="text-zinc-400">0</span>
                ) : <span className="text-zinc-600">—</span>}
              </p>
              <svg
                className={`w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Expanded details */}
          {expanded && (
            <div className="border-t border-white/[0.06] px-5 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.03] rounded-lg p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Skipped reason</p>
                  <p className="text-zinc-300 text-sm">{localist?.skippedReason || "—"}</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Last run timestamp</p>
                  <p className="text-zinc-300 text-sm">{localist ? new Date(localist.lastRun).toLocaleString() : "—"}</p>
                </div>
              </div>

              {localist && localist.failedEvents?.length > 0 ? (
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-3">Failed Events</p>
                  <div className="space-y-2">
                    {localist.failedEvents.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 bg-red-400/[0.05] border border-red-400/10 rounded-lg px-4 py-3">
                        <span className="text-red-400 shrink-0 mt-0.5 text-sm">✗</span>
                        <div>
                          <p className="text-white text-sm">{e.title}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">{e.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-zinc-600 text-sm">No failed events in the last run.</p>
              )}
            </div>
          )}
        </div>

        {/* Planned sources */}
        {plannedSources.map((s) => (
          <div key={s.name} className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
              <p className="text-zinc-500 text-sm font-medium">{s.name}</p>
              <span className="ml-2 text-zinc-700 text-xs border border-zinc-700 rounded-full px-2 py-0.5">Planned</span>
            </div>
          </div>
        ))}
      </div>

      {/* AI Analysis */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-white text-base font-semibold">AI Analysis</h2>
          <span className="text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-0.5">Coming Soon</span>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden opacity-50 pointer-events-none select-none">
          <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/[0.06]">
            {["Event", "Source", "Matched To", "Confidence", "Status"].map((h) => (
              <p key={h} className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {[
            { event: "Spring Concert", source: "Localist", match: "FAVA Calendar", confidence: "94%", status: "Duplicate" },
            { event: "Art Exhibition Opening", source: "AMAM", match: "Localist", confidence: "87%", status: "Duplicate" },
            { event: "Faculty Lecture Series", source: "Localist", match: "City Calendar", confidence: "61%", status: "Review" },
          ].map((row, i) => (
            <div key={i} className={`grid grid-cols-5 gap-4 px-5 py-4 ${i !== 2 ? "border-b border-white/[0.04]" : ""}`}>
              <p className="text-white text-sm">{row.event}</p>
              <p className="text-zinc-400 text-sm">{row.source}</p>
              <p className="text-zinc-400 text-sm">{row.match}</p>
              <p className="text-zinc-300 text-sm font-medium">{row.confidence}</p>
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                row.status === "Duplicate"
                  ? "bg-red-400/10 text-red-400 border border-red-400/20"
                  : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
              }`}>
                {row.status}
              </span>
            </div>
          ))}
        </div>
        <p className="text-zinc-600 text-xs mt-3 text-center">
          AI deduplication agent will populate this table once active
        </p>
      </div>
    </div>
  );
}
