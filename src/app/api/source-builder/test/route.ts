import { NextRequest, NextResponse } from "next/server";
import { fetchWithConfig, type SourceConfig } from "@/lib/sourceConfig";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { config } = await req.json();
  if (!config) return NextResponse.json({ error: "Config required" }, { status: 400 });

  const result = await fetchWithConfig(config as SourceConfig, 10);

  return NextResponse.json({
    success: !result.error,
    eventCount: result.events.length,
    events: result.events.slice(0, 5),
    rawSample: result.raw.slice(0, 2),
    error: result.error,
  });
}
