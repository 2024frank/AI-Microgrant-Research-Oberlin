"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/logActivity";

interface RejectedEvent {
  id: string;
  localistId?: string;
  source?: string;
  sourceId?: string;
  sourceName?: string;
  sourceEventUrl?: string;
  title?: string;
  date?: string;
  location?: string;
  description?: string;
  reason: "private" | "duplicate" | "not_public" | "excluded" | "restricted" | "athletics" | "normalization_error";
  confidence?: number;
  geminiReason?: string;
  publicCheck?: {
    isPublic?: boolean;
    confidence?: number;
    method?: string;
    details?: string;
    reason?: string;
  };
  original: {
    title?: string; date?: string; location?: string;
    description?: string; sponsors?: string[]; url?: string;
  };
  rejectedAt: string;
  status: "rejected" | "overridden";
}

export default function RejectedPage() {
  const { user } = useAuth();
  const [rejected, setRejected] = useState<RejectedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
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
      // Move to review_queue as pending
      const { getFirestore } = await import("firebase/firestore");
      const firestore = getFirestore();
      const { setDoc } = await import("firebase/firestore");
      const queueId = item.localistId || item.id;
      await setDoc(doc(firestore, "review_queue", queueId), {
        localistId: item.localistId,
        source: item.source || item.sourceId,
        sourceId: item.sourceId || item.source,
        sourceName: item.sourceName,
        sourceEventUrl: item.sourceEventUrl || item.original?.url,
        title: item.title || item.original?.title,
        description: item.description || item.original?.description,
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
        "overrode_rejection",
        `Overrode rejection: ${eventTitle(item)}`,
        `Reason was ${reasonLabel(item.reason).toLowerCase()}`,
      );
    } finally {
      setActing(null);
    }
  }

  async function remove(item: RejectedEvent) {
    if (!confirm(`Remove "${eventTitle(item)}" permanently?`)) return;
    setActing(item.id);
    try {
      await deleteDoc(doc(db, "rejected", item.id));
    } finally {
      setActing(null);
    }
  }

  const privateEvents = rejected.filter(r => ["private", "not_public", "restricted"].includes(r.reason));
  const duplicateEvents = rejected.filter(r => r.reason === "duplicate");
  const otherEvents = rejected.filter(r => !privateEvents.includes(r) && !duplicateEvents.includes(r));

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Rejected Events</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Events kept out of the queue for research metrics. Override any item that should receive local review.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Private / Restricted</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : privateEvents.length}</p>
          <p className="text-zinc-600 text-xs">failed public eligibility</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Duplicates Blocked</p>
          <p className="text-3xl font-bold text-white mb-1">{loading ? "—" : duplicateEvents.length}</p>
          <p className="text-zinc-600 text-xs">matched existing events</p>
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

      {otherEvents.length > 0 && (
        <Section title="Other Rejections" color="amber">
          {otherEvents.map(item => (
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

function eventTitle(item: RejectedEvent) {
  return item.title || item.original?.title || "Untitled event";
}

function eventDate(item: RejectedEvent) {
  return item.date || item.original?.date || "";
}

function eventLocation(item: RejectedEvent) {
  return item.location || item.original?.location || "";
}

function eventDescription(item: RejectedEvent) {
  return item.description || item.original?.description || "";
}

function eventUrl(item: RejectedEvent) {
  return item.sourceEventUrl || item.original?.url || "";
}

function reasonLabel(reason: RejectedEvent["reason"]) {
  const labels: Record<RejectedEvent["reason"], string> = {
    private: "Private",
    not_public: "Not public",
    restricted: "Restricted",
    duplicate: "Duplicate",
    excluded: "Excluded",
    athletics: "Athletics",
    normalization_error: "Normalization error",
  };
  return labels[reason] ?? reason;
}

function rejectionDetails(item: RejectedEvent) {
  return item.publicCheck?.details || item.publicCheck?.reason || item.geminiReason || "";
}

function EventCard({ item, acting, onOverride, onRemove }: {
  item: RejectedEvent; acting: string | null;
  onOverride: () => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActing = acting === item.id;

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-start gap-4 px-5 py-4">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left">
          <p className="text-white text-sm font-medium">{eventTitle(item)}</p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {eventDate(item) ? new Date(eventDate(item)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            {eventLocation(item) ? ` · ${eventLocation(item)}` : ""}
            {" · "}
            <span className={item.reason === "duplicate" ? "text-red-400" : "text-amber-400"}>
              {reasonLabel(item.reason)}
              {item.confidence ?? item.publicCheck?.confidence ? ` (${item.confidence ?? item.publicCheck?.confidence}% confidence)` : ""}
            </span>
          </p>
          {rejectionDetails(item) && <p className="text-zinc-600 text-xs mt-0.5 italic">{rejectionDetails(item)}</p>}
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
          <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap">{eventDescription(item) || "—"}</p>
          {eventUrl(item) && (
            <a href={eventUrl(item)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[#C8102E] text-xs hover:underline">
              View source ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
