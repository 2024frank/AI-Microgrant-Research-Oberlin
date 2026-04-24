"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface SyncStats {
  analyzed: number;
  pushed: number;
  geminiEnabled: boolean;
  lastRun: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AIAnalysisPage() {
  const [stats, setStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "syncs", "localist"), (snap) => {
      if (snap.exists()) setStats(snap.data() as SyncStats);
    });
    return unsub;
  }, []);

  const geminiActive = stats?.geminiEnabled === true;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">AI Analysis</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Gemini-powered description cleaning and duplicate detection across all calendar sources.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border ${
          geminiActive
            ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
            : "text-amber-400 bg-amber-400/10 border-amber-400/20"
        }`}>
          {geminiActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          {geminiActive ? "Gemini Active" : "Gemini Not Configured"}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Events Cleaned</p>
          <p className="text-3xl font-bold text-white mb-1">{stats ? stats.analyzed.toLocaleString() : "—"}</p>
          <p className="text-zinc-600 text-xs">descriptions processed this run</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Model</p>
          <p className="text-xl font-bold text-white mb-1 mt-1.5">Gemini 2.5 Flash</p>
          <p className="text-zinc-600 text-xs">{geminiActive ? "URL removal + summarization" : "not active"}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Last Run</p>
          <p className="text-3xl font-bold text-white mb-1">{stats ? timeAgo(stats.lastRun) : "—"}</p>
          <p className="text-zinc-600 text-xs">{stats ? new Date(stats.lastRun).toLocaleString() : "no run yet"}</p>
        </div>
      </div>

      {/* What Gemini does */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-6">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-4">What the AI does on every sync</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              title: "URL Removal",
              desc: "Strips all http/https links and streaming video labels (\"Streaming Video:\", \"Watch webcast\", etc.) from event descriptions before posting.",
              active: true,
            },
            {
              title: "Smart Summarization",
              desc: "Condenses long descriptions to under 200 characters for the short field and 1,000 for the extended field, always ending at a clean sentence boundary.",
              active: true,
            },
            {
              title: "Duplicate Detection",
              desc: "Compares each incoming event against all known events from other sources. Flags likely duplicates for human review instead of posting them twice.",
              active: false,
              badge: "Multi-source",
            },
            {
              title: "Cross-Source Matching",
              desc: "When AMAM, FAVA, and City of Oberlin feeds are added, Gemini will compare titles, dates, and locations across all four calendars.",
              active: false,
              badge: "Coming soon",
            },
          ].map((f) => (
            <div key={f.title} className={`rounded-lg border p-4 ${f.active ? "border-white/[0.07] bg-white/[0.02]" : "border-white/[0.04] opacity-50"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.active ? "bg-emerald-400" : "bg-zinc-600"}`} />
                <p className="text-white text-sm font-medium">{f.title}</p>
                {f.badge && (
                  <span className="ml-auto text-zinc-500 text-[10px] border border-zinc-700 rounded-full px-1.5 py-0.5">{f.badge}</span>
                )}
              </div>
              <p className="text-zinc-500 text-xs leading-relaxed pl-3.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fallback notice */}
      {!geminiActive && stats && (
        <div className="flex items-start gap-3 bg-amber-400/[0.05] border border-amber-400/20 rounded-xl px-5 py-4">
          <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-amber-400 text-sm">
            <span className="font-medium">Gemini key not detected.</span>{" "}
            Descriptions are being cleaned with regex fallback. Add <code className="text-amber-300 bg-amber-400/10 px-1 rounded">GEMINI_API_KEY</code> to GitHub Actions secrets to enable AI cleaning.
          </p>
        </div>
      )}
    </div>
  );
}
