import { NextResponse } from "next/server";
import { ensureDefaultSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function POST() {
  await ensureDefaultSources();
  return NextResponse.json({ success: true });
}
