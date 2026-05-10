import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import type { SourceConfig } from "@/lib/sourceConfig";

export const dynamic = "force-dynamic";

const GITHUB_REPO = process.env.GITHUB_REPO ?? "2024frank/ai-microgrant";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SOURCE_FILE_PATH = (id: string) => `src/data/sourceConfigs/${id}.json`;

async function commitConfigToGitHub(sc: SourceConfig): Promise<{ committed: boolean; url?: string; error?: string }> {
  if (!GITHUB_TOKEN) return { committed: false, error: "GITHUB_TOKEN not set" };

  const filePath = SOURCE_FILE_PATH(sc.id);
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const content = Buffer.from(JSON.stringify(sc, null, 2) + "\n").toString("base64");

  // Check if file already exists (need SHA to update)
  let existingSha: string | undefined;
  try {
    const check = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (check.ok) {
      const existing = await check.json() as { sha: string };
      existingSha = existing.sha;
    }
  } catch { /* file doesn't exist yet */ }

  const body: Record<string, string> = {
    message: `feat(sources): add ${sc.name} source config [Source Builder]`,
    content,
    branch: "main",
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { committed: false, error: `GitHub API error: ${res.status} — ${err.slice(0, 200)}` };
  }

  const data = await res.json() as { content: { html_url: string } };
  return { committed: true, url: data.content?.html_url };
}

export async function POST(req: NextRequest) {
  const { config } = await req.json();
  if (!config?.id || !config?.name) {
    return NextResponse.json({ error: "Config with id and name required" }, { status: 400 });
  }

  const sc = config as SourceConfig;

  // Save to Firestore
  await adminDb.collection("sourceConfigs").doc(sc.id).set({
    ...sc,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Register in sources collection so it shows on the Sources page
  await adminDb.collection("sources").doc(sc.id).set({
    id: sc.id,
    name: sc.name,
    description: sc.description,
    schedule: sc.schedule ?? "off",
    scheduleHour: sc.scheduleHour ?? 6,
    lastRun: null,
    nextRun: null,
    createdAt: Date.now(),
  }, { merge: true });

  // Commit the config file to GitHub
  const github = await commitConfigToGitHub(sc);

  return NextResponse.json({ success: true, id: sc.id, github });
}
