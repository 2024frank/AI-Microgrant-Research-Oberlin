import { NextRequest, NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/adminAuthGuard";
import {
  getAccessRequestMysql,
  listPendingAccessRequestsMysql,
  markAccessRequestReviewedMysql,
} from "@/lib/userDirectory";
import { normalizeEmail } from "@/lib/userIds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const email = req.nextUrl.searchParams.get("email");
    if (email) {
      const request = await getAccessRequestMysql(normalizeEmail(email));
      return NextResponse.json({ request });
    }
    const rows = await listPendingAccessRequestsMysql();
    return NextResponse.json({ requests: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load access requests" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as {
      email?: string;
      status?: "approved" | "denied";
      reviewedBy?: string | null;
    };
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!email || !body.status || (body.status !== "approved" && body.status !== "denied")) {
      return NextResponse.json({ error: "email and status are required" }, { status: 400 });
    }
    await markAccessRequestReviewedMysql({
      email,
      status: body.status,
      reviewedBy: body.reviewedBy ?? guard.actor.email,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update access request" },
      { status: 500 },
    );
  }
}
