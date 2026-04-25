"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── SVG donut pie chart ──────────────────────────────────────────────────────

interface Segment { label: string; value: number; color: string }

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

function DonutChart({ segments, total }: { segments: Segment[]; total: number }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const ir = 30; // inner radius for donut hole

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40">
        <p className="text-zinc-600 text-sm">No data yet</p>
      </div>
    );
  }

  // Build wedge paths
  let angle = -90;
  const paths = segments
    .filter(s => s.value > 0)
    .map(s => {
      const sweep = (s.value / total) * 360;
      const gap = total > 1 ? 2 : 0;
      const start = angle + gap / 2;
      const end = angle + sweep - gap / 2;
      angle += sweep;

      // Outer arc
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const ox1 = cx + r * Math.cos(toRad(start));
      const oy1 = cy + r * Math.sin(toRad(start));
      const ox2 = cx + r * Math.cos(toRad(end));
      const oy2 = cy + r * Math.sin(toRad(end));
      const ix1 = cx + ir * Math.cos(toRad(start));
      const iy1 = cy + ir * Math.sin(toRad(start));
      const ix2 = cx + ir * Math.cos(toRad(end));
      const iy2 = cy + ir * Math.sin(toRad(end));
      const large = sweep > 180 ? 1 : 0;

      const d = [
        `M ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
        `L ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
        `A ${r} ${r} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
        `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
        `A ${ir} ${ir} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
        "Z",
      ].join(" ");

      return { d, color: s.color, value: s.value, label: s.label };
    });

  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} />
        ))}
        {/* center label */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="20" fontWeight="700">{total}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fill="#71717a" fontSize="9">decisions</text>
      </svg>

      <div className="space-y-1.5 w-full">
        {segments.filter(s => s.value > 0).map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-zinc-400 text-xs flex-1">{s.label}</span>
            <span className="text-white text-xs font-medium tabular-nums">{s.value}</span>
            <span className="text-zinc-600 text-[10px] w-7 text-right tabular-nums">{pct(s.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── data types ───────────────────────────────────────────────────────────────

interface AgentData {
  agreed: number;
  disagreed: number;
  pending: number;
}

interface PublicAgentData extends AgentData {
  agreedPrivate: number;
  agreedPublic: number;
  disagreedPrivate: number;
  disagreedPublic: number;
}

interface WriterAgentData {
  acceptedAsIs: number;
  editedThenApproved: number;
  rejected: number;
  pending: number;
}

interface PrivateEvent {
  source: string;
  confidence: number;
  geminiReason: string;
  status: "rejected" | "overridden";
}

interface PublicEvent {
  source: string;
  confidence: number;
  userStatus: "approved" | "rejected_manual" | "pending" | "auto_rejected";
}

interface PublicDeepDive {
  privateEvents: PrivateEvent[];
  publicEvents: PublicEvent[];
}

// ── main page ────────────────────────────────────────────────────────────────

export default function AIAnalysisPage() {
  const [publicAgent, setPublicAgent] = useState<PublicAgentData | null>(null);
  const [dupAgent, setDupAgent] = useState<AgentData | null>(null);
  const [queueOutcomes, setQueueOutcomes] = useState<{ approved: number; rejected: number; pending: number } | null>(null);
  const [writerAgent, setWriterAgent] = useState<WriterAgentData | null>(null);
  const [deepDive, setDeepDive] = useState<PublicDeepDive>({ privateEvents: [], publicEvents: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Watch rejected collection
    const unsubRejected = onSnapshot(collection(db, "rejected"), (snap) => {
      const docs = snap.docs.map(d => d.data() as {
        reason: string; status: string;
        confidence?: number; geminiReason?: string; source?: string;
      });
      const privateAll = docs.filter(d => d.reason === "private");
      const privateAgreed = privateAll.filter(d => d.status === "rejected").length;
      const privateDisagreed = privateAll.filter(d => d.status === "overridden").length;

      setDeepDive(prev => ({
        ...prev,
        privateEvents: privateAll.map(d => ({
          source: d.source ?? "unknown",
          confidence: d.confidence ?? 0,
          geminiReason: d.geminiReason ?? "",
          status: d.status === "overridden" ? "overridden" : "rejected",
        })),
      }));

      setPublicAgent(prev => ({
        agreedPrivate: privateAgreed,
        agreedPublic: prev?.agreedPublic ?? 0,
        disagreedPrivate: privateDisagreed,
        disagreedPublic: prev?.disagreedPublic ?? 0,
        agreed: privateAgreed + (prev?.agreedPublic ?? 0),
        disagreed: privateDisagreed + (prev?.disagreedPublic ?? 0),
        pending: prev?.pending ?? 0,
      }));
    });

    // Watch review_queue
    const unsubQueue = onSnapshot(collection(db, "review_queue"), (snap) => {
      const docs = snap.docs.map(d => d.data() as {
        status: string; writerEdited?: boolean;
        source?: string; source_id?: string;
        publicCheck?: { isPublic: boolean; confidence: number; reason: string };
      });
      const approved = docs.filter(d => d.status === "approved").length;
      const rejectedManual = docs.filter(d => d.status === "rejected_manual").length;
      const pending = docs.filter(d => d.status === "pending").length;

      setDeepDive(prev => ({
        ...prev,
        publicEvents: docs.map(d => ({
          source: d.source_id ?? d.source ?? "unknown",
          confidence: d.publicCheck?.confidence ?? 0,
          userStatus: d.status as PublicEvent["userStatus"],
        })),
      }));

      // Writer Agent stats: was the AI's output accepted as-is or edited?
      const approvedDocs = docs.filter(d => d.status === "approved");
      setWriterAgent({
        acceptedAsIs: approvedDocs.filter(d => d.writerEdited === false).length,
        editedThenApproved: approvedDocs.filter(d => d.writerEdited === true).length,
        rejected: rejectedManual,
        pending,
      });

      setQueueOutcomes({ approved, rejected: rejectedManual, pending });

      setPublicAgent(prev => {
        const agreedPublic = approved;
        const disagreedPublic = rejectedManual;
        const agreedPrivate = prev?.agreedPrivate ?? 0;
        const disagreedPrivate = prev?.disagreedPrivate ?? 0;
        return {
          agreedPrivate,
          agreedPublic,
          disagreedPrivate,
          disagreedPublic,
          agreed: agreedPrivate + agreedPublic,
          disagreed: disagreedPrivate + disagreedPublic,
          pending,
        };
      });

      setLoading(false);
    });

    // Watch duplicates
    const unsubDups = onSnapshot(collection(db, "duplicates"), (snap) => {
      const docs = snap.docs.map(d => d.data() as { status: string });
      setDupAgent({
        agreed: docs.filter(d => d.status === "confirmed").length,
        disagreed: docs.filter(d => d.status === "rejected").length,
        pending: docs.filter(d => d.status === "pending").length,
      });
    });

    return () => { unsubRejected(); unsubQueue(); unsubDups(); };
  }, []);

  const publicTotal = publicAgent ? publicAgent.agreed + publicAgent.disagreed + publicAgent.pending : 0;
  const dupTotal = dupAgent ? dupAgent.agreed + dupAgent.disagreed + dupAgent.pending : 0;
  const queueTotal = queueOutcomes ? queueOutcomes.approved + queueOutcomes.rejected + queueOutcomes.pending : 0;

  const publicSegments: Segment[] = [
    { label: "AI said private — you agreed", value: publicAgent?.agreedPrivate ?? 0, color: "#34d399" },
    { label: "AI said public — you approved", value: publicAgent?.agreedPublic ?? 0, color: "#6ee7b7" },
    { label: "AI said private — you overrode", value: publicAgent?.disagreedPrivate ?? 0, color: "#f87171" },
    { label: "AI said public — you rejected", value: publicAgent?.disagreedPublic ?? 0, color: "#fca5a5" },
    { label: "Pending your review", value: publicAgent?.pending ?? 0, color: "#3f3f46" },
  ];

  const dupSegments: Segment[] = [
    { label: "AI flagged duplicate — you confirmed", value: dupAgent?.agreed ?? 0, color: "#34d399" },
    { label: "AI flagged duplicate — you rejected", value: dupAgent?.disagreed ?? 0, color: "#f87171" },
    { label: "Pending your review", value: dupAgent?.pending ?? 0, color: "#3f3f46" },
  ];

  const queueSegments: Segment[] = [
    { label: "Approved → pushed to CommunityHub", value: queueOutcomes?.approved ?? 0, color: "#34d399" },
    { label: "Manually rejected by you", value: queueOutcomes?.rejected ?? 0, color: "#f87171" },
    { label: "Still pending", value: queueOutcomes?.pending ?? 0, color: "#3f3f46" },
  ];

  const writerTotal = writerAgent
    ? writerAgent.acceptedAsIs + writerAgent.editedThenApproved + writerAgent.rejected + writerAgent.pending
    : 0;
  const writerSegments: Segment[] = [
    { label: "Accepted as-is (agreed with AI)", value: writerAgent?.acceptedAsIs ?? 0, color: "#34d399" },
    { label: "Edited before approving", value: writerAgent?.editedThenApproved ?? 0, color: "#f59e0b" },
    { label: "Event rejected entirely", value: writerAgent?.rejected ?? 0, color: "#f87171" },
    { label: "Still pending", value: writerAgent?.pending ?? 0, color: "#3f3f46" },
  ];
  const writerReviewed = (writerAgent?.acceptedAsIs ?? 0) + (writerAgent?.editedThenApproved ?? 0) + (writerAgent?.rejected ?? 0);
  const writerAcceptRate = writerReviewed > 0
    ? Math.round(((writerAgent?.acceptedAsIs ?? 0) / writerReviewed) * 100)
    : null;

  function agreeRate(agreed: number, total: number) {
    if (total === 0) return null;
    const reviewed = total - (publicAgent?.pending ?? 0);
    if (reviewed === 0) return null;
    return Math.round((agreed / reviewed) * 100);
  }

  const pubRate = publicAgent
    ? agreeRate(publicAgent.agreed, publicTotal)
    : null;

  const dupRate = dupAgent && dupTotal > 0
    ? (() => {
        const reviewed = dupAgent.agreed + dupAgent.disagreed;
        return reviewed === 0 ? null : Math.round((dupAgent.agreed / reviewed) * 100);
      })()
    : null;

  const queueApprovalRate = queueTotal > 0 && queueOutcomes
    ? (() => {
        const reviewed = queueOutcomes.approved + queueOutcomes.rejected;
        return reviewed === 0 ? null : Math.round((queueOutcomes.approved / reviewed) * 100);
      })()
    : null;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">AI Analysis</h1>
        <p className="text-zinc-500 text-sm mt-1">
          How often you agree or disagree with each AI agent's decisions — your grading of the AI.
        </p>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">

        {/* Public Agent */}
        <AgentCard
          title="Public Agent"
          description="Decides whether each event is open to the public or restricted (Oberlin-only / private)."
          rate={pubRate}
          rateLabel="agreement rate"
          loading={loading}
        >
          <DonutChart segments={publicSegments} total={publicTotal} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="You agreed" value={publicAgent?.agreed ?? 0} color="emerald" />
            <MiniStat label="You disagreed" value={publicAgent?.disagreed ?? 0} color="red" />
          </div>
        </AgentCard>

        {/* Duplicate Agent */}
        <AgentCard
          title="Duplicate Agent"
          description="Flags events that appear to match an existing CommunityHub listing from another source."
          rate={dupRate}
          rateLabel="agreement rate"
          loading={loading}
        >
          <DonutChart segments={dupSegments} total={dupTotal} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="You agreed" value={dupAgent?.agreed ?? 0} color="emerald" />
            <MiniStat label="You disagreed" value={dupAgent?.disagreed ?? 0} color="red" />
          </div>
        </AgentCard>

        {/* Review Queue outcomes */}
        <AgentCard
          title="Review Queue"
          description="Of the events the AI passed to your queue, how many did you approve vs manually reject."
          rate={queueApprovalRate}
          rateLabel="approval rate"
          loading={loading}
        >
          <DonutChart segments={queueSegments} total={queueTotal} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Approved" value={queueOutcomes?.approved ?? 0} color="emerald" />
            <MiniStat label="Rejected" value={queueOutcomes?.rejected ?? 0} color="red" />
          </div>
        </AgentCard>

        {/* Writer Agent */}
        <AgentCard
          title="Writer Agent"
          description="Cleans and rewrites event descriptions. Did you accept the output as-is, or did you edit it before approving?"
          rate={writerAcceptRate}
          rateLabel="accepted as-is"
          loading={loading}
        >
          <DonutChart segments={writerSegments} total={writerTotal} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Accepted" value={writerAgent?.acceptedAsIs ?? 0} color="emerald" />
            <MiniStat label="Edited" value={writerAgent?.editedThenApproved ?? 0} color="red" />
          </div>
        </AgentCard>

      </div>

      {/* Agreement breakdown table */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Decision Breakdown</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="text-left px-5 py-3 text-zinc-600 text-xs font-medium uppercase tracking-wide">Agent</th>
              <th className="text-right px-5 py-3 text-zinc-600 text-xs font-medium uppercase tracking-wide">Total</th>
              <th className="text-right px-5 py-3 text-zinc-600 text-xs font-medium uppercase tracking-wide">Agreed</th>
              <th className="text-right px-5 py-3 text-zinc-600 text-xs font-medium uppercase tracking-wide">Disagreed</th>
              <th className="text-right px-5 py-3 text-zinc-600 text-xs font-medium uppercase tracking-wide">Pending</th>
              <th className="text-right px-5 py-3 text-zinc-600 text-xs font-medium uppercase tracking-wide">Agreement %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <TableRow
              agent="Public Agent"
              total={publicTotal}
              agreed={publicAgent?.agreed ?? 0}
              disagreed={publicAgent?.disagreed ?? 0}
              pending={publicAgent?.pending ?? 0}
              rate={pubRate}
            />
            <TableRow
              agent="Duplicate Agent"
              total={dupTotal}
              agreed={dupAgent?.agreed ?? 0}
              disagreed={dupAgent?.disagreed ?? 0}
              pending={dupAgent?.pending ?? 0}
              rate={dupRate}
            />
            <TableRow
              agent="Review Queue (overall)"
              total={queueTotal}
              agreed={queueOutcomes?.approved ?? 0}
              disagreed={queueOutcomes?.rejected ?? 0}
              pending={queueOutcomes?.pending ?? 0}
              rate={queueApprovalRate}
            />
            <TableRow
              agent="Writer Agent (accepted as-is)"
              total={writerTotal}
              agreed={writerAgent?.acceptedAsIs ?? 0}
              disagreed={writerAgent?.editedThenApproved ?? 0}
              pending={writerAgent?.pending ?? 0}
              rate={writerAcceptRate}
            />
          </tbody>
        </table>
      </div>

      {/* ── Public / Private Agent Deep Dive ─────────────────────────────── */}
      <PublicAgentDeepDive deepDive={deepDive} loading={loading} />

      {/* Model info */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-5 py-4 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
        <p className="text-zinc-500 text-xs">
          All agents use <span className="text-zinc-300 font-medium">Gemini 2.5 Flash</span> via Google AI Studio.
          Decisions run automatically on every hourly sync.
        </p>
      </div>
    </div>
  );
}

// ── helper components ─────────────────────────────────────────────────────────

function AgentCard({
  title, description, rate, rateLabel, loading, children,
}: {
  title: string; description: string;
  rate: number | null; rateLabel: string;
  loading: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 flex flex-col">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-white text-sm font-semibold">{title}</p>
          {rate !== null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${
              rate >= 70 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : rate >= 40 ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                : "text-red-400 bg-red-400/10 border-red-400/20"
            }`}>
              {rate}%
            </span>
          )}
        </div>
        <p className="text-zinc-600 text-xs leading-relaxed">{description}</p>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
        </div>
      ) : (
        <div className="flex-1">{children}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: "emerald" | "red" }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${color === "emerald" ? "bg-emerald-400/5 border border-emerald-400/10" : "bg-red-400/5 border border-red-400/10"}`}>
      <p className={`text-xl font-bold ${color === "emerald" ? "text-emerald-400" : "text-red-400"}`}>{value}</p>
      <p className="text-zinc-600 text-[10px]">{label}</p>
    </div>
  );
}

// ── Public Agent Deep Dive ────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  localist:        "Oberlin Localist",
  amam:            "Allen Memorial Art Museum",
  heritage_center: "Oberlin Heritage Center",
  apollo_theatre:  "Apollo Theater",
  oberlin_libcal:  "Oberlin College Libraries",
};

function BarRow({ label, value, max, color, sub }: {
  label: string; value: number; max: number; color: string; sub?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <p className="text-zinc-400 text-xs w-32 shrink-0 truncate">{label}</p>
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-white text-xs font-semibold tabular-nums w-6 text-right">{value}</p>
      {sub && <p className="text-zinc-600 text-[10px] w-12 text-right">{sub}</p>}
    </div>
  );
}

function PublicAgentDeepDive({ deepDive, loading }: { deepDive: PublicDeepDive; loading: boolean }) {
  const { privateEvents, publicEvents } = deepDive;

  // ── 1. By-source breakdown ─────────────────────────────────────────────────
  const allSources = Array.from(new Set([
    ...privateEvents.map(e => e.source),
    ...publicEvents.map(e => e.source),
  ])).sort();

  const bySource = allSources.map(src => {
    const priv = privateEvents.filter(e => e.source === src);
    const pub = publicEvents.filter(e => e.source === src);
    return {
      src,
      blocked: priv.length,
      overridden: priv.filter(e => e.status === "overridden").length,
      passed: pub.length,
      approved: pub.filter(e => e.userStatus === "approved").length,
    };
  });

  // ── 2. Confidence distribution for private decisions ───────────────────────
  const confBuckets = [
    { label: "High (90–100%)", events: privateEvents.filter(e => e.confidence >= 90) },
    { label: "Medium (75–89%)", events: privateEvents.filter(e => e.confidence >= 75 && e.confidence < 90) },
    { label: "Low (<75%)", events: privateEvents.filter(e => e.confidence < 75) },
  ].map(b => ({
    ...b,
    agreed: b.events.filter(e => e.status === "rejected").length,
    overridden: b.events.filter(e => e.status === "overridden").length,
  }));

  // Also for public-passed events
  const pubConfBuckets = [
    { label: "High (90–100%)", events: publicEvents.filter(e => e.confidence >= 90) },
    { label: "Medium (75–89%)", events: publicEvents.filter(e => e.confidence >= 75 && e.confidence < 90) },
    { label: "Low (<75%)", events: publicEvents.filter(e => e.confidence < 75) },
  ].map(b => ({
    ...b,
    approved: b.events.filter(e => e.userStatus === "approved").length,
    rejected: b.events.filter(e => e.userStatus === "rejected_manual").length,
  }));

  // ── 3. Top reasons for blocking ────────────────────────────────────────────
  const reasonCounts: Record<string, number> = {};
  privateEvents.forEach(e => {
    if (!e.geminiReason) return;
    // Truncate to first sentence for grouping
    const key = e.geminiReason.split(".")[0].trim().slice(0, 80);
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  });
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxReasonCount = topReasons[0]?.[1] ?? 1;

  if (loading) return null;
  if (privateEvents.length === 0 && publicEvents.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-4">
        Public / Private Agent — Deep Dive
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* By source */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-white text-sm font-semibold mb-1">By Source</p>
          <p className="text-zinc-600 text-xs mb-4">How each source fares against the public filter.</p>
          {bySource.length === 0 ? (
            <p className="text-zinc-600 text-xs">No data yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left pb-2 text-zinc-600 font-medium">Source</th>
                  <th className="text-right pb-2 text-zinc-600 font-medium">Blocked</th>
                  <th className="text-right pb-2 text-zinc-600 font-medium">Passed</th>
                  <th className="text-right pb-2 text-zinc-600 font-medium">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {bySource.map(row => (
                  <tr key={row.src}>
                    <td className="py-2 text-zinc-300">{SOURCE_LABEL[row.src] ?? row.src}</td>
                    <td className="py-2 text-amber-400 text-right tabular-nums font-medium">{row.blocked}</td>
                    <td className="py-2 text-emerald-400 text-right tabular-nums font-medium">{row.passed}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.blocked > 0
                        ? <span className="text-red-400">{row.overridden}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Confidence distribution */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-white text-sm font-semibold mb-1">Confidence vs Outcome</p>
          <p className="text-zinc-600 text-xs mb-4">Does higher AI confidence mean better decisions?</p>

          {privateEvents.length > 0 && (
            <>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-2">Private decisions</p>
              <div className="space-y-2 mb-4">
                {confBuckets.map(b => (
                  <div key={b.label} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>{b.label}</span>
                      <span>{b.events.length} events · {b.overridden} overridden</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
                      {b.agreed > 0 && (
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${privateEvents.length > 0 ? (b.agreed / privateEvents.length) * 100 : 0}%` }}
                        />
                      )}
                      {b.overridden > 0 && (
                        <div
                          className="h-full bg-red-500 transition-all"
                          style={{ width: `${privateEvents.length > 0 ? (b.overridden / privateEvents.length) * 100 : 0}%` }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {publicEvents.length > 0 && (
            <>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-2">Public decisions</p>
              <div className="space-y-2">
                {pubConfBuckets.map(b => (
                  <div key={b.label} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>{b.label}</span>
                      <span>{b.events.length} events</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
                      {b.approved > 0 && (
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${publicEvents.length > 0 ? (b.approved / publicEvents.length) * 100 : 0}%` }}
                        />
                      )}
                      {b.rejected > 0 && (
                        <div
                          className="h-full bg-red-500"
                          style={{ width: `${publicEvents.length > 0 ? (b.rejected / publicEvents.length) * 100 : 0}%` }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-3 mt-4 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[10px] text-zinc-500">Agreed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-[10px] text-zinc-500">Overridden / rejected</span>
            </div>
          </div>
        </div>

        {/* Top block reasons */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-white text-sm font-semibold mb-1">Top Block Reasons</p>
          <p className="text-zinc-600 text-xs mb-4">Most common reasons the AI gives for flagging an event as private.</p>
          {topReasons.length === 0 ? (
            <p className="text-zinc-600 text-xs">No blocked events yet.</p>
          ) : (
            <div className="space-y-3">
              {topReasons.map(([reason, count]) => (
                <BarRow
                  key={reason}
                  label={reason}
                  value={count}
                  max={maxReasonCount}
                  color="#f59e0b"
                  sub={`${Math.round((count / privateEvents.length) * 100)}%`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TableRow({ agent, total, agreed, disagreed, pending, rate }: {
  agent: string; total: number; agreed: number; disagreed: number; pending: number; rate: number | null;
}) {
  return (
    <tr>
      <td className="px-5 py-3 text-zinc-300 text-sm">{agent}</td>
      <td className="px-5 py-3 text-zinc-400 text-sm text-right tabular-nums">{total}</td>
      <td className="px-5 py-3 text-emerald-400 text-sm text-right font-medium tabular-nums">{agreed}</td>
      <td className="px-5 py-3 text-red-400 text-sm text-right font-medium tabular-nums">{disagreed}</td>
      <td className="px-5 py-3 text-zinc-600 text-sm text-right tabular-nums">{pending}</td>
      <td className="px-5 py-3 text-right">
        {rate !== null ? (
          <span className={`text-sm font-semibold ${rate >= 70 ? "text-emerald-400" : rate >= 40 ? "text-amber-400" : "text-red-400"}`}>
            {rate}%
          </span>
        ) : (
          <span className="text-zinc-600 text-sm">—</span>
        )}
      </td>
    </tr>
  );
}
