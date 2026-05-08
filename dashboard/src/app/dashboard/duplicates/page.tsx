"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, setDoc, updateDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/logActivity";

interface ManifestEntry {
  id: string;
  source: string;
  title: string;
  date: string;
  location: string;
  description: string;
}

interface Duplicate {
  id: string;
  eventA: ManifestEntry;
  eventB: ManifestEntry;
  confidence: number;
  reason: string;
  status: "pending" | "confirmed" | "rejected";
  detectedAt: string;
  reviewQueueId?: string;
  localistId?: string;
  source?: string;
  source_id?: string;
  incomingEvent?: {
    id?: string;
    localistId?: string;
    source?: string;
    source_id?: string;
    title?: string;
    date?: string;
    location?: string;
    description?: string;
    sponsors?: string[];
    url?: string;
    writerPayload?: unknown;
    [key: string]: unknown;
  };
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
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

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
    const db = getClientDb();
    const unsub = onSnapshot(collection(db, "duplicates"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Duplicate));
      docs.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
      setDuplicates(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  function getReviewQueueId(dup?: Duplicate) {
    if (!dup) return null;
    return (
      dup.reviewQueueId ??
      dup.localistId ??
      dup.incomingEvent?.localistId ??
      null
    );
  }

  async function resendToReviewQueue(dup?: Duplicate) {
    const db = getClientDb();
    const reviewQueueId = getReviewQueueId(dup);
    if (!dup || !reviewQueueId) {
      throw new Error("Cannot resend: missing review queue id.");
    }

    const source = dup.incomingEvent?.source ?? dup.incomingEvent?.source_id ?? dup.source ?? dup.source_id ?? dup.eventA?.source ?? "unknown";
    const title = dup.incomingEvent?.title ?? dup.eventA?.title ?? "";
    const date = dup.incomingEvent?.date ?? dup.eventA?.date ?? "";
    const location = dup.incomingEvent?.location ?? dup.eventA?.location ?? "";
    const description = dup.incomingEvent?.description ?? dup.eventA?.description ?? "";
    const sponsors = Array.isArray(dup.incomingEvent?.sponsors) ? dup.incomingEvent.sponsors : [];
    const url = typeof dup.incomingEvent?.url === "string" ? dup.incomingEvent.url : "";

    await setDoc(
      doc(db, "review_queue", reviewQueueId),
      {
        localistId: reviewQueueId,
        source,
        status: "pending",
        detectedAt: new Date().toISOString(),
        original: { title, date, location, description, sponsors, url },
        writerPayload: dup.incomingEvent?.writerPayload ?? null,
        approvedAt: null,
        rejectedAt: null,
        chPostId: null,
        autoRejectedReason: null,
        duplicateDecision: "not_duplicate",
        duplicateDecisionAt: new Date().toISOString(),
        duplicateDecisionBy: user?.email ?? "unknown",
        duplicateId: dup.id,
      },
      { merge: true },
    );
  }

  async function updateStatus(id: string, status: "confirmed" | "rejected") {
    const db = getClientDb();
    const dup = duplicates.find(d => d.id === id);
    if (!dup) return;

    setActingIds(prev => new Set(prev).add(id));
    setActionErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      // "Not a duplicate" should send the candidate back to the review queue first.
      if (status === "rejected") {
        await resendToReviewQueue(dup);
      }
      await updateDoc(doc(db, "duplicates", id), { status });

      logActivity(
        user?.email ?? "unknown",
        status === "confirmed" ? "confirmed_duplicate" : "rejected_duplicate",
        status === "confirmed"
          ? `Confirmed duplicate: "${dup.eventA.title}" vs "${dup.eventB.title}"`
          : `Rejected duplicate flag: "${dup.eventA.title}"`,
      );
    } catch (err: unknown) {
      setActionErrors(prev => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Failed to update duplicate decision.",
      }));
    } finally {
      setActingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const pending = duplicates.filter(d => d.status === "pending");
  const reviewed = duplicates.filter(d => d.status !== "pending");
  const confirmed = reviewed.filter(d => d.status === "confirmed");

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Duplicates</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Events flagged by the AI agent as potential duplicates. Review each one and confirm or reject.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Pending Review</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : pending.length}</p>
          <p className="text-zinc-600 text-xs">events in queue</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">AI Accuracy</p>
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
            const isActing = actingIds.has(dup.id);
            const actionError = actionErrors[dup.id];
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
                  {[dup.eventA, dup.eventB].map((ev, i) => (
                    <div key={i} className="px-5 py-4">
                      <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-2">
                        {(ev.source || "unknown").toUpperCase()}
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
                {actionError && (
                  <div className="px-5 py-2 border-t border-red-500/20 bg-red-500/[0.06]">
                    <p className="text-red-300 text-xs">{actionError}</p>
                  </div>
                )}
                <div className="px-5 py-3 border-t border-white/[0.06] flex gap-2 justify-end">
                  <button
                    onClick={() => updateStatus(dup.id, "rejected")}
                    disabled={isActing}
                    className="text-xs font-medium text-zinc-400 hover:text-white disabled:opacity-50 border border-white/[0.08] hover:border-white/20 px-3 py-1.5 rounded-lg transition"
                  >
                    {isActing ? "Working..." : "Not a duplicate"}
                  </button>
                  <button
                    onClick={() => updateStatus(dup.id, "confirmed")}
                    disabled={isActing}
                    className="text-xs font-medium text-white bg-[#C8102E]/80 hover:bg-[#C8102E] disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
                  >
                    {isActing ? "Working..." : "Confirm duplicate"}
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
            <div key={dup.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-5 py-3 flex items-center justify-between opacity-60">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  dup.status === "confirmed"
                    ? "text-red-400 bg-red-400/10 border-red-400/20"
                    : "text-zinc-400 bg-white/[0.04] border-white/[0.08]"
                }`}>
                  {dup.status === "confirmed" ? "Duplicate" : "Not a duplicate"}
                </span>
                <p className="text-zinc-400 text-sm">{dup.eventA.title}</p>
                <span className="text-zinc-600 text-xs">vs</span>
                <p className="text-zinc-400 text-sm">{dup.eventB.title}</p>
              </div>
              <ConfidenceBadge score={dup.confidence} />
            </div>
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
            The AI agent checks every event on sync. Duplicates will appear here for your review as more sources are added.
          </p>
        </div>
      )}
    </div>
  );
}
