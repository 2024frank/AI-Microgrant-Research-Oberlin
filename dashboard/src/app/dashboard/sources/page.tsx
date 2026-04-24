"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface FailedEvent { title: string; reason: string; }
interface SourceStats {
  pushed: number; skipped: number; skippedReason: string;
  failed: number; failedEvents: FailedEvent[]; total: number; lastRun: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const planned = ["FAVA", "AMAM", "City of Oberlin"];

export default function SourcesPage() {
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
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Sources</h1>
        <p className="text-zinc-500 text-sm mt-1">All calendar sources feeding into the Oberlin Community Calendar.</p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden mb-3">
        <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/[0.06]">
          {["Source", "Last Pushed", "Pushed", "Skipped", "Failed"].map((h) => (
            <p key={h} className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</p>
          ))}
        </div>

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
          <p className="text-zinc-300 text-sm">{localist ? timeAgo(localist.lastRun) : <span className="text-zinc-600">—</span>}</p>
          <p className="text-sm">{localist ? <span className="text-emerald-400 font-medium">{localist.pushed}</span> : <span className="text-zinc-600">—</span>}</p>
          <p className="text-zinc-300 text-sm">{localist ? localist.skipped : <span className="text-zinc-600">—</span>}</p>
          <div className="flex items-center justify-between">
            <p className="text-sm">{localist ? (localist.failed > 0 ? <span className="text-red-400 font-medium">{localist.failed}</span> : <span className="text-zinc-400">0</span>) : <span className="text-zinc-600">—</span>}</p>
            <svg className={`w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-white/[0.06] px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/[0.03] rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Skipped reason</p>
                <p className="text-zinc-300 text-sm">{localist?.skippedReason || "—"}</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Last run timestamp</p>
                <p className="text-zinc-300 text-sm">{localist ? new Date(localist.lastRun).toLocaleString() : "—"}</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Total on calendar</p>
                <p className="text-zinc-300 text-sm">{localist ? localist.total : "—"}</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Sync schedule</p>
                <p className="text-zinc-300 text-sm">Every hour via GitHub Actions</p>
              </div>
            </div>
            {localist && localist.failedEvents?.length > 0 && (
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
            )}
            {localist && !localist.failedEvents?.length && (
              <p className="text-zinc-600 text-sm">No failed events in the last run.</p>
            )}
          </div>
        )}
      </div>

      {planned.map((name) => (
        <div key={name} className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-5 py-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
            <p className="text-zinc-500 text-sm font-medium">{name}</p>
            <span className="ml-2 text-zinc-700 text-xs border border-zinc-700 rounded-full px-2 py-0.5">Planned</span>
          </div>
        </div>
      ))}
    </div>
  );
}
