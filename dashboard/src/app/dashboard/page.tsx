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

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
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
          sub={localist ? `across all runs` : "waiting for first run"}
        />
        <StatCard
          label="Active Sources"
          value="1"
          sub="Oberlin Localist"
        />
        <StatCard
          label="Last Run"
          value={localist ? timeAgo(localist.lastRun) : "—"}
          sub={localist ? new Date(localist.lastRun).toLocaleString() : "no data yet"}
        />
        <StatCard
          label="Last Run Result"
          value={localist ? (localist.failed === 0 ? "Clean" : `${localist.failed} failed`) : "—"}
          sub={localist ? `${localist.pushed} pushed · ${localist.skipped} skipped` : "no data yet"}
          highlight={localist?.failed === 0}
        />
      </div>

      {/* Sources table */}
      <h2 className="text-white text-base font-semibold mb-4">Calendar Sources</h2>
      <div className="space-y-3">

        {/* Localist — live with real data */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/[0.06]">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Source</p>
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Last Pushed</p>
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Pushed</p>
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Skipped</p>
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Failed</p>
          </div>

          <div className="grid grid-cols-5 gap-4 px-5 py-4 items-start">
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

            <p className="text-zinc-300 text-sm">
              {localist ? (
                <span className="text-emerald-400 font-medium">{localist.pushed}</span>
              ) : <span className="text-zinc-600">—</span>}
            </p>

            <div>
              <p className="text-zinc-300 text-sm">
                {localist ? localist.skipped : <span className="text-zinc-600">—</span>}
              </p>
              {localist && localist.skipped > 0 && (
                <p className="text-zinc-600 text-xs mt-0.5">{localist.skippedReason}</p>
              )}
            </div>

            <div>
              <p className="text-sm">
                {localist ? (
                  localist.failed > 0 ? (
                    <span className="text-red-400 font-medium">{localist.failed}</span>
                  ) : (
                    <span className="text-zinc-400">0</span>
                  )
                ) : <span className="text-zinc-600">—</span>}
              </p>
              {localist && localist.failedEvents?.length > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-red-400/70 hover:text-red-400 text-xs mt-0.5 transition"
                >
                  {expanded ? "Hide details" : "See why"}
                </button>
              )}
            </div>
          </div>

          {/* Failed events expanded */}
          {expanded && localist && localist.failedEvents?.length > 0 && (
            <div className="border-t border-white/[0.06] px-5 py-4 space-y-2">
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-3">Failed Events</p>
              {localist.failedEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                  <div>
                    <p className="text-white">{e.title}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{e.reason}</p>
                  </div>
                </div>
              ))}
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

      {/* What's next */}
      <div className="mt-8 bg-[#C8102E]/[0.06] border border-[#C8102E]/20 rounded-xl p-5">
        <p className="text-[#C8102E] text-xs font-semibold uppercase tracking-wide mb-2">Up Next</p>
        <p className="text-white text-sm font-medium mb-1">AI Deduplication Agent</p>
        <p className="text-zinc-400 text-sm">
          The AI agent will compare incoming events against the calendar and flag potential duplicates for human review. Flagged events will appear in the Duplicates tab.
        </p>
      </div>
    </div>
  );
}
