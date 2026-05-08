"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/logActivity";

interface RejectedEvent {
  id: string;
  localistId: string;
  source: string;
  reason: "private" | "duplicate";
  confidence: number;
  // Preferred provider-agnostic field name:
  reasonDetail?: string;
  // Legacy field name used by older docs:
  geminiReason?: string;
  original: {
    title: string; date: string; location: string;
    description: string; sponsors: string[]; url: string;
  };
  rejectedAt: string;
  status: "rejected" | "overridden";
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RejectedPage() {
  const { user } = useAuth();
  const [rejected, setRejected] = useState<RejectedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const db = getClientDb();
    const unsub = onSnapshot(collection(db, "rejected"), snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as RejectedEvent))
        .filter(d => d.status !== "overridden")
        .sort((a, b) => new Date(b.rejectedAt).getTime() - new Date(a.rejectedAt).getTime());
      setRejected(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function override(item: RejectedEvent) {
    setActing(item.id);
    try {
      const db = getClientDb();
      // Move to review_queue as pending
      const { getFirestore } = await import("firebase/firestore");
      const firestore = getFirestore();
      const { setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "review_queue", item.localistId), {
        localistId: item.localistId,
        source: item.source,
        status: "pending",
        detectedAt: new Date().toISOString(),
        publicCheck: { isPublic: true, confidence: 100, reason: "Manually overridden by reviewer" },
        original: item.original,
        writerPayload: null, // will be re-processed or manually edited
        overriddenFromRejected: true,
      });
      await updateDoc(doc(db, "rejected", item.id), { status: "overridden" });
      logActivity(
        user?.email ?? "unknown",
        "overrode_private",
        `Overrode AI block: ${item.original.title}`,
        `AI had ${item.confidence}% confidence it was private`,
      );
    } finally {
      setActing(null);
    }
  }

  async function remove(item: RejectedEvent) {
    if (!confirm(`Remove "${item.original.title}" permanently?`)) return;
    setActing(item.id);
    try {
      const db = getClientDb();
      await deleteDoc(doc(db, "rejected", item.id));
    } finally {
      setActing(null);
    }
  }

  const privateEvents = rejected.filter(r => r.reason === "private");
  const duplicateEvents = rejected.filter(r => r.reason === "duplicate");

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Rejected Events</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Events blocked by the AI agents. Override any to send it to the Review Queue instead.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Private / Restricted</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : privateEvents.length}</p>
          <p className="text-zinc-600 text-xs">flagged by Public Agent</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Duplicates Blocked</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : duplicateEvents.length}</p>
          <p className="text-zinc-600 text-xs">flagged by Duplicate Agent</p>
        </div>
      </div>

      {!loading && rejected.length === 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl flex items-center justify-center py-16 text-center">
          <p className="text-zinc-500 text-sm">No rejected events.</p>
        </div>
      )}

      {privateEvents.length > 0 && (
        <Section title="Private / Restricted" color="amber">
          {privateEvents.map(item => (
            <EventCard key={item.id} item={item} acting={acting} onOverride={() => override(item)} onRemove={() => remove(item)} />
          ))}
        </Section>
      )}

      {duplicateEvents.length > 0 && (
        <Section title="Duplicate of Existing CommunityHub Event" color="red">
          {duplicateEvents.map(item => (
            <EventCard key={item.id} item={item} acting={acting} onOverride={() => override(item)} onRemove={() => remove(item)} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color === "amber" ? "bg-amber-400" : "bg-red-400"}`} />
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">{title}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EventCard({ item, acting, onOverride, onRemove }: {
  item: RejectedEvent; acting: string | null;
  onOverride: () => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActing = acting === item.id;
  const detail = item.reasonDetail ?? item.geminiReason ?? "";

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-start gap-4 px-5 py-4">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left">
          <p className="text-white text-sm font-medium">{item.original.title}</p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {item.original.date ? new Date(item.original.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            {item.original.location ? ` · ${item.original.location}` : ""}
            {" · "}
            <span className={item.reason === "private" ? "text-amber-400" : "text-red-400"}>
              {item.reason === "private" ? "Private" : "Duplicate"} ({item.confidence}% confidence)
            </span>
          </p>
          <p className="text-zinc-600 text-xs mt-0.5 italic">{detail || "—"}</p>
        </button>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onRemove}
            disabled={isActing}
            className="text-xs text-zinc-600 hover:text-red-400 border border-white/[0.06] hover:border-red-400/30 px-3 py-1.5 rounded-lg transition"
          >
            Delete
          </button>
          <button
            onClick={onOverride}
            disabled={isActing}
            className="text-xs font-medium text-white bg-[#C8102E]/70 hover:bg-[#C8102E] disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
          >
            {isActing ? "Moving…" : "Override → Queue"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-2">Original Description</p>
          <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap">{item.original.description || "—"}</p>
          {item.original.url && (
            <a href={item.original.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[#C8102E] text-xs hover:underline">
              View on Localist ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
