"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface QueueItem {
  id: string;
  source: string;
  source_id?: string;
  status: "pending" | "approved" | "rejected_manual" | "auto_rejected";
  detectedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  autoRejectedReason?: string;
  writerPayload?: {
    title: string;
    sessions?: { startTime: number; endTime: number }[];
    location?: string;
  };
  original?: {
    title: string;
    date?: string;
    location?: string;
  };
}

const SOURCE_LABEL: Record<string, string> = {
  localist:        "Oberlin Localist",
  amam:            "Allen Memorial Art Museum",
  heritage_center: "Oberlin Heritage Center",
};

const SOURCE_COLOR: Record<string, string> = {
  localist:        "text-blue-400 bg-blue-400/10 border-blue-400/20",
  amam:            "text-purple-400 bg-purple-400/10 border-purple-400/20",
  heritage_center: "text-amber-400 bg-amber-400/10 border-amber-400/20",
};

type DateFilter = "future" | "past" | "all";
type StatusFilter = "all" | "pending" | "approved" | "rejected_manual" | "auto_rejected";
type SourceFilter = "all" | "localist" | "amam" | "heritage_center";

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateTime(ts: number) {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function getStartTs(item: QueueItem): number | null {
  const ts = item.writerPayload?.sessions?.[0]?.startTime;
  if (ts) return ts;
  // Fallback: parse original.date ISO string
  if (item.original?.date) {
    const t = Date.parse(item.original.date);
    if (!isNaN(t)) return Math.floor(t / 1000);
  }
  return null;
}

function getSourceKey(item: QueueItem) {
  return item.source_id || item.source || "unknown";
}

function getTitle(item: QueueItem) {
  return item.writerPayload?.title || item.original?.title || "—";
}

function getLocation(item: QueueItem) {
  return item.writerPayload?.location || item.original?.location || "";
}

export default function EventsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRejecting, setAutoRejecting] = useState(false);

  const [dateFilter, setDateFilter] = useState<DateFilter>("future");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");

  const now = Math.floor(Date.now() / 1000);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "review_queue"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as QueueItem));
      setItems(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Auto-reject all pending events whose date has already passed
  async function autoRejectPast() {
    setAutoRejecting(true);
    try {
      const pastPending = items.filter(item => {
        if (item.status !== "pending") return false;
        const ts = getStartTs(item);
        return ts !== null && ts < now;
      });
      if (pastPending.length === 0) return;

      // Firestore batch writes (max 500 per batch)
      const chunks: QueueItem[][] = [];
      for (let i = 0; i < pastPending.length; i += 499) {
        chunks.push(pastPending.slice(i, i + 499));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.update(doc(db, "review_queue", item.id), {
            status: "auto_rejected",
            autoRejectedReason: "Event date has already passed",
            rejectedAt: new Date().toISOString(),
          });
        }
        await batch.commit();
      }
    } finally {
      setAutoRejecting(false);
    }
  }

  const pastPendingCount = useMemo(
    () => items.filter(i => i.status === "pending" && (getStartTs(i) ?? Infinity) < now).length,
    [items, now]
  );

  const filtered = useMemo(() => {
    return items
      .filter(item => {
        // source filter
        if (sourceFilter !== "all" && getSourceKey(item) !== sourceFilter) return false;
        // status filter
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        // date filter
        const ts = getStartTs(item);
        if (dateFilter === "future") {
          if (ts === null || ts < now) return false;
        } else if (dateFilter === "past") {
          if (ts === null || ts >= now) return false;
        }
        // search
        if (search) {
          const q = search.toLowerCase();
          if (!getTitle(item).toLowerCase().includes(q) && !getLocation(item).toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ta = getStartTs(a) ?? 0;
        const tb = getStartTs(b) ?? 0;
        return dateFilter === "past" ? tb - ta : ta - tb;
      });
  }, [items, sourceFilter, statusFilter, dateFilter, search, now]);

  // Counts by source (all items, respecting current date+status filters)
  const countsBySource = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(item => {
      const s = SOURCE_LABEL[getSourceKey(item)] ?? getSourceKey(item);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected_manual: 0, auto_rejected: 0 };
    filtered.forEach(item => {
      if (item.status in c) c[item.status as keyof typeof c]++;
    });
    return c;
  }, [filtered]);

  const STATUS_STYLE: Record<string, string> = {
    pending:         "text-zinc-400 bg-white/[0.05] border-white/[0.1]",
    approved:        "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    rejected_manual: "text-red-400 bg-red-400/10 border-red-400/20",
    auto_rejected:   "text-zinc-500 bg-white/[0.03] border-white/[0.06]",
  };
  const STATUS_LABEL: Record<string, string> = {
    pending:         "Pending",
    approved:        "Approved",
    rejected_manual: "Rejected",
    auto_rejected:   "Auto-rejected",
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Events</h1>
          <p className="text-zinc-500 text-sm mt-1">
            All events across sources — filter by date, source, or status.
          </p>
        </div>

        {pastPendingCount > 0 && (
          <button
            onClick={autoRejectPast}
            disabled={autoRejecting}
            className="shrink-0 inline-flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {autoRejecting ? "Rejecting…" : `Auto-reject ${pastPendingCount} past event${pastPendingCount > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Showing" value={filtered.length} sub="matching events" />
        <StatCard label="Pending" value={statusCounts.pending} sub="awaiting review" highlight={statusCounts.pending > 0} />
        <StatCard label="Approved" value={statusCounts.approved} sub="pushed to CommunityHub" />
        <StatCard label="Rejected" value={statusCounts.rejected_manual + statusCounts.auto_rejected} sub={`${statusCounts.auto_rejected} auto · ${statusCounts.rejected_manual} manual`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Date */}
        <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
          {(["future", "past", "all"] as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                dateFilter === f
                  ? "bg-white/[0.1] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f === "future" ? "Future" : f === "past" ? "Past" : "All dates"}
            </button>
          ))}
        </div>

        {/* Source */}
        <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
          {(["all", "localist", "amam", "heritage_center"] as SourceFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                sourceFilter === s
                  ? "bg-white/[0.1] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s === "all" ? "All sources" : SOURCE_LABEL[s] ?? s}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
          {(["all", "pending", "approved", "rejected_manual", "auto_rejected"] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === s
                  ? "bg-white/[0.1] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search title or location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-white/20 transition"
        />
      </div>

      {/* Source breakdown pills */}
      {Object.keys(countsBySource).length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(countsBySource).map(([label, count]) => (
            <span key={label} className="text-zinc-500 text-[11px] border border-white/[0.06] rounded-full px-2.5 py-1">
              {label} <span className="text-zinc-300 font-semibold">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Event list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl flex flex-col items-center justify-center py-20 text-center">
          <p className="text-white font-medium mb-2">No events match these filters</p>
          <p className="text-zinc-500 text-sm">Try switching to "All dates" or clearing the source/status filter.</p>
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_100px_100px] gap-4 px-5 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">Event</p>
            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">Date</p>
            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">Source</p>
            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide">Status</p>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {filtered.map(item => {
              const ts = getStartTs(item);
              const isPast = ts !== null && ts < now;
              const sourceKey = getSourceKey(item);

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_140px_100px_100px] gap-4 px-5 py-3 items-center hover:bg-white/[0.02] transition ${isPast && item.status === "pending" ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{getTitle(item)}</p>
                    {getLocation(item) && (
                      <p className="text-zinc-600 text-xs truncate">{getLocation(item)}</p>
                    )}
                  </div>

                  <div>
                    {ts ? (
                      <p className={`text-xs ${isPast ? "text-zinc-600" : "text-zinc-400"}`}>
                        {dateFilter === "all" ? fmtDate(ts) : fmtDateTime(ts)}
                      </p>
                    ) : (
                      <p className="text-zinc-700 text-xs">No date</p>
                    )}
                    {isPast && item.status === "pending" && (
                      <p className="text-red-500 text-[10px] mt-0.5">Past — should reject</p>
                    )}
                  </div>

                  <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border w-fit ${SOURCE_COLOR[sourceKey] ?? "text-zinc-400 bg-white/[0.04] border-white/[0.08]"}`}>
                    {(SOURCE_LABEL[sourceKey] ?? sourceKey).split(" ")[0]}
                  </span>

                  <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border w-fit ${STATUS_STYLE[item.status] ?? STATUS_STYLE.pending}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: number; sub: string; highlight?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
      <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold mb-0.5 ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</p>
      <p className="text-zinc-600 text-[10px]">{sub}</p>
    </div>
  );
}
