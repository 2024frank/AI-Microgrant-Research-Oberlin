import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (
    req.headers.get("x-debug-secret") === secret ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const results: Record<string, unknown> = {};

  // Check env vars (mask sensitive values)
  results.env = {
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT
      ? `✓ set (${process.env.FIREBASE_SERVICE_ACCOUNT.length} chars)`
      : "✗ MISSING",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
      ? `✓ set (${process.env.ANTHROPIC_API_KEY.length} chars)`
      : "✗ MISSING",
    SOURCE_BUILDER_AGENT_ID: process.env.SOURCE_BUILDER_AGENT_ID
      ? "✓ set"
      : "✗ MISSING",
    SOURCE_BUILDER_ENVIRONMENT_ID: process.env.SOURCE_BUILDER_ENVIRONMENT_ID
      ? "✓ set"
      : "✗ MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
      ? `✓ set (${process.env.GEMINI_API_KEY.length} chars)`
      : "✗ MISSING",
    DATABASE_USERNAME: process.env.DATABASE_USERNAME ? "✓ set" : "✗ MISSING",
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD ? "✓ set" : "✗ MISSING",
    DATABASE_HOST: process.env.DATABASE_HOST ? "✓ set" : "✗ MISSING",
    DATABASE_PORT: process.env.DATABASE_PORT ? "✓ set" : "✗ MISSING",
    DATABASE_NAME: process.env.DATABASE_NAME ? "✓ set" : "✗ MISSING",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "✓ set" : "✗ MISSING",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "✗ MISSING",
  };

  // Test MySQL connection
  try {
    const { ensureMysqlSchema, getMysqlPool } = await import("@/lib/mysql");
    await ensureMysqlSchema();
    await getMysqlPool().query("SELECT 1");
    results.mysql = "✓ connected";
  } catch (err) {
    results.mysql = `✗ ${err instanceof Error ? err.message : String(err)}`;
  }

  // Test Localist API
  try {
    const res = await fetch(
      "https://calendar.oberlin.edu/api/2/events?pp=1&days=1",
      { signal: AbortSignal.timeout(5000) }
    );
    results.localist = res.ok ? `✓ reachable (${res.status})` : `✗ status ${res.status}`;
  } catch (err) {
    results.localist = `✗ ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(results, { status: 200 });
}
