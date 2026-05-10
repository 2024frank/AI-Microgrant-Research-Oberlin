import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import type { SourceConfig } from "@/lib/sourceConfig";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { config } = await req.json();
  if (!config?.id || !config?.name) {
    return NextResponse.json({ error: "Config with id and name required" }, { status: 400 });
  }

  const sc = config as SourceConfig;

  await adminDb.collection("sourceConfigs").doc(sc.id).set({
    ...sc,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Also register in the sources collection so it shows on the Sources page
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

  return NextResponse.json({ success: true, id: sc.id });
}
