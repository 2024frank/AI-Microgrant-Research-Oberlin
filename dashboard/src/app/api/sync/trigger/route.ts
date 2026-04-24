import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAIL  = "frankkusiap@gmail.com";
const GITHUB_OWNER = "2024frank";
const GITHUB_REPO  = "AI-Microgrant-Research-Oberlin";

const ghHeaders = (pat: string) => ({
  Authorization: `Bearer ${pat}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

// ─── Server-side TTL cache ────────────────────────────────────────────────────
// Stores the last-known GitHub status per workflow so that rapid dashboard
// polls (multiple browser tabs, 10-20s intervals × 3 workflows) don't each
// hit the GitHub API and trigger the secondary rate limit.
//
// TTL: 20 s — fresh enough for status updates, cheap enough on the API.
// When GitHub returns 403/429 we extend TTL to RATE_LIMIT_TTL_MS so the
// server stops hammering for a full minute.

const STATUS_TTL_MS      = 20_000;  // normal cache lifetime
const RATE_LIMIT_TTL_MS  = 60_000;  // back-off when rate-limited

type CachedStatus = {
  data: Record<string, unknown>;
  expiresAt: number;
};

const statusCache = new Map<string, CachedStatus>();

function getCached(workflow: string): Record<string, unknown> | null {
  const entry = statusCache.get(workflow);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { statusCache.delete(workflow); return null; }
  return entry.data;
}

function setCache(workflow: string, data: Record<string, unknown>, ttl = STATUS_TTL_MS) {
  statusCache.set(workflow, { data, expiresAt: Date.now() + ttl });
}

// ── POST — start a workflow run ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { workflow, idToken } = await req.json();
    if (!workflow || !idToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const pat = process.env.GITHUB_PAT;
    if (!pat) {
      return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 500 });
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: ghHeaders(pat),
        body: JSON.stringify({ ref: "main" }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    // Bust cache so the next poll fetches a fresh status immediately
    statusCache.delete(workflow);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ── GET — latest run status (with server-side TTL cache) ─────────────────────
export async function GET(req: NextRequest) {
  try {
    const workflow = req.nextUrl.searchParams.get("workflow");
    if (!workflow) return NextResponse.json({ error: "Missing workflow" }, { status: 400 });

    const pat = process.env.GITHUB_PAT;
    if (!pat) return NextResponse.json({ status: "unknown" });

    // Serve from cache if still fresh
    const cached = getCached(workflow);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/runs?per_page=1`,
      { headers: ghHeaders(pat) }
    );

    // Rate-limited — back off and return unknown rather than crashing the UI
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") || 60);
      const backoff    = Math.max(retryAfter * 1000, RATE_LIMIT_TTL_MS);
      const stale      = getCached(workflow); // return last known data if we have it
      const payload    = { ...(stale ?? { status: "unknown" }), rateLimited: true };
      setCache(workflow, payload, backoff);
      console.warn(`GitHub rate-limited for workflow ${workflow}; backing off ${backoff / 1000}s`);
      return NextResponse.json(payload);
    }

    if (!res.ok) return NextResponse.json({ status: "unknown" });

    const data = await res.json();
    const run  = data.workflow_runs?.[0];

    if (!run) {
      const payload = { status: "never_run" };
      setCache(workflow, payload);
      return NextResponse.json(payload);
    }

    // Check remaining quota — if below 100, extend cache TTL to reduce calls
    const remaining = Number(res.headers.get("X-RateLimit-Remaining") ?? 999);
    const ttl = remaining < 100 ? RATE_LIMIT_TTL_MS : STATUS_TTL_MS;

    const payload = {
      run_id:     run.id,
      status:     run.status,      // queued | in_progress | completed
      conclusion: run.conclusion,  // success | failure | cancelled | null
      startedAt:  run.created_at,
      updatedAt:  run.updated_at,
      url:        run.html_url,
    };

    setCache(workflow, payload, ttl);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}

// ── DELETE — cancel a running workflow run ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { run_id, idToken } = await req.json();
    if (!run_id || !idToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const pat = process.env.GITHUB_PAT;
    if (!pat) {
      return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 500 });
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${run_id}/cancel`,
      { method: "POST", headers: ghHeaders(pat) }
    );

    // GitHub returns 202 Accepted on success
    if (!res.ok && res.status !== 202) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    // Bust cache so the next poll picks up the new "cancelled" status
    statusCache.delete(`workflow_${run_id}`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
