"use client";

import { useEffect, useState } from "react";
import { MapPin, Wifi, LayoutList, MapPinOff, Building2 } from "lucide-react";
import type { ReviewPost } from "@/lib/postTypes";

type LocationBreakdown = { label: string; count: number; pct: number; color: string; icon: React.ReactNode };
type VenueRow = { name: string; count: number; locationType: string };
type AreaRow = { area: string; count: number };

const OBERLIN_CAMPUS_KEYWORDS = [
  "wilder", "finney", "cat", "carnegie", "stevenson", "dye", "philips",
  "hall", "kahn", "mudd", "rice", "ballantine", "hales", "stull", "keck",
  "bibbins", "oberlin college", "apollo", "oberlin conservatory", "classroom",
];

const DOWNTOWN_KEYWORDS = [
  "main st", "south main", "college st", "lorain", "downtown", "oberlin public",
  "public library", "ymca", "hotel", "church", "square",
];

function classifyArea(location: string): string {
  const lower = location.toLowerCase();
  if (OBERLIN_CAMPUS_KEYWORDS.some((k) => lower.includes(k))) return "Oberlin Campus";
  if (DOWNTOWN_KEYWORDS.some((k) => lower.includes(k))) return "Downtown Oberlin";
  if (lower.includes("cleveland") || lower.includes("lorain county")) return "Greater Cleveland / Lorain";
  if (lower.includes("zoom") || lower.includes("teams") || lower.includes("meet.")) return "Online Platform";
  if (lower.length > 4) return "Other / Off-Campus";
  return "Unknown";
}

export default function GeoIntelPage() {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("@/lib/reviewStore").then(({ listAllReviewPosts }) =>
      listAllReviewPosts().then((p) => { setPosts(p); setLoading(false); })
    );
  }, []);

  const total = posts.length;
  const physical = posts.filter((p) => "locationType" in p && (p.locationType === "ph2" || p.locationType === "bo")).length;
  const online = posts.filter((p) => "locationType" in p && (p.locationType === "on" || p.locationType === "bo")).length;
  const hybrid = posts.filter((p) => "locationType" in p && p.locationType === "bo").length;
  const noLocation = posts.filter((p) => "locationType" in p && p.locationType === "ne").length;

  const breakdown: LocationBreakdown[] = [
    { label: "Physical", count: physical, pct: total ? Math.round((physical / total) * 100) : 0, color: "bg-[var(--primary)]", icon: <MapPin className="w-4 h-4" /> },
    { label: "Online Only", count: online - hybrid, pct: total ? Math.round(((online - hybrid) / total) * 100) : 0, color: "bg-teal-500", icon: <Wifi className="w-4 h-4" /> },
    { label: "Hybrid", count: hybrid, pct: total ? Math.round((hybrid / total) * 100) : 0, color: "bg-amber-500", icon: <LayoutList className="w-4 h-4" /> },
    { label: "No Location", count: noLocation, pct: total ? Math.round((noLocation / total) * 100) : 0, color: "bg-slate-500", icon: <MapPinOff className="w-4 h-4" /> },
  ];

  // Top venues
  const venueCounts: Record<string, { count: number; locationType: string }> = {};
  posts.forEach((p) => {
    if ("location" in p && p.location) {
      const venue = p.location.split(",")[0].trim();
      if (venue.length > 2) {
        if (!venueCounts[venue]) venueCounts[venue] = { count: 0, locationType: p.locationType ?? "ph2" };
        venueCounts[venue].count++;
      }
    }
  });
  const topVenues: VenueRow[] = Object.entries(venueCounts)
    .map(([name, { count, locationType }]) => ({ name, count, locationType }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Area classification
  const areaCounts: Record<string, number> = {};
  posts.forEach((p) => {
    const loc = "location" in p ? (p.location ?? "") : "";
    const urlLink = "urlLink" in p ? (p.urlLink ?? "") : "";
    const combined = loc || urlLink;
    if (combined.length > 2) {
      const area = classifyArea(combined);
      areaCounts[area] = (areaCounts[area] ?? 0) + 1;
    }
  });
  const areas: AreaRow[] = Object.entries(areaCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([area, count]) => ({ area, count }));

  const maxVenue = topVenues[0]?.count ?? 1;
  const maxArea = areas[0]?.count ?? 1;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Geographic Intelligence
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Location type breakdown, venue hotspots, and area coverage across all queued events.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : total === 0 ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
          <div className="text-center">
            <MapPin className="mx-auto text-teal-400 mb-3" size={40} />
            <p className="font-semibold text-[var(--text)]">No events ingested yet.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Run the pipeline to populate geographic data.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Location type stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {breakdown.map(({ label, count, pct, icon }) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 flex items-start gap-3">
                <div className="p-2 rounded-md bg-[var(--surface)] text-[var(--muted)] shrink-0">{icon}</div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">{label}</p>
                  <p className="text-2xl font-bold text-[var(--text)] mt-0.5">{count}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{pct}% of all events</p>
                </div>
              </div>
            ))}
          </div>

          {/* Location type distribution bar */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
            <h2 className="font-semibold text-[var(--text)] mb-4">Location Type Distribution</h2>
            <div className="flex h-5 rounded-full overflow-hidden gap-px">
              {breakdown.filter((b) => b.count > 0).map(({ label, pct, color }) => (
                <div key={label} className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} title={`${label}: ${pct}%`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-[var(--muted)]">
              {breakdown.filter((b) => b.count > 0).map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-sm inline-block ${color}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* Top venues */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-[var(--muted)]" />
                <h2 className="font-semibold text-[var(--text)]">Top Venues</h2>
              </div>
              {topVenues.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No physical locations found.</p>
              ) : (
                <div className="space-y-2.5">
                  {topVenues.map(({ name, count }) => (
                    <div key={name} className="flex items-center gap-3 text-sm">
                      <span className="w-40 xl:w-48 shrink-0 truncate text-[var(--muted)]" title={name}>{name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--primary)] rounded-full"
                          style={{ width: `${Math.round((count / maxVenue) * 100)}%` }}
                        />
                      </div>
                      <span className="w-5 text-right text-[var(--muted)] tabular-nums shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Area breakdown */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-[var(--muted)]" />
                <h2 className="font-semibold text-[var(--text)]">Area Coverage</h2>
              </div>
              {areas.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No location data to classify.</p>
              ) : (
                <div className="space-y-2.5">
                  {areas.map(({ area, count }) => (
                    <div key={area} className="flex items-center gap-3 text-sm">
                      <span className="w-44 shrink-0 truncate text-[var(--muted)]">{area}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${Math.round((count / maxArea) * 100)}%` }}
                        />
                      </div>
                      <span className="w-5 text-right text-[var(--muted)] tabular-nums shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--muted)] mt-4">
                Areas classified by venue name using known Oberlin campus and downtown keywords.
              </p>
            </div>
          </div>

          {/* Full venue table */}
          {topVenues.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)]">
                <h2 className="font-semibold text-[var(--text)]">All Venues</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-high)]">
                    <tr>
                      {["Venue", "Location Type", "Events"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] border-b border-[var(--border)]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topVenues.map(({ name, count, locationType }) => (
                      <tr key={name} className="border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-[var(--text)]">{name}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {locationType === "ph2" ? "Physical" : locationType === "bo" ? "Hybrid" : locationType === "on" ? "Online" : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)] tabular-nums">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
