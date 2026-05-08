"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";

type SourceStatus = "ready" | "needs-check" | "paused";

type AutomationReport = {
  id?: string;
  sourceId?: string;
  sourceName?: string;
  status?: "success" | "failed" | "partial";
  finishedAt?: string;
  found?: number;
  queued?: number;
  rejected?: number;
  duplicates?: number;
  recurringSkipped?: number;
  errors?: string[];
};

const SOURCES: Array<{
  id: string;
  name: string;
  url: string;
  method: string;
  cadence: string;
  status: SourceStatus;
  notes: string;
}> = [
  {
    id: "oberlin_college",
    name: "Oberlin College",
    url: "https://calendar.oberlin.edu",
    method: "Localist API",
    cadence: "hourly",
    status: "ready",
    notes: "Use Audience tag. Require Open to all members of the public. Reject athletics.",
  },
  {
    id: "amam",
    name: "Allen Memorial Art Museum",
    url: "https://amam.oberlin.edu/exhibitions-events/events",
    method: "agent scrape",
    cadence: "daily",
    status: "ready",
    notes: "Static event cards plus detail metadata. Public wording still checked.",
  },
  {
    id: "apollo_theatre",
    name: "Apollo Theatre",
    url: "https://www.clevelandcinemas.com/our-locations/x03gq-apollo-theatre/",
    method: "agent-discovered feed",
    cadence: "daily",
    status: "ready",
    notes: "One movie post with showtimes as sessions. Skip recurring-style series.",
  },
  {
    id: "heritage_center",
    name: "Oberlin Heritage Center",
    url: "https://www.oberlinheritagecenter.org/events/",
    method: "agent-discovered WordPress feed",
    cadence: "daily",
    status: "ready",
    notes: "WordPress event data is available; preserve source URL for review.",
  },
  {
    id: "oberlin_libcal",
    name: "Oberlin College Libraries",
    url: "https://oberlin.libcal.com/calendar/events",
    method: "agent-discovered LibCal feed",
    cadence: "daily",
    status: "ready",
    notes: "Library calendars often include public events and displays; reject internal-only items.",
  },
  {
    id: "fava",
    name: "FAVA Gallery",
    url: "https://www.favagallery.org/calendar",
    method: "agent scrape",
    cadence: "daily",
    status: "ready",
    notes: "Calendar links to class and event detail pages.",
  },
  {
    id: "oberlin_library",
    name: "Oberlin Public Library",
    url: "https://www.oberlinlibrary.org/events",
    method: "agent-discovered WhoFi feed",
    cadence: "daily",
    status: "ready",
    notes: "Events are in the embedded WhoFi calendar feed.",
  },
  {
    id: "city_of_oberlin",
    name: "City of Oberlin",
    url: "https://cityofoberlin.com/event/",
    method: "agent scrape",
    cadence: "daily",
    status: "ready",
    notes: "WordPress event pages are visible. Civic meetings can be queued when public.",
  },
  {
    id: "mad_factory",
    name: "MAD* Factory",
    url: "https://www.madfactory.org/tickets-events",
    method: "external automation scrape",
    cadence: "daily",
    status: "ready",
    notes: "Scrape tickets/events + performance pages. Extract sessions, og:image, and queue to Firestore review_queue.",
  },
  {
    id: "experience_oberlin",
    name: "Experience Oberlin",
    url: "https://www.experienceoberlin.com/events",
    method: "paused",
    cadence: "paused",
    status: "paused",
    notes: "Left out for now. Wix calendar data needs deeper widget extraction.",
  },
];

function timeAgo(iso?: string) {
  if (!iso) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusPill({ status }: { status: SourceStatus }) {
  const classes = {
    ready: "bg-emerald-400/10 text-emerald-300",
    "needs-check": "bg-amber-400/10 text-amber-300",
    paused: "bg-zinc-500/10 text-zinc-400",
  }[status];
  return <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${classes}`}>{status}</span>;
}

export default function SourcesPage() {
  const [reports, setReports] = useState<AutomationReport[]>([]);

  useEffect(() => {
    const db = getClientDb();
    const reportsQuery = query(collection(db, "automation_runs"), orderBy("finishedAt", "desc"), limit(30));
    const unsubscribe = onSnapshot(reportsQuery, snap => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as AutomationReport)));
    });
    return unsubscribe;
  }, []);

  function latestFor(sourceId: string) {
    return reports.find(r => r.sourceId === sourceId || r.sourceName === SOURCES.find(s => s.id === sourceId)?.name);
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <p className="text-[#C8102E] text-xs font-semibold uppercase tracking-wide mb-2">Automation inputs</p>
        <h1 className="text-white text-2xl font-bold tracking-tight">Sources</h1>
        <p className="text-zinc-500 text-sm mt-1 max-w-3xl">
          The runner should accept any source URL, discover feeds or scrape pages, skip recurring submissions, and report every run back here.
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden mb-6">
        <div className="grid grid-cols-[1.1fr_1fr_0.7fr_0.7fr] gap-4 px-5 py-3 border-b border-white/[0.06] text-zinc-500 text-[10px] uppercase tracking-wide">
          <span>Source</span>
          <span>Method</span>
          <span>Cadence</span>
          <span>Latest report</span>
        </div>

        {SOURCES.map(source => {
          const latest = latestFor(source.id);
          return (
            <div key={source.id} className="grid grid-cols-[1.1fr_1fr_0.7fr_0.7fr] gap-4 px-5 py-4 border-b border-white/[0.04] last:border-b-0 items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-white text-sm font-medium truncate">{source.name}</p>
                  <StatusPill status={source.status} />
                </div>
                <a className="text-zinc-500 hover:text-zinc-300 text-xs truncate block" href={source.url} target="_blank" rel="noreferrer">
                  {source.url}
                </a>
                <p className="text-zinc-600 text-xs mt-2 leading-relaxed">{source.notes}</p>
              </div>

              <div>
                <p className="text-zinc-300 text-sm">{source.method}</p>
                <p className="text-zinc-600 text-xs mt-2">
                  The agent should inspect visible HTML, embedded calendars, scripts, feeds, and detail links.
                </p>
              </div>

              <div>
                <p className="text-zinc-300 text-sm capitalize">{source.cadence}</p>
                {source.status !== "paused" && <p className="text-zinc-600 text-xs mt-2">Configurable later</p>}
              </div>

              <div>
                {latest ? (
                  <>
                    <p className="text-zinc-300 text-sm">{timeAgo(latest.finishedAt)}</p>
                    <p className="text-zinc-600 text-xs mt-2">
                      {latest.found ?? 0} found · {latest.queued ?? 0} queued · {latest.recurringSkipped ?? 0} recurring skipped
                    </p>
                  </>
                ) : (
                  <p className="text-zinc-600 text-sm">No run yet</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-2">Ready sources</p>
          <p className="text-white text-3xl font-bold">{SOURCES.filter(s => s.status === "ready").length}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-2">Paused</p>
          <p className="text-zinc-300 text-3xl font-bold">{SOURCES.filter(s => s.status === "paused").length}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-2">Recurring policy</p>
          <p className="text-amber-300 text-sm font-semibold">Do not submit recurring events</p>
          <p className="text-zinc-600 text-xs mt-1">Count them in automation reports instead.</p>
        </div>
      </div>
    </div>
  );
}
