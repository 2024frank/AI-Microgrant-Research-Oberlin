import { NextRequest, NextResponse } from "next/server";
import { fetchWithConfig, runCustomCode, type SourceConfig } from "@/lib/sourceConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { config, sourceCode } = await req.json();
  if (!config) return NextResponse.json({ error: "Config required" }, { status: 400 });

  let result;

  // Custom code: execute the provided code directly
  if (config.type === "custom_code" || sourceCode) {
    const code = sourceCode ?? config.sourceCode;
    if (!code) return NextResponse.json({ error: "No source code provided for custom_code source" }, { status: 400 });
    result = await runCustomCode(code, 10);
  } else {
    result = await fetchWithConfig(config as SourceConfig, 10);
  }

  return NextResponse.json({
    success: !result.error,
    eventCount: result.events.length,
    events: result.events.slice(0, 5),
    rawSample: result.raw.slice(0, 2),
    error: result.error,
  });
}
