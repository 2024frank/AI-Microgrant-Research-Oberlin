import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json, text/html" },
      signal: AbortSignal.timeout(10000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const status = res.status;

    if (!res.ok) {
      return NextResponse.json({
        status,
        contentType,
        error: `HTTP ${status}`,
        body: (await res.text()).slice(0, 1000),
      });
    }

    if (contentType.includes("json")) {
      const data = await res.json();
      // Summarize the structure without sending full data
      const summary = summarizeJson(data, 3);
      const sampleStr = JSON.stringify(data, null, 2).slice(0, 3000);
      return NextResponse.json({
        status,
        contentType: "json",
        structure: summary,
        sample: sampleStr,
        totalKeys: typeof data === "object" ? Object.keys(data ?? {}).length : 0,
      });
    }

    if (contentType.includes("xml") || contentType.includes("rss") || contentType.includes("atom")) {
      const text = await res.text();
      return NextResponse.json({
        status,
        contentType: "xml/rss",
        sample: text.slice(0, 3000),
      });
    }

    if (contentType.includes("calendar") || url.endsWith(".ics")) {
      const text = await res.text();
      const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
      return NextResponse.json({
        status,
        contentType: "ical",
        eventCount,
        sample: text.slice(0, 2000),
      });
    }

    const text = await res.text();
    return NextResponse.json({
      status,
      contentType,
      sample: text.slice(0, 2000),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Probe failed",
    }, { status: 500 });
  }
}

function summarizeJson(data: unknown, depth: number): unknown {
  if (depth <= 0) return typeof data;
  if (data === null) return "null";
  if (Array.isArray(data)) {
    if (data.length === 0) return "[]";
    return [`Array(${data.length})`, summarizeJson(data[0], depth - 1)];
  }
  if (typeof data === "object") {
    const obj: Record<string, unknown> = {};
    const entries = Object.entries(data as Record<string, unknown>);
    for (const [key, val] of entries.slice(0, 15)) {
      if (Array.isArray(val)) {
        obj[key] = `Array(${val.length})` + (val.length > 0 ? ` → keys: ${typeof val[0] === "object" && val[0] ? Object.keys(val[0]).slice(0, 8).join(", ") : typeof val[0]}` : "");
      } else if (typeof val === "object" && val !== null) {
        obj[key] = `{${Object.keys(val).slice(0, 6).join(", ")}${Object.keys(val).length > 6 ? ", ..." : ""}}`;
      } else {
        obj[key] = typeof val === "string" ? (val.length > 80 ? val.slice(0, 80) + "…" : val) : val;
      }
    }
    if (entries.length > 15) obj["..."] = `${entries.length - 15} more keys`;
    return obj;
  }
  return data;
}
