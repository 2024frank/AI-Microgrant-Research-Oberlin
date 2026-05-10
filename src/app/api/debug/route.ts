import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Check env vars (mask sensitive values)
  results.env = {
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT
      ? `✓ set (${process.env.FIREBASE_SERVICE_ACCOUNT.length} chars)`
      : "✗ MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
      ? `✓ set (${process.env.GEMINI_API_KEY.length} chars)`
      : "✗ MISSING",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "✓ set" : "✗ MISSING",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "✗ MISSING",
  };

  // Test Firebase Admin connection
  try {
    const { adminDb } = await import("@/lib/firebaseAdmin");
    await adminDb.collection("pipelineJobs").limit(1).get();
    results.firestore = "✓ connected";
  } catch (err) {
    results.firestore = `✗ ${err instanceof Error ? err.message : String(err)}`;
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
