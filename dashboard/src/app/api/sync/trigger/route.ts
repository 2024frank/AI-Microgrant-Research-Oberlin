import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "frankkusiap@gmail.com";
const GITHUB_OWNER = "2024frank";
const GITHUB_REPO = "AI-Microgrant-Research-Oberlin";

const ghHeaders = (pat: string) => ({
  Authorization: `Bearer ${pat}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

// ── POST /api/sync/trigger — start a workflow run ─────────────────────────────
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

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// ── GET /api/sync/trigger?workflow=sync.yml — latest run status ───────────────
export async function GET(req: NextRequest) {
  try {
    const workflow = req.nextUrl.searchParams.get("workflow");
    if (!workflow) return NextResponse.json({ error: "Missing workflow" }, { status: 400 });

    const pat = process.env.GITHUB_PAT;
    if (!pat) return NextResponse.json({ status: "unknown" });

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/runs?per_page=1`,
      { headers: ghHeaders(pat) }
    );
    if (!res.ok) return NextResponse.json({ status: "unknown" });

    const data = await res.json();
    const run = data.workflow_runs?.[0];
    if (!run) return NextResponse.json({ status: "never_run" });

    return NextResponse.json({
      run_id: run.id,
      status: run.status,         // queued | in_progress | completed
      conclusion: run.conclusion, // success | failure | cancelled | null
      startedAt: run.created_at,
      updatedAt: run.updated_at,
      url: run.html_url,
    });
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}

// ── DELETE /api/sync/trigger — cancel a running workflow run ──────────────────
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
      {
        method: "POST",
        headers: ghHeaders(pat),
      }
    );

    // GitHub returns 202 Accepted on success
    if (!res.ok && res.status !== 202) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
