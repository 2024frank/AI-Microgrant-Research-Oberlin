"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/logActivity";

interface Duplicate {
  id: string;
  incomingEvent?: {
    sourceId?: string;
    sourceName?: string;
    title?: string;
    startTime?: number;
    localDate?: string;
    locationName?: string;
    locationAddress?: string;
    description?: string;
    sourceEventUrl?: string;
  };
  matchedCommunityHubEvent?: {
    id?: string | number;
    title?: string;
    startTime?: number;
    date?: string;
    location?: string;
    description?: string;
    url?: string;
  };
  eventA?: LegacyDuplicateEvent;
  eventB?: LegacyDuplicateEvent;
  confidence: number;
  reason: string;
  status: "pending" | "confirmed" | "rejected";
  detectedAt: string;
}

interface LegacyDuplicateEvent {
  id: string;
  source: string;
  title: string;
  date: string;
  location: string;
  description: string;
}

type DuplicateSide = Duplicate["incomingEvent"] | Duplicate["matchedCommunityHubEvent"] | LegacyDuplicateEvent | Record<string, never>;

function duplicateSides(dup: Duplicate) {
  const incoming: DuplicateSide = dup.incomingEvent ?? dup.eventA ?? {};
  const matched: DuplicateSide = dup.matchedCommunityHubEvent ?? dup.eventB ?? {};
  const incomingSourceName = "sourceName" in incoming ? incoming.sourceName : undefined;
  const incomingSourceId = "sourceId" in incoming ? incoming.sourceId : undefined;
  const incomingSource = "source" in incoming ? incoming.source : undefined;
  return [
    {
      label: incomingSourceName || incomingSourceId || incomingSource || "incoming",
      title: "title" in incoming && incoming.title ? incoming.title : "Untitled incoming event",
      date: "startTime" in incoming && incoming.startTime
        ? new Date(incoming.startTime * 1000).toISOString()
        : "localDate" in incoming && incoming.localDate
        ? incoming.localDate
        : "date" in incoming
        ? incoming.date
        : "",
      location: "locationName" in incoming
        ? [incoming.locationName, incoming.locationAddress].filter(Boolean).join(", ")
        : "location" in incoming
        ? incoming.location
        : "",
      description: "description" in incoming && incoming.description ? incoming.description : "",
    },
    {
      label: "CommunityHub",
      title: "title" in matched && matched.title ? matched.title : "Untitled CommunityHub event",
      date: "startTime" in matched && matched.startTime
        ? new Date(matched.startTime * 1000).toISOString()
        : "date" in matched
        ? matched.date
        : "",
      location: "location" in matched ? matched.location : "",
      description: "description" in matched && matched.description ? matched.description : "",
    },
  ];
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 90 ? "text-red-400 bg-red-400/10 border-red-400/20"
    : score >= 70 ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
    : "text-zinc-400 bg-white/[0.04] border-white/[0.08]";
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {score}% match
    </span>
  );
}

export default function DuplicatesPage() {
  const { user } = useAuth();
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "duplicates"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Duplicate));
      docs.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
      setDuplicates(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function updateStatus(id: string, status: "confirmed" | "rejected") {
    await updateDoc(doc(db, "duplicates", id), { status });
    const dup = duplicates.find(d => d.id === id);
    const [incoming, matched] = dup ? duplicateSides(dup) : [];
    logActivity(
      user?.email ?? "unknown",
      status === "confirmed" ? "confirmed_duplicate" : "rejected_duplicate",
      status === "confirmed"
        ? `Confirmed duplicate: "${incoming?.title}" vs "${matched?.title}"`
        : `Rejected duplicate flag: "${incoming?.title}"`,
    );
  }

  const pending = duplicates.filter(d => d.status === "pending");
  const reviewed = duplicates.filter(d => d.status !== "pending");
  const confirmed = reviewed.filter(d => d.status === "confirmed");

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Duplicates</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Incoming events that look like CommunityHub or local queue duplicates. Review each candidate and confirm or reject it.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Pending Review</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : pending.length}</p>
          <p className="text-zinc-600 text-xs">events in queue</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Duplicate Signal Accuracy</p>
          <p className="text-3xl font-bold text-zinc-400 mb-1">
            {reviewed.length === 0 ? "—" : `${Math.round((confirmed.length / reviewed.length) * 100)}%`}
          </p>
          <p className="text-zinc-600 text-xs">{reviewed.length === 0 ? "no reviews yet" : `${reviewed.length} reviewed`}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Total Reviewed</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : reviewed.length}</p>
          <p className="text-zinc-600 text-xs">confirmed + rejected</p>
        </div>
      </div>

      {!loading && pending.length > 0 && (
        <div className="space-y-4 mb-8">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Pending Review</p>
          {pending.map((dup) => {
            const isOpen = expanded.has(dup.id);
            const sides = duplicateSides(dup);
            return (
              <div key={dup.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(dup.id)}
                  className="w-full px-5 py-3 border-b border-white/[0.06] flex items-center justify-between hover:bg-white/[0.02] transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <ConfidenceBadge score={dup.confidence} />
                    <p className="text-zinc-500 text-xs">{dup.reason}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-zinc-600 text-xs">{timeAgo(dup.detectedAt)}</p>
                    <svg
                      className={`w-4 h-4 text-zinc-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                  {sides.map((ev, i) => (
                    <div key={i} className="px-5 py-4">
                      <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-2">
                        {ev.label.toUpperCase()}
                      </p>
                      <p className="text-white text-sm font-medium mb-1">{ev.title}</p>
                      <p className="text-zinc-500 text-xs mb-1">
                        {ev.date ? new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </p>
                      {ev.description && (
                        <p className={`text-zinc-600 text-xs leading-relaxed ${isOpen ? "" : "line-clamp-2"}`}>
                          {ev.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-white/[0.06] flex gap-2 justify-end">
                  <button
                    onClick={() => updateStatus(dup.id, "rejected")}
                    className="text-xs font-medium text-zinc-400 hover:text-white border border-white/[0.08] hover:border-white/20 px-3 py-1.5 rounded-lg transition"
                  >
                    Not a duplicate
                  </button>
                  <button
                    onClick={() => updateStatus(dup.id, "confirmed")}
                    className="text-xs font-medium text-white bg-[#C8102E]/80 hover:bg-[#C8102E] px-3 py-1.5 rounded-lg transition"
                  >
                    Confirm duplicate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && reviewed.length > 0 && (
        <div className="space-y-2">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">Reviewed</p>
          {reviewed.map((dup) => (
            <ReviewedDuplicate key={dup.id} dup={dup} />
          ))}
        </div>
      )}

      {!loading && duplicates.length === 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-white/[0.05] flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
          </div>
          <p className="text-white font-medium mb-2">No duplicates detected</p>
          <p className="text-zinc-500 text-sm max-w-sm">
            Codex automation checks each incoming event. Duplicate candidates will appear here as more sources are added.
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewedDuplicate({ dup }: { dup: Duplicate }) {
  const [incoming, matched] = duplicateSides(dup);
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-5 py-3 flex items-center justify-between opacity-60">
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
          dup.status === "confirmed"
            ? "text-red-400 bg-red-400/10 border-red-400/20"
            : "text-zinc-400 bg-white/[0.04] border-white/[0.08]"
        }`}>
          {dup.status === "confirmed" ? "Duplicate" : "Not a duplicate"}
        </span>
        <p className="text-zinc-400 text-sm">{incoming.title}</p>
        <span className="text-zinc-600 text-xs">vs</span>
        <p className="text-zinc-400 text-sm">{matched.title}</p>
      </div>
      <ConfidenceBadge score={dup.confidence} />
    </div>
  );
}
