"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface SyncStats {
  pushed: number;
  skipped: number;
  failed: number;
  total: number;
  lastRun: string;
}

const sources = [
  {
    name: "Oberlin Localist",
    url: "calendar.oberlin.edu",
    status: "live",
    lastRun: "Runs every hour via GitHub Actions",
  },
  { name: "FAVA", url: "—", status: "planned", lastRun: "Not yet connected" },
  { name: "AMAM", url: "—", status: "planned", lastRun: "Not yet connected" },
  { name: "City of Oberlin", url: "—", status: "planned", lastRun: "Not yet connected" },
];

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "syncs", "latest"), (snap) => {
      if (snap.exists()) setStats(snap.data() as SyncStats);
    });
    return unsub;
  }, []);

  const cards = [
    {
      label: "Total Events Pushed",
      value: stats ? stats.total.toString() : "—",
      sub: stats ? `${stats.pushed} in last run` : "waiting for first run",
    },
    {
      label: "Active Sources",
      value: "1",
      sub: "Oberlin Localist",
    },
    {
      label: "Last Run",
      value: stats ? timeAgo(stats.lastRun) : "—",
      sub: stats ? new Date(stats.lastRun).toLocaleString() : "no data yet",
    },
    {
      label: "Last Run Result",
      value: stats ? (stats.failed === 0 ? "Clean" : `${stats.failed} failed`) : "—",
      sub: stats ? `${stats.pushed} pushed · ${stats.skipped} skipped` : "no data yet",
      highlight: stats?.failed === 0,
    },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Oberlin Community Calendar Unification — AI Micro-Grant Research
          </p>
        </div>
        {stats && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map((s) => (
          <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">{s.label}</p>
            <p className={`text-3xl font-bold mb-1 ${s.highlight ? "text-emerald-400" : "text-white"}`}>
              {s.value}
            </p>
            <p className="text-zinc-600 text-xs">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Sources */}
      <div>
        <h2 className="text-white text-base font-semibold mb-4">Calendar Sources</h2>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Source</th>
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Status</th>
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Events Pushed</th>
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Sync</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={s.name} className={i !== sources.length - 1 ? "border-b border-white/[0.04]" : ""}>
                  <td className="px-5 py-4">
                    <p className="text-white font-medium">{s.name}</p>
                    <p className="text-zinc-600 text-xs mt-0.5">{s.url}</p>
                  </td>
                  <td className="px-5 py-4">
                    {s.status === "live" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-zinc-600 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        Planned
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {s.status === "live" && stats ? (
                      stats.total
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-zinc-500 text-xs">{s.lastRun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
