import { NextRequest, NextResponse } from "next/server";

import { requireSignedIn } from "@/lib/adminAuthGuard";
import { submitAccessRequestMysql } from "@/lib/userDirectory";
import { normalizeEmail } from "@/lib/userIds";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireSignedIn(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      message?: string;
      displayName?: string | null;
      photoURL?: string | null;
    };
    const email = normalizeEmail(guard.decoded.email!);
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : typeof guard.decoded.name === "string"
          ? guard.decoded.name
          : null;
    const photoURL =
      typeof body.photoURL === "string" && body.photoURL.trim()
        ? body.photoURL.trim()
        : typeof guard.decoded.picture === "string"
          ? guard.decoded.picture
          : null;

    const { row, alreadyPending } = await submitAccessRequestMysql({
      email,
      displayName,
      photoURL,
      message: body.message,
    });
    return NextResponse.json({ request: row, alreadyPending });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit request" },
      { status: 500 },
    );
  }
}
