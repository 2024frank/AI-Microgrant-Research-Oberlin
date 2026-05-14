import { NextRequest, NextResponse } from "next/server";

import { requireActiveAppUser } from "@/lib/adminAuthGuard";
import {
  deleteSourceConfigRecord,
  getSourceConfigRecord,
  listSourceConfigRecords,
  mergeSourceConfigRecord,
  upsertSourceConfigRecord,
} from "@/lib/sourceConfigsDb";
import type { SourceConfig } from "@/lib/sourceConfig";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const config = await getSourceConfigRecord(id);
      return NextResponse.json({ config });
    }
    const configs = await listSourceConfigRecords();
    return NextResponse.json({ configs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load source configs" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as { config?: SourceConfig };
    if (!body.config?.id) {
      return NextResponse.json({ error: "config with id required" }, { status: 400 });
    }
    await upsertSourceConfigRecord(body.config as SourceConfig & Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save source config" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as { id?: string; updates?: Partial<SourceConfig> };
    if (!body.id || !body.updates) {
      return NextResponse.json({ error: "id and updates required" }, { status: 400 });
    }
    await mergeSourceConfigRecord(body.id, body.updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update source config" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireActiveAppUser(req.headers.get("authorization"), "reviewer");
  if (!guard.ok) return guard.response;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
    }
    await deleteSourceConfigRecord(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete source config" },
      { status: 500 }
    );
  }
}
