import { NextRequest, NextResponse } from "next/server";
import { getSourceBuilderSession } from "@/lib/sourceBuilderAgent";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSourceBuilderSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ session });
}
