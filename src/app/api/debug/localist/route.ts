import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await fetch(
    "https://calendar.oberlin.edu/api/2/events?pp=5&days=30&page=1",
    { headers: { Accept: "application/json" } }
  );
  const data = await res.json();
  const events = (data.events ?? []).map((e: { event: Record<string, unknown> }) => ({
    title: e.event.title,
    audiences: e.event.filters
      ? (e.event.filters as Record<string, unknown[]>).event_public_events ?? []
      : [],
    types: e.event.filters
      ? (e.event.filters as Record<string, unknown[]>).event_types ?? []
      : [],
  }));
  return NextResponse.json({ total: data.events?.length ?? 0, events });
}
