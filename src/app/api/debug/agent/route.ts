import { NextRequest, NextResponse } from "next/server";
import {
  getSourceBuilderAgentConfig,
  retrieveSourceBuilderAgent,
} from "@/lib/sourceBuilderAgent";

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, configured: false, error: "ANTHROPIC_API_KEY is missing" },
      { status: 500 }
    );
  }

  try {
    const config = getSourceBuilderAgentConfig();
    if (!config.agentId) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          provider: "anthropic-managed-agents",
          error: "SOURCE_BUILDER_AGENT_ID is missing",
        },
        { status: 500 }
      );
    }

    const agent = await retrieveSourceBuilderAgent();

    return NextResponse.json({
      ok: true,
      configured: true,
      provider: "anthropic-managed-agents",
      sourceBuilderOnly: true,
      agent,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        provider: "anthropic-managed-agents",
        sourceBuilderOnly: true,
        error: err instanceof Error ? err.message : "Source Builder agent test failed",
      },
      { status: 500 }
    );
  }
}
